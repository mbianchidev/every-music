import test from 'node:test';
import { createECDH } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  PushDispatcher, isAllowedPushEndpoint, pushPayload, validatePushSubscription,
} from '../src/engines/push-dispatcher.js';
import { NativePush } from '../src/engines/native-push.js';

test('push endpoints cannot target arbitrary servers, credentials, or non-HTTPS ports', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/synthetic',
    'https://updates.push.services.mozilla.com/wpush/v2/synthetic',
    'https://web.push.apple.com/synthetic',
    'https://synthetic.notify.windows.com/synthetic',
  ]) assert.equal(isAllowedPushEndpoint(endpoint), true, endpoint);
  for (const endpoint of [
    'http://fcm.googleapis.com/synthetic',
    'https://fcm.googleapis.com:444/synthetic',
    'https://user:password@fcm.googleapis.com/synthetic',
    'https://fcm.googleapis.com.example.test/synthetic',
    'https://127.0.0.1/private',
    'https://169.254.169.254/latest/meta-data',
    'https://example.test/notify.windows.com',
  ]) assert.equal(isAllowedPushEndpoint(endpoint), false, endpoint);
  assert.throws(() => validatePushSubscription({
    endpoint: 'https://fcm.googleapis.com/synthetic', keys: { p256dh: 'invalid', auth: 'invalid' },
  }), error => error.code === 'INVALID_PUSH_SUBSCRIPTION');
});

test('web and native push send generic text in the recipient language instead of the stored title', async () => {
  const subscription = {
    id: 'subscription-1', endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
    p256dh: createECDH('prime256v1').generateKeys().toString('base64url'),
    auth: Buffer.alloc(16, 1).toString('base64url'),
  };
  const notification = {
    id: 'notification-1', user_id: 'user-1', kind: 'band_message', title: 'New messages in the Secret Band band chat',
    params: { organizationId: 'org-1', name: 'Secret Band' }, link: '#organization?id=org-1&section=chat', locale: 'nl', push_attempts: 1,
  };
  const statements = [];
  const connector = {
    execute: async (sql) => {
      statements.push(sql);
      if (sql.includes('WITH jobs')) return { rows: [notification] };
      if (sql.includes('FROM push_subscriptions')) return { rows: [subscription] };
      if (sql.includes('FROM push_devices')) return { rows: [{ id: 'device-1', platform: 'android', token: 'synthetic-token' }] };
      return { rows: [], rowCount: 1 };
    },
  };
  const sent = [];
  const native = [];
  const dispatcher = new PushDispatcher({
    config: { publicKey: 'public', privateKey: 'private', subject: 'mailto:push@example.test' }, connector,
    send: async (_target, body) => { sent.push(JSON.parse(body)); },
    nativePush: new NativePush({}, { connector, providers: { android: { send: async (_token, payload) => { native.push(payload); return 'sent'; } } } }),
    logger: { warn() {}, error() {} },
  });
  await dispatcher.dispatch();
  const expected = {
    title: 'Nieuwe berichten in je bandchat',
    body: 'Er zijn nieuwe berichten in een van je bandchats. Open Every.music om ze te lezen.',
    tag: 'notification-1', url: '#organization?id=org-1&section=chat',
  };
  assert.deepEqual(sent, [expected]);
  assert.deepEqual(native, [expected]);
  assert.equal(JSON.stringify([sent, native]).includes('Secret Band'), false);
  assert.ok(statements.some(sql => sql.includes('UPDATE notifications SET push_sent = TRUE')));
  assert.equal(pushPayload({ ...notification, locale: 'fr' }).title, 'New messages in your band chat');
});
