import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import sharp from 'sharp';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { notificationRepository } from '../../src/repositories/notification-repository.js';
import { mediaRepository } from '../../src/repositories/media-repository.js';
import { configureMediaStorage } from '../../src/engines/media-storage.js';
import { authorizedMediaReferences, retainedMediaReferences } from '../../src/engines/media-references.js';
import { NativePush } from '../../src/engines/native-push.js';
import { PushDispatcher } from '../../src/engines/push-dispatcher.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

// In-process S3-compatible endpoint: path-style buckets, signed requests only.
async function startObjectStore(bucket) {
  const objects = new Map();
  const store = { objects, requests: [], failUploads: false };
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks);
      const path = decodeURIComponent(new URL(request.url, 'http://store').pathname);
      store.requests.push({ method: request.method, path, headers: request.headers });
      if (!/^AWS4-HMAC-SHA256 Credential=synthetic-access\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=[^,]+, Signature=[0-9a-f]{64}$/
        .test(request.headers.authorization || '')) {
        response.writeHead(403).end();
        return;
      }
      if (path === `/${bucket}` && request.method === 'HEAD') {
        response.writeHead(200).end();
        return;
      }
      if (!path.startsWith(`/${bucket}/`)) {
        response.writeHead(404).end();
        return;
      }
      const key = path.slice(bucket.length + 2);
      if (request.method === 'PUT') {
        if (store.failUploads) {
          response.writeHead(500).end();
          return;
        }
        objects.set(key, { body, contentType: request.headers['content-type'], sha256: request.headers['x-amz-content-sha256'] });
        response.writeHead(200).end();
      } else if (request.method === 'GET') {
        const object = objects.get(key);
        if (!object) response.writeHead(404).end();
        else response.writeHead(200, { 'content-type': object.contentType, 'content-length': object.body.length }).end(object.body);
      } else if (request.method === 'DELETE') {
        objects.delete(key);
        response.writeHead(204).end();
      } else {
        response.writeHead(405).end();
      }
    });
  });
  await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
  store.endpoint = `http://127.0.0.1:${server.address().port}`;
  store.close = () => new Promise(resolve => { server.close(resolve); });
  return store;
}

test('infrastructure: media storage drivers, encrypted blobs, and native push devices', async (t) => {
  const marker = `infra-${randomUUID()}`;
  const users = [];
  const tokens = [];
  const bucket = 'synthetic-media';
  const objectStore = await startObjectStore(bucket);
  const s3Settings = {
    driver: 's3',
    s3: {
      endpoint: objectStore.endpoint, region: 'us-east-1', bucket, forcePathStyle: true,
      accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret',
    },
  };
  const baseConfig = {
    ...realmConfig,
    attachmentLimit: 4096,
    mediaStorage: { driver: 'postgres', s3: {} },
    nativePush: {
      fcm: { projectId: 'synthetic-project', clientEmail: 'push@synthetic.example.test', privateKey: 'synthetic' },
      apns: { keyId: 'SYNTHETIC1', teamId: 'SYNTHETIC2', privateKey: 'synthetic', topic: 'music.every.app', environment: 'sandbox' },
    },
    boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 },
  };
  await realmConnector.establish();
  const apps = [];
  const build = async config => {
    const built = await buildNexus({ config, logger: false, backgroundJobs: false });
    apps.push(built);
    return built;
  };
  let app = await build(baseConfig);
  t.after(async () => {
    for (const built of apps) await built.close();
    configureMediaStorage({ driver: 'postgres', s3: {} });
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    const keys = objectStore.requests.filter(entry => entry.method === 'PUT').map(entry => entry.path.slice(bucket.length + 2));
    await realmConnector.execute('DELETE FROM media_object_deletions WHERE storage_key = ANY($1::text[])', [keys]);
    await objectStore.close();
    await realmConnector.disconnect();
  });
  for (let i = 0; i < 3; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute('INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email]);
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} ${i}`]);
  }
  const request = (path, { actor = 0, method = 'GET', body, headers = {} } = {}) => app.inject({
    method, url: `/realm${path}`, payload: body,
    headers: { ...(actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` }), ...headers },
  });
  async function call(path, { status = 200, ...options } = {}) {
    const response = await request(path, options);
    assert.equal(response.statusCode, status, `${options.method || 'GET'} ${path}: ${response.body}`);
    return response.json().data ?? response.json();
  }
  const uploadBlob = (bytes, actor = 0) => request('/media/blobs', {
    actor, method: 'POST', body: bytes, headers: { 'content-type': 'application/octet-stream' },
  });
  const image = await sharp({ create: { width: 30, height: 20, channels: 3, background: '#2f6fed' } }).png().toBuffer();
  const uploadImage = (purpose = 'profile') => call('/media', {
    method: 'POST', status: 201, body: { data: image.toString('base64'), mimeType: 'image/png', purpose },
  });

  let legacyImage;
  await t.test('the default PostgreSQL driver records size and type next to the bytes', async () => {
    legacyImage = await uploadImage();
    const { rows } = await realmConnector.execute('SELECT content, storage_key, mime_type, byte_size FROM media WHERE id = $1', [legacyImage.id]);
    assert.equal(rows[0].storage_key, null);
    assert.equal(rows[0].mime_type, 'image/webp');
    assert.equal(rows[0].byte_size, rows[0].content.length);
    const owned = await request(`/media/${legacyImage.id}`);
    assert.equal(owned.statusCode, 200);
    assert.equal(owned.headers['cache-control'], 'private, no-store');
    assert.equal(Number(owned.headers['content-length']), rows[0].content.length);
    assert.equal((await request(`/media/${legacyImage.id}`, { actor: null })).statusCode, 404);
    await call('/profiles/me', { method: 'PUT', body: { profilePictureUrl: legacyImage.url } });
    const shared = await request(`/media/${legacyImage.id}`, { actor: 1 });
    assert.equal(shared.statusCode, 200);
    assert.equal(shared.headers['cache-control'], 'public, max-age=3600');
    const inserted = await realmConnector.execute(
      "INSERT INTO media (user_id, purpose, content) VALUES ($1, 'announcement', $2) RETURNING byte_size, mime_type", [users[2], image],
    );
    assert.deepEqual(inserted.rows[0], { byte_size: image.length, mime_type: 'image/webp' });
  });

  let blob;
  const secret = randomBytes(1500);
  await t.test('encrypted blobs are private to their owner unless an authorized reference grants a viewer', async () => {
    const created = await uploadBlob(secret);
    assert.equal(created.statusCode, 201, created.body);
    blob = created.json().data;
    assert.deepEqual(Object.keys(blob).sort(), ['byteSize', 'id', 'mimeType', 'url']);
    assert.equal(blob.byteSize, secret.length);
    assert.equal(blob.mimeType, 'application/octet-stream');
    const own = await request(`/media/${blob.id}`);
    assert.equal(own.statusCode, 200);
    assert.deepEqual(own.rawPayload, secret);
    assert.match(own.headers['content-type'], /application\/octet-stream/);
    assert.match(own.headers['content-disposition'], /^attachment;/);
    assert.equal(own.headers['cache-control'], 'private, no-store');
    assert.equal((await request(`/media/${blob.id}`, { actor: 1 })).statusCode, 404);
    assert.equal((await request(`/media/${blob.id}`, { actor: null })).statusCode, 404);

    await realmConnector.execute('UPDATE profiles SET profile_picture_url = $1 WHERE user_id = $2', [blob.url, users[0]]);
    assert.equal((await request(`/media/${blob.id}`, { actor: null })).statusCode, 404, 'public references never expose attachments');
    await realmConnector.execute('UPDATE profiles SET profile_picture_url = $1 WHERE user_id = $2', [legacyImage.url, users[0]]);
    await call('/profiles/me', { method: 'PUT', body: { profilePictureUrl: blob.url }, status: 400 });

    const grant = `$3::text = '${users[1]}' AND $2 = '${blob.url}'`;
    authorizedMediaReferences.push(grant);
    try {
      const granted = await request(`/media/${blob.id.toUpperCase()}`, { actor: 1 });
      assert.equal(granted.statusCode, 200);
      assert.deepEqual(granted.rawPayload, secret);
      assert.equal(granted.headers['cache-control'], 'private, no-store');
      assert.equal((await request(`/media/${blob.id}`, { actor: 2 })).statusCode, 404);
      assert.equal((await request(`/media/${blob.id}`, { actor: null })).statusCode, 404);
    } finally {
      authorizedMediaReferences.splice(authorizedMediaReferences.indexOf(grant), 1);
    }
  });

  await t.test('blob uploads validate authentication, size, encoding, and daily volume', async () => {
    assert.equal((await uploadBlob(secret, null)).statusCode, 401);
    assert.equal((await uploadBlob(Buffer.alloc(0))).json().error.code, 'INVALID_BLOB');
    assert.equal((await uploadBlob(randomBytes(5000))).statusCode, 413);
    const json = await request('/media/blobs', { method: 'POST', body: { data: 'not opaque bytes' } });
    assert.equal(json.json().error.code, 'INVALID_BLOB');
    await realmConnector.execute(`
      INSERT INTO media (user_id, purpose, content, mime_type)
      SELECT $1, 'attachment', '\\x00'::bytea, 'application/octet-stream' FROM generate_series(1, 100)`, [users[2]]);
    const limited = await uploadBlob(secret, 2);
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, 'ATTACHMENT_LIMIT_REACHED');
    await realmConnector.execute("DELETE FROM media WHERE user_id = $1 AND purpose = 'attachment'", [users[2]]);
  });

  await t.test('orphan cleanup keeps referenced media and registered retention references', async () => {
    const orphan = await uploadImage('announcement');
    const kept = await uploadBlob(randomBytes(64));
    const keptBlob = kept.json().data;
    await realmConnector.execute("UPDATE media SET created_at = NOW() - INTERVAL '2 days' WHERE id = ANY($1::uuid[])",
      [[orphan.id, keptBlob.id, legacyImage.id, blob.id]]);
    const retain = `$2 = '${keptBlob.url}'`;
    retainedMediaReferences.push(retain);
    try {
      await mediaRepository.removeOrphans();
    } finally {
      retainedMediaReferences.splice(retainedMediaReferences.indexOf(retain), 1);
    }
    const { rows } = await realmConnector.execute('SELECT id FROM media WHERE id = ANY($1::uuid[])', [[orphan.id, keptBlob.id, legacyImage.id, blob.id]]);
    assert.deepEqual(rows.map(row => row.id).sort(), [keptBlob.id, legacyImage.id].sort());
  });

  await t.test('the S3 driver stores new bytes as signed objects and keeps PostgreSQL rows readable', async () => {
    app = await build({ ...baseConfig, mediaStorage: s3Settings });
    const ready = await app.inject('/health/ready');
    assert.equal(ready.statusCode, 200);
    assert.deepEqual(ready.json().dependencies, { database: 'connected', storage: 'connected' });

    const stored = await uploadImage();
    const key = `media/${stored.id}`;
    const { rows } = await realmConnector.execute('SELECT content, storage_key, byte_size, mime_type FROM media WHERE id = $1', [stored.id]);
    assert.deepEqual({ ...rows[0] }, {
      content: null, storage_key: key, byte_size: objectStore.objects.get(key).body.length, mime_type: 'image/webp',
    });
    assert.equal(objectStore.objects.get(key).contentType, 'image/webp');
    assert.equal(objectStore.objects.get(key).sha256, createHash('sha256').update(objectStore.objects.get(key).body).digest('hex'));
    const downloaded = await request(`/media/${stored.id}`);
    assert.equal(downloaded.statusCode, 200);
    assert.equal((await sharp(downloaded.rawPayload).metadata()).format, 'webp');
    assert.equal((await request(`/media/${legacyImage.id}`, { actor: 1 })).statusCode, 200, 'PostgreSQL rows stay readable');

    const encrypted = randomBytes(2048);
    const created = await uploadBlob(encrypted);
    assert.equal(created.statusCode, 201);
    const blobKey = `media/${created.json().data.id}`;
    assert.deepEqual(objectStore.objects.get(blobKey).body, encrypted);
    assert.deepEqual((await request(`/media/${created.json().data.id}`)).rawPayload, encrypted);

    await realmConnector.execute('DELETE FROM media WHERE id = $1', [stored.id]);
    assert.equal((await realmConnector.execute('SELECT 1 FROM media_object_deletions WHERE storage_key = $1', [key])).rowCount, 1);
    const dispatcher = new PushDispatcher({ config: {}, logger: { error() {}, warn() {} } });
    await dispatcher.purgeObjects();
    assert.equal(objectStore.objects.has(key), false);
    assert.equal((await realmConnector.execute('SELECT 1 FROM media_object_deletions WHERE storage_key = $1', [key])).rowCount, 0);

    await realmConnector.execute('DELETE FROM users WHERE id = $1', [users[2]]);
    users.splice(2, 1, (await realmConnector.execute(
      'INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [`${marker}-replacement@example.test`],
    )).rows[0].id);
    tokens[2] = cipherEngine.createAccessToken(users[2], `${marker}-replacement@example.test`);
    const owned = await uploadBlob(randomBytes(32), 2);
    const ownedKey = `media/${owned.json().data.id}`;
    await realmConnector.execute('DELETE FROM users WHERE id = $1', [users[2]]);
    await dispatcher.purgeObjects();
    assert.equal(objectStore.objects.has(ownedKey), false, 'account deletion cascades remove stored objects');

    objectStore.failUploads = true;
    const before = (await realmConnector.execute('SELECT COUNT(*)::int AS count FROM media WHERE user_id = $1', [users[0]])).rows[0].count;
    const failed = await request('/media/blobs', { method: 'POST', body: randomBytes(16), headers: { 'content-type': 'application/octet-stream' } });
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.json().error.code, 'MEDIA_STORAGE_UNAVAILABLE');
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM media WHERE user_id = $1', [users[0]])).rows[0].count, before);
    objectStore.failUploads = false;
    assert.ok(objectStore.requests.every(entry => !JSON.stringify(entry.headers).includes('synthetic-secret')));

    await objectStore.close();
    const down = await app.inject('/health/ready');
    assert.equal(down.statusCode, 503);
    assert.deepEqual(down.json().dependencies, { database: 'connected', storage: 'unavailable' });
    assert.equal((await request(`/media/${created.json().data.id}`)).json().error.code, 'MEDIA_STORAGE_UNAVAILABLE');
  });

  await t.test('native push devices are validated, capped, removable, and receive generic payloads', async () => {
    app = await build(baseConfig);
    const android = `synthetic-fcm-token:${randomBytes(48).toString('base64url')}`;
    const ios = randomBytes(32).toString('hex').toUpperCase();
    const empty = await call('/push/devices', { actor: 1 });
    assert.deepEqual(empty, { providers: { android: true, ios: true }, devices: [] });
    const first = await call('/push/devices', { actor: 1, method: 'POST', status: 201, body: { platform: 'android', token: android } });
    const again = await call('/push/devices', { actor: 1, method: 'POST', status: 201, body: { platform: 'android', token: android } });
    assert.equal(again.id, first.id);
    await call('/push/devices', { actor: 1, method: 'POST', status: 201, body: { platform: 'ios', token: ios } });
    assert.equal((await realmConnector.execute("SELECT token FROM push_devices WHERE user_id = $1 AND platform = 'ios'", [users[1]])).rows[0].token, ios.toLowerCase());
    assert.equal((await call('/preferences', { actor: 1 })).push, true);
    for (const body of [{ platform: 'ios', token: 'not-hex' }, { platform: 'android', token: 'short' }, { platform: 'web', token: android }]) {
      await call('/push/devices', { actor: 1, method: 'POST', status: 400, body });
    }
    const listed = await call('/push/devices', { actor: 1 });
    assert.deepEqual(listed.devices.map(device => device.platform).sort(), ['android', 'ios']);
    assert.equal(JSON.stringify(listed).includes(android), false, 'tokens are not echoed back');
    await call(`/push/devices/${first.id}`, { actor: 0, method: 'DELETE', status: 404 });

    await realmConnector.execute(`
      INSERT INTO push_devices (user_id, platform, token)
      SELECT $1, 'android', 'synthetic-capacity-token-' || n || '-padding-for-length' FROM generate_series(1, 8) n`, [users[1]]);
    const capped = await request('/push/devices', { actor: 1, method: 'POST', body: { platform: 'android', token: `${android}-extra` } });
    assert.equal(capped.json().error.code, 'PUSH_DEVICE_LIMIT');
    await realmConnector.execute("DELETE FROM push_devices WHERE token LIKE 'synthetic-capacity-token-%'");

    const sent = [];
    const outcomes = { [android]: 'sent', [ios.toLowerCase()]: 'invalid' };
    const provider = { send: async (token, payload) => { sent.push({ token, payload }); return outcomes[token]; } };
    const dispatcher = new PushDispatcher({
      config: {}, logger: { error() {}, warn() {} },
      nativePush: new NativePush({}, { providers: { android: provider, ios: provider }, logger: { error() {}, warn() {} } }),
    });
    const notificationId = await realmConnector.transaction(executor => notificationRepository.create(executor, {
      userId: users[1], kind: 'message', title: 'You have a new message', link: '#messages', key: `${marker}:message`,
    }));
    await dispatcher.dispatch();
    assert.equal(sent.length, 2);
    for (const { payload } of sent) {
      assert.deepEqual(payload, { title: 'Every.music', body: 'You have a new message', tag: notificationId, url: '#messages' });
    }
    assert.equal((await realmConnector.execute('SELECT push_sent FROM notifications WHERE id = $1', [notificationId])).rows[0].push_sent, true);
    assert.deepEqual((await call('/push/devices', { actor: 1 })).devices.map(device => device.platform), ['android'], 'unregistered tokens are removed');

    const retried = await realmConnector.transaction(executor => notificationRepository.create(executor, {
      userId: users[1], kind: 'message', title: 'You have a new message', link: '#messages', key: `${marker}:retry`,
    }));
    provider.send = async () => { throw Object.assign(new Error('Synthetic provider outage'), { statusCode: 503 }); };
    await dispatcher.dispatch();
    const { rows } = await realmConnector.execute('SELECT push_sent, push_attempts FROM notifications WHERE id = $1', [retried]);
    assert.deepEqual(rows[0], { push_sent: false, push_attempts: 1 });

    await call('/push/devices', { actor: 1, method: 'DELETE', body: { platform: 'android', token: android } });
    assert.deepEqual((await call('/push/devices', { actor: 1 })).devices, []);
    await call('/push/devices', { actor: 1, method: 'POST', status: 201, body: { platform: 'android', token: android } });
    await call('/preferences', { actor: 1, method: 'PUT', body: { push: false } });
    assert.deepEqual((await call('/push/devices', { actor: 1 })).devices, [], 'disabling push removes every device');

    app = await build({ ...baseConfig, nativePush: { fcm: {}, apns: { environment: 'production' } } });
    const unconfigured = await request('/push/devices', { actor: 1, method: 'POST', body: { platform: 'android', token: android } });
    assert.equal(unconfigured.statusCode, 503);
    assert.equal(unconfigured.json().error.code, 'PUSH_NOT_CONFIGURED');
    assert.deepEqual((await call('/push/devices', { actor: 1 })).providers, { android: false, ios: false });
  });
});
