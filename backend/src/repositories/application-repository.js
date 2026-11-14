import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';
import { publishEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import {
  APPLICATION_DAILY_LIMIT, DEFAULT_RETENTION_DAYS, NOTIFIED_STATUSES,
  announcementClosedSql, applicantStatus, normalizeApplication, normalizeOwnerNote,
  retentionEndsAt, statusNotificationTitle,
} from '../engines/application-rules.js';

const closed = announcementClosedSql('a', 'o');
const selectedInstruments = `
  (SELECT COALESCE(jsonb_agg(jsonb_build_object('instrumentId', i.id, 'name', i.name) ORDER BY i.name), '[]'::jsonb)
    FROM application_instruments ai JOIN instruments i ON i.id = ai.instrument_id
    WHERE ai.application_id = ap.id) AS instruments`;
const profileInstruments = `
  (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'instrumentId', i.id, 'name', i.name, 'skillLevel', ui.skill_level, 'yearsExperience', ui.years_experience
    ) ORDER BY i.name), '[]'::jsonb)
    FROM user_instruments ui JOIN instruments i ON i.id = ui.instrument_id
    WHERE ui.profile_id = p.id) AS profile_instruments`;
const activeApplicant = 'EXISTS(SELECT 1 FROM users u WHERE u.id = ap.applicant_id AND u.is_active AND NOT u.is_deleted)';
const withinRetention = index => `(ap.closed_at IS NULL OR ap.closed_at > NOW() - make_interval(days => $${index}::int))`;

function applicantView(row) {
  const isClosed = Boolean(row.is_closed);
  return {
    id: row.id,
    status: applicantStatus(row.status, isClosed),
    message: row.message,
    instruments: row.instruments ?? [],
    links: row.links ?? [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    withdrawnAt: row.withdrawn_at,
    announcement: {
      id: row.announcement_id, title: row.announcement_title, isOpen: !isClosed,
      ownerId: row.owner_id, ownerName: row.owner_name || 'Musician',
    },
  };
}

class ApplicationRepository {
  constructor(retentionDays = DEFAULT_RETENTION_DAYS) {
    this.retentionDays = retentionDays;
  }

  ownerView(row) {
    const isClosed = Boolean(row.is_closed);
    return {
      id: row.id,
      status: row.status,
      message: row.message,
      ownerNote: row.owner_note,
      instruments: row.instruments ?? [],
      links: row.links ?? [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      statusChangedAt: row.status_changed_at,
      canMessage: Boolean(row.can_message),
      announcement: {
        id: row.announcement_id, title: row.announcement_title, isOpen: !isClosed,
        retentionEndsAt: isClosed ? retentionEndsAt(row.closed_at, this.retentionDays) : null,
      },
      applicant: {
        userId: row.applicant_id, profileId: row.profile_id, artistName: row.artist_name || 'Musician',
        pictureUrl: row.profile_picture_url, city: row.city, instruments: row.profile_instruments ?? [],
      },
    };
  }

  async apply(userId, announcementId, input) {
    const application = normalizeApplication(input);
    return realmConnector.transaction(async (executor) => {
      // Serializes one account's applications so the daily limit cannot be raced.
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const { rows: announcements } = await executor.execute(`
        SELECT a.id, a.user_id, a.title FROM announcements a JOIN users o ON o.id = a.user_id
        WHERE a.id = $1 AND NOT ${closed} FOR SHARE OF a`, [announcementId]);
      const announcement = announcements[0];
      if (!announcement) throw requestError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
      if (announcement.user_id === userId) throw requestError(403, 'OWN_ANNOUNCEMENT', 'You cannot apply to your own announcement');
      const { rows: blocked } = await executor.execute(`
        SELECT 1 FROM blocked_users WHERE (user_id = $1 AND blocked_user_id = $2) OR (user_id = $2 AND blocked_user_id = $1)`,
      [userId, announcement.user_id]);
      if (blocked.length) throw requestError(403, 'APPLICATION_UNAVAILABLE', 'You cannot apply to this announcement');
      const { rows: recent } = await executor.execute(`
        SELECT COUNT(*)::int AS count FROM announcement_applications
        WHERE applicant_id = $1 AND created_at > NOW() - INTERVAL '1 day'`, [userId]);
      if (recent[0].count >= APPLICATION_DAILY_LIMIT) {
        throw requestError(429, 'APPLICATION_LIMIT', `At most ${APPLICATION_DAILY_LIMIT} applications can be sent per day`);
      }
      if (application.instrumentIds.length) {
        const { rows } = await executor.execute(`
          SELECT instrument_id FROM announcement_instruments
          WHERE announcement_id = $1 AND instrument_id = ANY($2::uuid[])`, [announcement.id, application.instrumentIds]);
        if (rows.length !== application.instrumentIds.length) {
          throw requestError(400, 'INVALID_INSTRUMENTS', 'Choose instruments listed on this announcement');
        }
      }
      const { rows } = await executor.execute(`
        INSERT INTO announcement_applications (announcement_id, applicant_id, message, links)
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (announcement_id, applicant_id) WHERE status <> 'withdrawn' DO NOTHING
        RETURNING id`, [announcement.id, userId, application.message, JSON.stringify(application.links)]);
      if (!rows.length) throw requestError(409, 'ALREADY_APPLIED', 'You already applied to this announcement');
      const { id } = rows[0];
      if (application.instrumentIds.length) {
        await executor.execute(`
          INSERT INTO application_instruments (application_id, instrument_id)
          SELECT $1, unnest($2::uuid[])`, [id, application.instrumentIds]);
      }
      const { rows: names } = await executor.execute('SELECT artist_name FROM profiles WHERE user_id = $1', [userId]);
      await notificationRepository.create(executor, {
        userId: announcement.user_id, kind: 'application_received', title: 'New application for your announcement',
        link: `#applications?announcement=${announcement.id}`, key: `application:${id}`,
        params: {
          applicationId: id, announcementId: announcement.id, title: announcement.title,
          applicantName: names[0]?.artist_name || 'Musician',
        },
      });
      await publishEvent(executor, 'applications.changed', { userId: announcement.user_id, id: announcement.id });
      await publishEvent(executor, 'applications.changed', { userId, id: announcement.id });
      return (await this.applicantRows(executor, userId, { id })).at(0);
    });
  }

  async applicantRows(executor, userId, { id, announcementId, page, pageSize } = {}) {
    const params = [userId];
    const where = ['ap.applicant_id = $1'];
    if (id) { params.push(id); where.push(`ap.id = $${params.length}`); }
    if (announcementId) { params.push(announcementId); where.push(`ap.announcement_id = $${params.length}`, "ap.status <> 'withdrawn'"); }
    let limit = '';
    if (pageSize) {
      params.push(pageSize + 1, (page - 1) * pageSize);
      limit = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }
    const { rows } = await executor.execute(`
      SELECT ap.id, ap.status, ap.message, ap.links, ap.created_at, ap.updated_at, ap.withdrawn_at,
        a.id AS announcement_id, a.title AS announcement_title, ${closed} AS is_closed,
        a.user_id AS owner_id, op.artist_name AS owner_name, ${selectedInstruments}
      FROM announcement_applications ap
      JOIN announcements a ON a.id = ap.announcement_id
      JOIN users o ON o.id = a.user_id
      LEFT JOIN profiles op ON op.user_id = a.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY ap.created_at DESC, ap.id DESC ${limit}`, params);
    return rows.map(applicantView);
  }

  async mine(userId, page) {
    return this.applicantRows(realmConnector, userId, page);
  }

  async mineFor(userId, announcementId) {
    return (await this.applicantRows(realmConnector, userId, { announcementId })).at(0) ?? null;
  }

  ownerScope(ownerId, { announcementId, instrumentId } = {}) {
    const params = [ownerId, this.retentionDays];
    const where = ['a.user_id = $1', "ap.status <> 'withdrawn'", activeApplicant, withinRetention(2)];
    if (announcementId) { params.push(announcementId); where.push(`a.id = $${params.length}`); }
    if (instrumentId) {
      params.push(instrumentId);
      where.push(`EXISTS(SELECT 1 FROM application_instruments ai WHERE ai.application_id = ap.id AND ai.instrument_id = $${params.length})`);
    }
    return { params, where };
  }

  async ownerRows(executor, ownerId, filters = {}, page = null) {
    const { params, where } = this.ownerScope(ownerId, filters);
    if (filters.id) { params.push(filters.id); where.push(`ap.id = $${params.length}`); }
    if (filters.status) { params.push(filters.status); where.push(`ap.status = $${params.length}`); }
    let limit = '';
    if (page) {
      params.push(page.pageSize + 1, (page.page - 1) * page.pageSize);
      limit = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }
    const direction = filters.sort === 'oldest' ? 'ASC' : 'DESC';
    const { rows } = await executor.execute(`
      SELECT ap.id, ap.status, ap.message, ap.owner_note, ap.links, ap.created_at, ap.updated_at,
        ap.status_changed_at, ap.closed_at, ap.applicant_id,
        a.id AS announcement_id, a.title AS announcement_title, ${closed} AS is_closed,
        p.id AS profile_id, p.artist_name, p.profile_picture_url, p.city,
        ${selectedInstruments}, ${profileInstruments},
        NOT EXISTS(SELECT 1 FROM blocked_users b
          WHERE (b.user_id = $1 AND b.blocked_user_id = ap.applicant_id)
             OR (b.user_id = ap.applicant_id AND b.blocked_user_id = $1)) AS can_message
      FROM announcement_applications ap
      JOIN announcements a ON a.id = ap.announcement_id
      JOIN users o ON o.id = a.user_id
      LEFT JOIN profiles p ON p.user_id = ap.applicant_id
      WHERE ${where.join(' AND ')}
      ORDER BY ap.created_at ${direction}, ap.id ${direction} ${limit}`, params);
    return rows.map(row => this.ownerView(row));
  }

  async counts(ownerId, filters) {
    const { params, where } = this.ownerScope(ownerId, filters);
    const { rows } = await realmConnector.execute(`
      SELECT ap.status, COUNT(*)::int AS count
      FROM announcement_applications ap JOIN announcements a ON a.id = ap.announcement_id
      WHERE ${where.join(' AND ')} GROUP BY ap.status`, params);
    const counts = { total: 0, new: 0, shortlisted: 0, accepted: 0, declined: 0 };
    for (const row of rows) { counts[row.status] = row.count; counts.total += row.count; }
    return counts;
  }

  // Own announcements with their application counts. The list holds open calls
  // and closed calls that still have applications inside the retention period;
  // a single lookup also finds an undeleted draft or expired call.
  async announcements(ownerId, { id, page, pageSize } = {}) {
    const params = [ownerId, this.retentionDays];
    if (id) params.push(id);
    let limit = '';
    if (pageSize) {
      params.push(pageSize + 1, (page - 1) * pageSize);
      limit = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }
    const { rows } = await realmConnector.execute(`
      SELECT a.id, a.title, a.created_at, ${closed} AS is_closed, MIN(ap.closed_at) AS closed_at,
        COUNT(ap.id)::int AS total,
        COUNT(ap.id) FILTER (WHERE ap.status = 'new')::int AS new,
        COUNT(ap.id) FILTER (WHERE ap.status = 'shortlisted')::int AS shortlisted,
        COUNT(ap.id) FILTER (WHERE ap.status = 'accepted')::int AS accepted,
        COUNT(ap.id) FILTER (WHERE ap.status = 'declined')::int AS declined,
        MAX(ap.created_at) AS latest_at
      FROM announcements a JOIN users o ON o.id = a.user_id
      LEFT JOIN announcement_applications ap ON ap.announcement_id = a.id AND ap.status <> 'withdrawn'
        AND ${activeApplicant} AND ${withinRetention(2)}
      WHERE a.user_id = $1 ${id ? 'AND a.id = $3' : ''}
      GROUP BY a.id, o.id
      HAVING ${id ? 'a.is_deleted IS NOT TRUE' : `NOT ${closed}`} OR COUNT(ap.id) > 0
      ORDER BY MAX(ap.created_at) DESC NULLS LAST, a.created_at DESC, a.id ${limit}`, params);
    return rows.map(row => ({
      id: row.id,
      title: row.title,
      isOpen: !row.is_closed,
      retentionEndsAt: row.is_closed ? retentionEndsAt(row.closed_at, this.retentionDays) : null,
      latestApplicationAt: row.latest_at,
      counts: { total: row.total, new: row.new, shortlisted: row.shortlisted, accepted: row.accepted, declined: row.declined },
    }));
  }

  async received(ownerId, filters, page) {
    let announcement = null;
    if (filters.announcementId) {
      announcement = (await this.announcements(ownerId, { id: filters.announcementId })).at(0);
      if (!announcement) throw requestError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
    }
    const rows = await this.ownerRows(realmConnector, ownerId, filters, page);
    return { rows, announcement, counts: await this.counts(ownerId, filters) };
  }

  async update(ownerId, applicationId, changes) {
    const ownerNote = normalizeOwnerNote(changes.ownerNote);
    return realmConnector.transaction(async (executor) => {
      const { params, where } = this.ownerScope(ownerId);
      params.push(applicationId);
      const { rows } = await executor.execute(`
        SELECT ap.id, ap.status, ap.applicant_id, a.id AS announcement_id, a.title, ${closed} AS is_closed
        FROM announcement_applications ap
        JOIN announcements a ON a.id = ap.announcement_id
        JOIN users o ON o.id = a.user_id
        WHERE ${where.join(' AND ')} AND ap.id = $${params.length}
        FOR UPDATE OF ap`, params);
      const current = rows[0];
      if (!current) throw requestError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
      const statusChanged = changes.status !== undefined && changes.status !== current.status;
      if (statusChanged && current.is_closed) {
        throw requestError(409, 'ANNOUNCEMENT_CLOSED', 'This announcement is closed. Its applications are read-only except for your private notes.');
      }
      await executor.execute(`
        UPDATE announcement_applications SET
          status = CASE WHEN $2 THEN $3 ELSE status END,
          status_changed_at = CASE WHEN $2 THEN NOW() ELSE status_changed_at END,
          owner_note = CASE WHEN $4 THEN $5 ELSE owner_note END,
          updated_at = NOW()
        WHERE id = $1`, [current.id, statusChanged, changes.status ?? null, ownerNote !== undefined, ownerNote ?? null]);
      if (statusChanged && NOTIFIED_STATUSES.includes(changes.status)) {
        await notificationRepository.create(executor, {
          userId: current.applicant_id, kind: 'application_status', title: statusNotificationTitle(changes.status),
          link: '#applications?view=sent', key: `application-status:${current.id}:${changes.status}`,
          params: { applicationId: current.id, announcementId: current.announcement_id, title: current.title, status: changes.status },
        });
      }
      await publishEvent(executor, 'applications.changed', { userId: ownerId, id: current.announcement_id });
      if (statusChanged) await publishEvent(executor, 'applications.changed', { userId: current.applicant_id, id: current.announcement_id });
      return (await this.ownerRows(executor, ownerId, { id: current.id })).at(0);
    });
  }

  async withdraw(userId, applicationId) {
    return realmConnector.transaction(async (executor) => {
      const { rows } = await executor.execute(`
        UPDATE announcement_applications ap SET status = 'withdrawn', withdrawn_at = NOW(), updated_at = NOW(),
          message = '', links = '[]'::jsonb, owner_note = NULL
        FROM announcements a
        WHERE ap.id = $1 AND ap.applicant_id = $2 AND ap.status <> 'withdrawn' AND a.id = ap.announcement_id
        RETURNING ap.id, a.id AS announcement_id, a.user_id AS owner_id`, [applicationId, userId]);
      if (!rows.length) throw requestError(404, 'APPLICATION_NOT_FOUND', 'Application not found');
      await executor.execute('DELETE FROM application_instruments WHERE application_id = $1', [rows[0].id]);
      await publishEvent(executor, 'applications.changed', { userId, id: rows[0].announcement_id });
      await publishEvent(executor, 'applications.changed', { userId: rows[0].owner_id, id: rows[0].announcement_id });
      return { id: rows[0].id, status: 'withdrawn' };
    });
  }
}

export { ApplicationRepository };
export const applicationRepository = new ApplicationRepository();
