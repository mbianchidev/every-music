import http2 from 'node:http2';
import { JWT } from 'google-auth-library';
import { SignJWT, importPKCS8 } from 'jose';
import { realmConnector } from '../repositories/realm-connector.js';
import { requestError } from './request-error.js';

export const NATIVE_PUSH_PLATFORMS = ['android', 'ios'];
export const PUSH_DEVICE_LIMIT = 10;

const complete = (settings, keys) => keys.every(key => Boolean(settings?.[key]));

export function nativePushAvailability(settings = {}) {
  return {
    android: complete(settings.fcm, ['projectId', 'clientEmail', 'privateKey']),
    ios: complete(settings.apns, ['keyId', 'teamId', 'privateKey', 'topic', 'environment']),
  };
}

export function normalizeDeviceToken(platform, token) {
  const value = typeof token === 'string' ? token.trim() : '';
  if (platform === 'ios' && /^(?:[0-9a-fA-F]{2}){32,100}$/.test(value)) return value.toLowerCase();
  if (platform === 'android' && /^[A-Za-z0-9_:.-]{32,4096}$/.test(value)) return value;
  throw requestError(400, 'INVALID_PUSH_DEVICE', 'Use a valid device token from Firebase Cloud Messaging or Apple Push Notification service');
}

const deliveryError = (provider, statusCode, reason) => Object.assign(
  new Error(`${provider} delivery failed`), { statusCode, reason },
);

// Firebase Cloud Messaging HTTP v1 for Android devices.
export class FcmProvider {
  constructor(settings, { fetch = globalThis.fetch.bind(globalThis), origin = 'https://fcm.googleapis.com', credentials } = {}) {
    this.projectId = settings.projectId;
    this.fetch = fetch;
    this.origin = origin;
    this.credentials = credentials ?? new JWT({
      email: settings.clientEmail, key: settings.privateKey,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    });
  }

  async send(token, payload) {
    const { token: accessToken } = await this.credentials.getAccessToken();
    const response = await this.fetch(`${this.origin}/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title: payload.title, body: payload.body },
          data: { url: payload.url, tag: payload.tag },
          android: { priority: 'HIGH', ttl: '300s', collapse_key: payload.tag },
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (response.ok) {
      await response.body?.cancel();
      return 'sent';
    }
    const detail = await response.json().catch(() => ({}));
    const reason = detail?.error?.details?.find?.(item => item?.errorCode)?.errorCode ?? detail?.error?.status;
    if (response.status === 404 || reason === 'UNREGISTERED'
      || (response.status === 400 && reason === 'INVALID_ARGUMENT')) return 'invalid';
    throw deliveryError('FCM', response.status, reason);
  }

  close() {}
}

// Apple Push Notification service over HTTP/2 with token (.p8) authentication.
export class ApnsProvider {
  constructor(settings, { connect = http2.connect, origin } = {}) {
    this.settings = settings;
    this.connect = connect;
    this.origin = origin ?? (settings.environment === 'sandbox'
      ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com');
    this.session = null;
    this.providerToken = null;
    this.issuedAt = 0;
  }

  async authorization() {
    // Apple rejects provider tokens older than an hour and throttles refreshes
    // more often than every 20 minutes.
    if (this.providerToken && Date.now() - this.issuedAt < 50 * 60 * 1000) return this.providerToken;
    this.key ??= await importPKCS8(this.settings.privateKey, 'ES256');
    this.providerToken = await new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.settings.keyId })
      .setIssuer(this.settings.teamId).setIssuedAt().sign(this.key);
    this.issuedAt = Date.now();
    return this.providerToken;
  }

  client() {
    if (this.session && !this.session.closed && !this.session.destroyed) return this.session;
    const session = this.connect(this.origin);
    const reset = () => { if (this.session === session) this.session = null; };
    session.on('error', reset);
    session.on('goaway', reset);
    session.on('close', reset);
    session.unref?.();
    this.session = session;
    return session;
  }

  async send(token, payload) {
    const authorization = await this.authorization();
    const { status, body } = await new Promise((resolve, reject) => {
      const request = this.client().request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${authorization}`,
        'apns-topic': this.settings.topic,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 300),
        'apns-collapse-id': payload.tag,
        'content-type': 'application/json',
      });
      let status = 0;
      let data = '';
      request.setEncoding('utf8');
      request.setTimeout(10000, () => request.close(http2.constants.NGHTTP2_CANCEL));
      request.on('response', headers => { status = headers[':status']; });
      request.on('data', chunk => { data += chunk; });
      request.on('end', () => resolve({ status, body: data }));
      request.on('error', reject);
      request.on('close', () => (status ? resolve({ status, body: data }) : reject(new Error('APNs request was cancelled'))));
      request.end(JSON.stringify({
        aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
        url: payload.url, tag: payload.tag,
      }));
    });
    if (status === 200) return 'sent';
    let reason;
    try { reason = JSON.parse(body).reason; } catch { reason = undefined; }
    if (status === 410 || (status === 400 && ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(reason))) return 'invalid';
    if (reason === 'ExpiredProviderToken' || reason === 'InvalidProviderToken') this.providerToken = null;
    throw deliveryError('APNs', status, reason);
  }

  close() {
    this.session?.close();
    this.session = null;
  }
}

export class NativePush {
  constructor(settings = {}, { connector = realmConnector, logger = console, providers } = {}) {
    const available = nativePushAvailability(settings);
    this.providers = providers ?? {
      ...(available.android ? { android: new FcmProvider(settings.fcm) } : {}),
      ...(available.ios ? { ios: new ApnsProvider(settings.apns) } : {}),
    };
    this.connector = connector;
    this.logger = logger;
  }

  get enabled() {
    return Object.keys(this.providers).length > 0;
  }

  // Sends the generic payload to every registered device of the recipient on
  // a configured platform. Resolves to one boolean per device: false means
  // the delivery should be retried.
  async deliver(notification, payload) {
    if (!this.enabled) return [];
    const { rows: devices } = await this.connector.execute(
      'SELECT id, platform, token FROM push_devices WHERE user_id = $1 AND platform = ANY($2::text[]) ORDER BY updated_at DESC LIMIT $3',
      [notification.user_id, Object.keys(this.providers), PUSH_DEVICE_LIMIT],
    );
    return Promise.all(devices.map(async (device) => {
      try {
        if (await this.providers[device.platform].send(device.token, payload) === 'invalid') {
          await this.connector.execute('DELETE FROM push_devices WHERE id = $1', [device.id]);
          this.logger.warn({ deviceId: device.id, platform: device.platform }, 'Removed an unregistered native push device');
        }
        return true;
      } catch (error) {
        // Provider responses can echo device tokens; log only safe fields.
        this.logger.error({
          notificationId: notification.id, platform: device.platform, statusCode: error.statusCode,
          reason: error.reason, attempt: notification.push_attempts,
        }, 'Native push delivery failed; retrying up to three times');
        return false;
      }
    }));
  }

  close() {
    for (const provider of Object.values(this.providers)) provider.close?.();
  }
}
