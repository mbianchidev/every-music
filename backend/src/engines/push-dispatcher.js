import { ECDH } from 'node:crypto';
import * as webpush from 'web-push';
import { realmConnector } from '../repositories/realm-connector.js';
import { requestError } from './request-error.js';

export function isAllowedPushEndpoint(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash
      && (!url.port || url.port === '443')
      && (['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'].includes(url.hostname)
        || url.hostname.endsWith('.notify.windows.com'));
  } catch {
    return false;
  }
}

export function validatePushSubscription(subscription) {
  try {
    const { endpoint, keys } = subscription;
    if (!isAllowedPushEndpoint(endpoint) || endpoint.length > 2048
      || !/^[A-Za-z0-9_-]+={0,2}$/.test(keys?.auth)
      || !/^[A-Za-z0-9_-]+={0,2}$/.test(keys?.p256dh)
      || Buffer.from(keys.auth, 'base64url').length !== 16
      || Buffer.from(keys.p256dh, 'base64url').length !== 65) {
      throw new Error('Invalid push subscription');
    }
    ECDH.convertKey(Buffer.from(keys.p256dh, 'base64url'), 'prime256v1');
  } catch (cause) {
    throw Object.assign(requestError(400, 'INVALID_PUSH_SUBSCRIPTION', 'Use a valid subscription from a supported browser push service'), { cause });
  }
}

export class PushDispatcher {
  constructor({ config, connector = realmConnector, send = webpush.sendNotification.bind(webpush), logger = console }) {
    this.config = config;
    this.connector = connector;
    this.send = send;
    this.logger = logger;
    this.running = null;
    this.lastMaintenance = 0;
  }

  async dispatch() {
    if (!this.config?.publicKey || !this.config?.privateKey) return;
    const { rows } = await this.connector.execute(`
      WITH jobs AS (
        SELECT n.id FROM notifications n JOIN user_preferences p ON p.user_id = n.user_id AND p.push = TRUE
        WHERE n.push_sent = FALSE AND n.read_at IS NULL AND n.push_attempts < 3
          AND n.next_push_at <= NOW() AND n.created_at > NOW() - INTERVAL '1 day'
        ORDER BY n.next_push_at LIMIT 5 FOR UPDATE OF n SKIP LOCKED
      )
      UPDATE notifications n SET push_attempts = push_attempts + 1, next_push_at = NOW() + INTERVAL '1 minute'
      FROM jobs WHERE n.id = jobs.id RETURNING n.*`);
    await Promise.all(rows.map(async (notification) => {
      const { rows: subscriptions } = await this.connector.execute(
        'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [notification.user_id],
      );
      const outcomes = await Promise.all(subscriptions.map(async (subscription) => {
        try {
          validatePushSubscription({ endpoint: subscription.endpoint, keys: subscription });
          await this.send({
            endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify({
            title: 'Every.music', body: notification.title, tag: notification.id, url: notification.link,
          }), {
            vapidDetails: { subject: this.config.subject, publicKey: this.config.publicKey, privateKey: this.config.privateKey },
            TTL: 300, timeout: 10000,
          });
          return true;
        } catch (error) {
          if (error.statusCode === 404 || error.statusCode === 410 || error.code === 'INVALID_PUSH_SUBSCRIPTION') {
            await this.connector.execute('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id]);
            this.logger.warn({ subscriptionId: subscription.id, statusCode: error.statusCode }, 'Removed an expired or invalid push subscription');
            return true;
          }
          // Do not log provider errors: they can contain subscription endpoints and keys.
          this.logger.error({
            notificationId: notification.id, statusCode: error.statusCode, attempt: notification.push_attempts,
          }, 'Push delivery failed; retrying up to three times');
          return false;
        }
      }));
      if (outcomes.every(Boolean)) {
        await this.connector.execute('UPDATE notifications SET push_sent = TRUE WHERE id = $1', [notification.id]);
      }
    }));
  }

  async maintain() {
    if (Date.now() - this.lastMaintenance < 60 * 60 * 1000) return;
    await this.connector.execute("DELETE FROM google_challenges WHERE expires_at < NOW()");
    await this.connector.execute("DELETE FROM analytics_daily WHERE day < CURRENT_DATE - 29");
    await this.connector.execute("DELETE FROM platform_analytics_daily WHERE day < CURRENT_DATE - 29");
    await this.connector.execute("DELETE FROM user_reports WHERE reviewed_at < NOW() - INTERVAL '90 days'");
    await this.connector.execute("DELETE FROM admin_audit WHERE created_at < NOW() - INTERVAL '365 days'");
    await this.connector.execute("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days'");
    await this.connector.execute(`
      DELETE FROM media m WHERE m.created_at < NOW() - INTERVAL '1 day'
      AND NOT EXISTS(SELECT 1 FROM profiles p WHERE p.profile_picture_url = '/realm/media/' || m.id)
      AND NOT EXISTS(SELECT 1 FROM announcements a WHERE a.picture_url = '/realm/media/' || m.id AND a.is_deleted = FALSE)`);
    this.lastMaintenance = Date.now();
  }

  start() {
    const tick = () => {
      if (this.running) return;
      this.running = (async () => { await this.maintain(); await this.dispatch(); })()
        .catch(error => this.logger.error({ err: error }, 'Notification maintenance failed'))
        .finally(() => { this.running = null; });
    };
    tick();
    this.timer = setInterval(tick, 15000);
    this.timer.unref();
  }

  async stop() {
    clearInterval(this.timer);
    await this.running;
  }
}
