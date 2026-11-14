import { realmConnector } from '../repositories/realm-connector.js';
import { DEFAULT_RETENTION_DAYS, announcementClosedSql } from './application-rules.js';

const closed = announcementClosedSql('a', 'o');

// Records when announcements stop accepting replies and removes applications
// once the retention period has passed after closure or withdrawal.
export class ApplicationMaintenance {
  constructor({ connector = realmConnector, retentionDays = DEFAULT_RETENTION_DAYS, logger = console, intervalMs = 60 * 60 * 1000 } = {}) {
    this.connector = connector;
    this.retentionDays = retentionDays;
    this.logger = logger;
    this.intervalMs = intervalMs;
    this.running = null;
    this.timer = null;
  }

  async sweep() {
    const marked = await this.connector.execute(`
      UPDATE announcement_applications ap
      SET closed_at = CASE WHEN a.expires_at IS NOT NULL AND a.expires_at <= NOW()
        THEN LEAST(a.expires_at::timestamptz, NOW()) ELSE NOW() END
      FROM announcements a JOIN users o ON o.id = a.user_id
      WHERE ap.announcement_id = a.id AND ap.closed_at IS NULL AND ${closed}`);
    const reopened = await this.connector.execute(`
      UPDATE announcement_applications ap SET closed_at = NULL
      FROM announcements a JOIN users o ON o.id = a.user_id
      WHERE ap.announcement_id = a.id AND ap.closed_at IS NOT NULL AND NOT ${closed}`);
    const removed = await this.connector.execute(`
      DELETE FROM announcement_applications ap
      WHERE ap.closed_at < NOW() - make_interval(days => $1::int)
        OR (ap.status = 'withdrawn' AND ap.withdrawn_at < NOW() - make_interval(days => $1::int))
        OR EXISTS(SELECT 1 FROM users u WHERE u.id = ap.applicant_id AND u.is_deleted)`, [this.retentionDays]);
    return { closed: marked.rowCount, reopened: reopened.rowCount, removed: removed.rowCount };
  }

  start() {
    const tick = () => {
      if (this.running) return;
      this.running = this.sweep()
        .catch(error => this.logger.error({ err: error }, 'Application maintenance failed'))
        .finally(() => { this.running = null; });
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
    this.timer.unref();
  }

  async stop() {
    clearInterval(this.timer);
    await this.running;
  }
}
