import { ECDH } from 'node:crypto';
import * as webpush from 'web-push';
import { realmConnector } from '../repositories/realm-connector.js';
import { requestError } from './request-error.js';
import { maintainAccountTrust } from './account-maintenance.js';
import { NativePush } from './native-push.js';
import { mediaRepository } from '../repositories/media-repository.js';
import { mediaStorage } from './media-storage.js';
import { composeNotificationPush } from './notification-email.js';

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

// Push text is rebuilt from the kind and safe params in the recipient's
// language; the stored English title can name people or content, so it is
// never sent through a push provider.
export function pushPayload(notification) {
  const { title, body } = composeNotificationPush({
    kind: notification.kind, params: notification.params, locale: notification.locale,
  });
  return { title, body, tag: notification.id, url: notification.link };
}

export class PushDispatcher {
  constructor({
    config, connector = realmConnector, send = webpush.sendNotification.bind(webpush), logger = console,
    nativePush, storage,
  }) {
    this.config = config;
    this.connector = connector;
    this.send = send;
    this.logger = logger;
    this.nativePush = nativePush instanceof NativePush ? nativePush : new NativePush(nativePush, { connector, logger });
    this.storage = storage;
    this.running = null;
    this.lastMaintenance = 0;
  }

  async dispatch() {
    const webPush = Boolean(this.config?.publicKey && this.config?.privateKey);
    if (!webPush && !this.nativePush.enabled) return;
    const { rows } = await this.connector.execute(`
      WITH jobs AS (
        SELECT n.id, p.locale FROM notifications n JOIN user_preferences p ON p.user_id = n.user_id AND p.push = TRUE
        WHERE n.push_sent = FALSE AND n.read_at IS NULL AND n.push_attempts < 3
          AND n.next_push_at <= NOW() AND n.created_at > NOW() - INTERVAL '1 day'
        ORDER BY n.next_push_at LIMIT 5 FOR UPDATE OF n SKIP LOCKED
      )
      UPDATE notifications n SET push_attempts = push_attempts + 1, next_push_at = NOW() + INTERVAL '1 minute'
      FROM jobs WHERE n.id = jobs.id RETURNING n.*, jobs.locale`);
    await Promise.all(rows.map(async (notification) => {
      const payload = pushPayload(notification);
      const { rows: subscriptions } = webPush ? await this.connector.execute(
        'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
        [notification.user_id],
      ) : { rows: [] };
      const outcomes = await Promise.all(subscriptions.map(async (subscription) => {
        try {
          validatePushSubscription({ endpoint: subscription.endpoint, keys: subscription });
          await this.send({
            endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          }, JSON.stringify(payload), {
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
      outcomes.push(...await this.nativePush.deliver(notification, payload));
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
    await this.connector.execute("DELETE FROM profile_visits WHERE day < CURRENT_DATE - 29");
    await mediaRepository.removeOrphans(this.connector);
    await maintainAccountTrust(this.connector);
    const storage = this.storage ?? mediaStorage();
    if (!storage.objects && await mediaRepository.pendingObjectDeletions(this.connector)) {
      this.logger.warn('Stored media objects are waiting for deletion; configure the S3 settings to remove them');
    }
    this.lastMaintenance = Date.now();
  }

  async purgeObjects() {
    await mediaRepository.purgeObjects({ storage: this.storage ?? mediaStorage(), connector: this.connector, logger: this.logger });
  }

  start() {
    const tick = () => {
      if (this.running) return;
      this.running = (async () => { await this.maintain(); await this.dispatch(); await this.purgeObjects(); })()
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
    this.nativePush.close();
  }
}
