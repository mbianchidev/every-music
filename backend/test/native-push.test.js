import test from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { generateKeyPairSync } from 'node:crypto';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import {
  ApnsProvider, FcmProvider, NativePush, nativePushAvailability, normalizeDeviceToken,
} from '../src/engines/native-push.js';

const payload = { title: 'Every.music', body: 'You have a new message', tag: '7b0c6a43-1a6f-4f0e-9a51-0e7c0d1c2b3a', url: '#messages' };
const androidToken = `synthetic:${'a'.repeat(140)}`;
const iosToken = 'ab'.repeat(32);

test('device tokens are validated and normalized per platform', () => {
  assert.equal(normalizeDeviceToken('ios', ` ${iosToken.toUpperCase()} `), iosToken);
  assert.equal(normalizeDeviceToken('android', androidToken), androidToken);
  for (const [platform, token] of [['ios', 'abc'], ['ios', `${iosToken}a`], ['android', 'short'], ['android', `${androidToken}/x`], ['web', androidToken]]) {
    assert.throws(() => normalizeDeviceToken(platform, token), error => error.code === 'INVALID_PUSH_DEVICE', `${platform} ${token}`);
  }
  assert.deepEqual(nativePushAvailability({ fcm: {}, apns: { environment: 'production' } }), { android: false, ios: false });
});

test('FCM HTTP v1 sends a generic notification and recognizes unregistered tokens', async () => {
  const requests = [];
  const responses = [
    new Response('{}', { status: 200 }),
    Response.json({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }, { status: 404 }),
    Response.json({ error: { status: 'UNAVAILABLE' } }, { status: 503 }),
  ];
  const provider = new FcmProvider({ projectId: 'synthetic-project' }, {
    credentials: { getAccessToken: async () => ({ token: 'synthetic-access-token' }) },
    fetch: async (url, init) => { requests.push({ url, init }); return responses.shift(); },
  });
  assert.equal(await provider.send(androidToken, payload), 'sent');
  assert.equal(requests[0].url, 'https://fcm.googleapis.com/v1/projects/synthetic-project/messages:send');
  assert.equal(requests[0].init.headers.authorization, 'Bearer synthetic-access-token');
  assert.deepEqual(JSON.parse(requests[0].init.body).message, {
    token: androidToken,
    notification: { title: 'Every.music', body: 'You have a new message' },
    data: { url: '#messages', tag: payload.tag },
    android: { priority: 'HIGH', ttl: '300s', collapse_key: payload.tag },
  });
  assert.equal(await provider.send(androidToken, payload), 'invalid');
  await assert.rejects(provider.send(androidToken, payload), error => error.statusCode === 503 && error.reason === 'UNAVAILABLE');
});

test('APNs uses HTTP/2 token authentication and maps rejected device tokens', async (t) => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const seen = [];
  const replies = [[200, ''], [410, '{"reason":"Unregistered"}'], [400, '{"reason":"BadDeviceToken"}'], [429, '{"reason":"TooManyRequests"}']];
  const server = http2.createServer();
  server.on('stream', (stream, headers) => {
    let body = '';
    stream.setEncoding('utf8');
    stream.on('data', chunk => { body += chunk; });
    stream.on('end', () => {
      seen.push({ headers, body: JSON.parse(body) });
      const [status, reply] = replies.shift();
      stream.respond({ ':status': status, 'content-type': 'application/json' });
      stream.end(reply);
    });
  });
  await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
  const provider = new ApnsProvider({
    keyId: 'ABCDEF1234', teamId: 'TEAM123456', topic: 'music.every.app', environment: 'sandbox',
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }, { origin: `http://127.0.0.1:${server.address().port}` });
  t.after(() => { provider.close(); server.close(); });

  assert.equal(await provider.send(iosToken, payload), 'sent');
  const [first] = seen;
  assert.equal(first.headers[':path'], `/3/device/${iosToken}`);
  assert.equal(first.headers['apns-topic'], 'music.every.app');
  assert.equal(first.headers['apns-push-type'], 'alert');
  assert.equal(first.headers['apns-collapse-id'], payload.tag);
  const jwt = first.headers.authorization.replace(/^bearer /, '');
  assert.deepEqual(decodeProtectedHeader(jwt), { alg: 'ES256', kid: 'ABCDEF1234' });
  assert.equal((await jwtVerify(jwt, publicKey)).payload.iss, 'TEAM123456');
  assert.deepEqual(first.body, { aps: { alert: { title: 'Every.music', body: 'You have a new message' }, sound: 'default' }, url: '#messages', tag: payload.tag });
  assert.equal(await provider.send(iosToken, payload), 'invalid');
  assert.equal(await provider.send(iosToken, payload), 'invalid');
  await assert.rejects(provider.send(iosToken, payload), error => error.statusCode === 429 && error.reason === 'TooManyRequests');
  assert.equal(seen[3].headers.authorization, first.headers.authorization, 'provider tokens are reused within their lifetime');

  const fresh = new ApnsProvider({ ...provider.settings }, { origin: provider.origin });
  const tokens = await Promise.all(Array.from({ length: 5 }, () => fresh.authorization()));
  assert.equal(new Set(tokens).size, 1, 'concurrent sends share one provider token');
});

test('native delivery removes unregistered devices and reports retryable failures', async () => {
  const statements = [];
  const connector = {
    execute: async (sql, values) => {
      statements.push({ sql, values });
      if (sql.startsWith('SELECT')) {
        return { rows: [
          { id: 'device-1', platform: 'android', token: androidToken },
          { id: 'device-2', platform: 'ios', token: iosToken },
          { id: 'device-3', platform: 'android', token: `${androidToken}b` },
        ] };
      }
      return { rows: [], rowCount: 1 };
    },
  };
  const results = { [androidToken]: 'sent', [iosToken]: 'invalid' };
  const errors = [];
  const native = new NativePush({}, {
    connector,
    logger: { warn() {}, error: entry => errors.push(entry) },
    providers: {
      android: { send: async token => { if (!results[token]) throw Object.assign(new Error('outage'), { statusCode: 503 }); return results[token]; } },
      ios: { send: async token => results[token] },
    },
  });
  const outcomes = await native.deliver({ id: 'notification-1', user_id: 'user-1', push_attempts: 1 }, payload);
  assert.deepEqual(outcomes, [true, true, false]);
  assert.deepEqual(statements[0].values, ['user-1', ['android', 'ios'], 10]);
  assert.deepEqual(statements.slice(1).map(statement => statement.values), [['device-2']]);
  assert.equal(JSON.stringify(errors).includes(androidToken), false);
  assert.deepEqual(await new NativePush({}, { connector }).deliver({ user_id: 'user-1' }, payload), []);
});
