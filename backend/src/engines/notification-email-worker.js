import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { mailDispatcher } from './mail-dispatcher.js';
import { composeNotificationEmail } from './notification-email.js';

export const EMAIL_MAX_ATTEMPTS = 3;

// Adapter over the shared SMTP transport configured by mailDispatcher.
export const smtpNotificationMailer = {
  get available() {
    return Boolean(mailDispatcher.transporter);
  },
  async send(to, { subject, text, html }) {
    if (!mailDispatcher.transporter) throw new Error('Mail is unavailable');
    await mailDispatcher.transporter.sendMail({ from: realmConfig.mailTransporter.senderAlias, to, subject, text, html });
  },
};

export class NotificationEmailWorker {
  constructor({
    origin = realmConfig.boundaries.portalOrigins[0],
    connector = realmConnector,
    mailer = smtpNotificationMailer,
    logger = console,
    batchSize = 10,
    maxBatches = 5,
  } = {}) {
    this.origin = origin;
    this.connector = connector;
    this.mailer = mailer;
    this.logger = logger;
    this.batchSize = batchSize;
    this.maxBatches = maxBatches;
    this.idleLogged = false;
  }

  // Leases due outbox rows with SKIP LOCKED so several API processes can share
  // the queue. The lease pushes next_email_at forward, which is also the retry
  // backoff (5, 10, then 20 minutes) if the process stops mid-delivery.
  async lease() {
    const { rows } = await this.connector.execute(`
      WITH jobs AS (
        SELECT n.id FROM notifications n
        WHERE n.email_status = 'pending' AND n.email_attempts < ${EMAIL_MAX_ATTEMPTS}
          AND n.next_email_at <= NOW() AND n.created_at > NOW() - INTERVAL '1 day'
        ORDER BY n.next_email_at, n.id LIMIT $1 FOR UPDATE OF n SKIP LOCKED
      ), leased AS (
        UPDATE notifications n SET email_attempts = n.email_attempts + 1,
          next_email_at = NOW() + make_interval(mins => 5 * power(2, n.email_attempts)::int)
        FROM jobs WHERE n.id = jobs.id
        RETURNING n.id, n.user_id, n.kind, n.link, n.params, n.email_attempts
      )
      SELECT l.id, l.kind, l.link, l.params, l.email_attempts AS attempts, u.email, p.locale,
        (u.is_active = TRUE AND u.is_deleted = FALSE AND COALESCE(u.email_verified, FALSE)) AS eligible
      FROM leased l JOIN users u ON u.id = l.user_id LEFT JOIN user_preferences p ON p.user_id = l.user_id`,
    [this.batchSize]);
    return rows;
  }

  async deliver(job) {
    if (!job.eligible) {
      await this.connector.execute("UPDATE notifications SET email_status = 'skipped' WHERE id = $1", [job.id]);
      return 'skipped';
    }
    try {
      const message = composeNotificationEmail({
        kind: job.kind, params: job.params, link: job.link, locale: job.locale, origin: this.origin,
      });
      await this.mailer.send(job.email, message);
      await this.connector.execute(
        "UPDATE notifications SET email_status = 'sent', email_sent_at = NOW() WHERE id = $1", [job.id],
      );
      return 'sent';
    } catch (error) {
      const final = job.attempts >= EMAIL_MAX_ATTEMPTS;
      if (final) await this.connector.execute("UPDATE notifications SET email_status = 'failed' WHERE id = $1", [job.id]);
      // Never log addresses or SMTP responses: they can contain personal data.
      this.logger.error({
        notificationId: job.id, attempt: job.attempts, code: error.code, responseCode: error.responseCode,
      }, final ? 'Notification email failed after the final attempt' : 'Notification email failed; it will be retried');
      return 'failed';
    }
  }

  async dispatch() {
    if (!this.mailer.available) {
      if (!this.idleLogged) {
        this.idleLogged = true;
        this.logger.info('Notification email is idle because SMTP is not configured');
      }
      return 0;
    }
    let delivered = 0;
    for (let batch = 0; batch < this.maxBatches; batch += 1) {
      const jobs = await this.lease();
      const outcomes = await Promise.all(jobs.map(job => this.deliver(job)));
      delivered += outcomes.filter(outcome => outcome === 'sent').length;
      if (jobs.length < this.batchSize) break;
    }
    return delivered;
  }
}
