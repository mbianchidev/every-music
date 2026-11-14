import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import { entitlementRepository } from '../repositories/entitlement-repository.js';
import { PLAN_FEATURES, deliverySql } from './notification-channels.js';

const PAGE = 200;
// Invite nudges are only created during this window after the nudge age, which
// is shorter than the 90-day notification retention that keeps keys unique.
const INVITE_WINDOW_DAYS = 30;
const NIL = '00000000-0000-0000-0000-000000000000';

const DIGESTS = [
  {
    kind: 'announcement_stats', prefix: 'announcement-stats', metrics: ['announcement_view', 'like', 'save'],
    title: 'Your weekly announcement statistics',
    params: row => ({ views: row.views, likes: row.likes, saves: row.saves }),
  },
  {
    kind: 'profile_stats', prefix: 'profile-stats', metrics: ['profile_view'],
    title: 'Your weekly profile statistics',
    params: row => ({ views: row.profileViews }),
  },
];

// Scheduled notifications. Every job is idempotent through event keys, and
// notification_job_runs lets only one API process run a job per interval.
export class NotificationScheduler {
  constructor({
    settings = realmConfig.notifications,
    connector = realmConnector,
    entitlements = entitlementRepository,
    logger = console,
  } = {}) {
    this.settings = settings;
    this.connector = connector;
    this.entitlements = entitlements;
    this.logger = logger;
  }

  async claim(name, minutes = this.settings.jobIntervalMinutes) {
    const { rows } = await this.connector.execute(`
      INSERT INTO notification_job_runs (name, last_run_at) VALUES ($1, NOW())
      ON CONFLICT (name) DO UPDATE SET last_run_at = NOW()
      WHERE notification_job_runs.last_run_at <= NOW() - make_interval(mins => $2::int)
      RETURNING name`, [name, minutes]);
    return rows.length > 0;
  }

  async run() {
    const jobs = [
      ['notification_cleanup', () => this.cleanup()],
      ['stats_digests', () => this.weeklyDigests()],
      ['come_back', () => this.comeBack()],
      ['invite_friends', () => this.inviteNudges()],
    ];
    for (const [name, job] of jobs) {
      try {
        if (await this.claim(name)) await job();
      } catch (error) {
        this.logger.error({ err: error, job: name }, 'Scheduled notification job failed');
      }
    }
  }

  async cleanup() {
    await this.connector.execute(`
      UPDATE notifications SET email_status = 'expired'
      WHERE email_status = 'pending' AND created_at <= NOW() - INTERVAL '1 day'`);
    await this.connector.execute(`
      DELETE FROM notification_channel_preferences WHERE in_app IS NULL AND push IS NULL AND email IS NULL`);
    await this.connector.execute("DELETE FROM notification_job_runs WHERE last_run_at < NOW() - INTERVAL '30 days'");
  }

  // Weekly totals for the previous seven full days, once per ISO week from the
  // configured weekday. Only users who opted in to analytics, chose a channel
  // for the digest, and whose plan includes the statistics receive one.
  async weeklyDigests() {
    const { rows: [period] } = await this.connector.execute(`
      SELECT to_char(CURRENT_DATE, 'IYYY-"W"IW') AS week, EXTRACT(ISODOW FROM CURRENT_DATE)::int AS weekday`);
    const created = {};
    for (const digest of DIGESTS) {
      created[digest.kind] = period.weekday < this.settings.statsDigestWeekday ? 0 : await this.digest(digest, period.week);
    }
    return created;
  }

  async digest({ kind, prefix, metrics, title, params }, week) {
    const delivery = deliverySql(kind);
    const keyPrefix = `${prefix}:${week}`;
    const feature = PLAN_FEATURES[kind];
    let created = 0;
    let after = NIL;
    for (;;) {
      const { rows } = await this.connector.execute(`
        SELECT a.user_id AS "userId",
          COALESCE(SUM(a.count) FILTER (WHERE a.kind = 'announcement_view'), 0)::int AS views,
          COALESCE(SUM(a.count) FILTER (WHERE a.kind = 'like'), 0)::int AS likes,
          COALESCE(SUM(a.count) FILTER (WHERE a.kind = 'save'), 0)::int AS saves,
          COALESCE(SUM(a.count) FILTER (WHERE a.kind = 'profile_view'), 0)::int AS "profileViews"
        FROM analytics_daily a JOIN users u ON u.id = a.user_id ${delivery.joins}
        WHERE a.day >= CURRENT_DATE - 7 AND a.day < CURRENT_DATE AND a.kind = ANY($1::text[])
          AND a.user_id > $2::uuid AND COALESCE(p.analytics, FALSE) = TRUE
          AND u.is_active = TRUE AND u.is_deleted = FALSE AND ${delivery.deliverable}
          AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.event_key = $3 || ':' || a.user_id::text)
        GROUP BY a.user_id HAVING SUM(a.count) >= $4
        ORDER BY a.user_id LIMIT ${PAGE}`, [metrics, after, keyPrefix, this.settings.statsDigestMinimum]);
      if (!rows.length) break;
      after = rows.at(-1).userId;
      created += await this.connector.transaction(async (executor) => {
        let count = 0;
        for (const row of rows) {
          const { limits } = await this.entitlements.limitsFor(row.userId, executor);
          if (feature && !limits[feature]) continue;
          if (await notificationRepository.create(executor, {
            userId: row.userId, kind, title, link: '#analytics', key: `${keyPrefix}:${row.userId}`,
            params: { ...params(row), week },
          })) count += 1;
        }
        return count;
      });
      if (rows.length < PAGE) break;
    }
    return created;
  }

  // At most one reminder per inactivity period, keyed by the last sign-in and
  // the period number so a new streak starts over after the user returns.
  async comeBack() {
    const { comeBackAfterDays: days, comeBackMaxReminders: maximum } = this.settings;
    if (!maximum) return 0;
    const delivery = deliverySql('come_back');
    let created = 0;
    let after = NIL;
    for (;;) {
      const { rows } = await this.connector.execute(`
        SELECT * FROM (
          SELECT u.id AS "userId",
            'come-back:' || u.id::text || ':' || EXTRACT(EPOCH FROM date_trunc('second', COALESCE(u.last_login, u.created_at)))::bigint::text
              || ':' || FLOOR(EXTRACT(EPOCH FROM (LOCALTIMESTAMP - COALESCE(u.last_login, u.created_at))) / ($1::int * 86400))::int::text AS key,
            FLOOR(EXTRACT(EPOCH FROM (LOCALTIMESTAMP - COALESCE(u.last_login, u.created_at))) / ($1::int * 86400))::int AS period
          FROM users u ${delivery.joins}
          WHERE u.id > $3::uuid AND u.is_active = TRUE AND u.is_deleted = FALSE AND ${delivery.deliverable}
            AND COALESCE(u.last_login, u.created_at) <= LOCALTIMESTAMP - make_interval(days => $1::int)
        ) due
        WHERE period BETWEEN 1 AND $2::int AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.event_key = due.key)
        ORDER BY "userId" LIMIT ${PAGE}`, [days, maximum, after]);
      if (!rows.length) break;
      after = rows.at(-1).userId;
      created += await this.connector.transaction(async (executor) => {
        let count = 0;
        for (const row of rows) {
          if (await notificationRepository.create(executor, {
            userId: row.userId, kind: 'come_back', title: 'We miss you on Every.music', link: '#feed', key: row.key,
            params: { days },
          })) count += 1;
        }
        return count;
      });
      if (rows.length < PAGE) break;
    }
    return created;
  }

  async inviteNudges() {
    const days = this.settings.inviteNudgeAfterDays;
    const delivery = deliverySql('invite_friends');
    let created = 0;
    let after = NIL;
    for (;;) {
      const { rows } = await this.connector.execute(`
        SELECT u.id FROM users u ${delivery.joins}
        WHERE u.id > $2::uuid AND u.is_active = TRUE AND u.is_deleted = FALSE AND ${delivery.deliverable}
          AND u.created_at <= LOCALTIMESTAMP - make_interval(days => $1::int)
          AND u.created_at > LOCALTIMESTAMP - make_interval(days => $1::int + ${INVITE_WINDOW_DAYS})
          AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.event_key = 'invite-friends:' || u.id::text)
        ORDER BY u.id LIMIT ${PAGE}`, [days, after]);
      if (!rows.length) break;
      after = rows.at(-1).id;
      created += (await this.connector.transaction(executor => notificationRepository.createMany(executor, rows.map(row => row.id), {
        kind: 'invite_friends', title: 'Invite musician friends to Every.music', link: '#invite',
        keyPrefix: 'invite-friends', params: { days },
      }))).length;
      if (rows.length < PAGE) break;
    }
    return created;
  }
}
