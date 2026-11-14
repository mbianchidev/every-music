import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { buildNexus } from '../src/app.js';
import { realmConfig } from '../config/realm.js';
import { realmConnector } from '../src/repositories/realm-connector.js';
import { cipherEngine } from '../src/engines/cipher-engine.js';
import { googleIdentityBridge } from '../src/engines/google-identity-bridge.js';
import { PushDispatcher } from '../src/engines/push-dispatcher.js';
import { publishEvent } from '../src/repositories/community-repository.js';
import { generateVAPIDKeys } from 'web-push';
import { createIdentity, generateRecoveryKey, unlockIdentity, encryptMessage, decryptMessage } from '../../frontend/src/lib/message-crypto.js';
import { administrationRepository } from '../src/repositories/administration-repository.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Community integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

test('community workflows use real HTTP guards, transactions, and PostgreSQL persistence', async (t) => {
  const marker = `community-${randomUUID()}`;
  const users = [];
  const tokens = [];
  const vapid = generateVAPIDKeys();
  const pushConfig = { ...vapid, subject: 'mailto:synthetic@example.test' };
  await realmConnector.establish();
  const app = await buildNexus({
    config: { ...realmConfig, push: pushConfig, boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 } },
    logger: false,
    backgroundJobs: false,
  });
  t.after(async () => {
    await app.close();
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });
  for (let i = 0; i < 3; i += 1) {
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [`${marker}-${i}@example.test`],
    );
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, `${marker}-${i}@example.test`));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} artist ${i}`]);
  }
  async function call(path, { actor = 0, method = 'GET', body, status = 200 } = {}) {
    if (method === 'GET' && /\/conversations\/[^/]+\/messages(?:\?|$)/.test(path)) {
      path += `${path.includes('?') ? '&' : '?'}format=encrypted-v1`;
    }
    const response = await app.inject({
      method, url: `/realm${path}`,
      headers: actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` },
      payload: body,
    });
    const payload = response.json();
    assert.equal(response.statusCode, status, `${method} ${path}: ${JSON.stringify(payload)}`);
    return payload.data ?? payload;
  }
  const announcement = (extra = {}, actor = 0) => call('/announcements/', {
    actor, method: 'POST', status: 201,
    body: { title: `${marker} open call`, description: 'A synthetic collaboration opportunity for integration testing.', city: marker, ...extra },
  });
  const clientKeys = new Map();
  async function keyFor(actor) {
    if (!clientKeys.has(actor)) {
      const recovery = generateRecoveryKey();
      const generated = await createIdentity(users[actor], recovery);
      const record = await call('/encryption/me', { actor, method: 'POST', status: 201, body: generated.publication });
      clientKeys.set(actor, { record, recovery, unlocked: await unlockIdentity(record, recovery) });
    }
    return clientKeys.get(actor);
  }
  async function encryptedInput(id, actor, body) {
    const recipientId = (await call(`/conversations/${id}/messages`, { actor })).conversation.recipientId;
    const recipientActor = users.indexOf(recipientId);
    const [sender, recipient] = await Promise.all([keyFor(actor), keyFor(recipientActor)]);
    return encryptMessage({ body, conversationId: id.toLowerCase(), clientId: randomUUID(), sender: sender.record, recipient: recipient.record, unlocked: sender.unlocked });
  }
  const send = async (id, actor, body, status = 201) => call(`/conversations/${id}/messages`, {
    actor, method: 'POST', status, body: await encryptedInput(id, actor, body),
  });
  async function decrypt(id, message, actor, keys) {
    return decryptMessage({
      message, conversationId: id, ownUserId: users[actor], unlocked: (await keyFor(actor)).unlocked,
      sender: keys.find(key => key.id === message.senderKeyId), recipient: keys.find(key => key.id === message.recipientKeyId),
    });
  }

  await t.test('profile selections, project collaborators, and ownership survive reload', async () => {
    const instrument = (await call('/catalog/instruments')).instruments[0].id;
    const genre = (await call('/catalog/genres')).genres[0].id;
    await call('/profiles/me', { method: 'PUT', body: {
      instruments: [{ instrumentId: instrument, skillLevel: 'advanced', yearsExperience: 4 }], genreIds: [genre],
    } });
    await call('/profiles/me', { method: 'PUT', body: { bio: 'A synthetic musician biography.' } });
    const loaded = await call('/profiles/me');
    assert.equal(loaded.instruments[0].instrument_id, instrument);
    assert.equal(loaded.genres[0].genre_id, genre);
    const searchTerm = encodeURIComponent(`${marker} artist 0`);
    const matches = (await call(`/profiles/search?searchTerm=${searchTerm}&instrumentId=${instrument}&genreId=${genre}`)).profiles;
    assert.equal(matches.length, 1);
    assert.equal(matches[0].instruments[0].instrument_id, instrument);
    assert.equal(matches[0].genres[0].genre_id, genre);
    assert.equal((await call(`/profiles/search?searchTerm=${searchTerm}&instrumentId=${randomUUID()}&genreId=${genre}`)).profiles.length, 0);
    assert.equal((await call(`/profiles/search?searchTerm=${searchTerm}&instrumentId=${instrument}&genreId=${randomUUID()}`)).profiles.length, 0);
    const project = await call('/profiles/me/projects', { method: 'POST', status: 201, body: {
      name: 'Synthetic trio', role: 'Guitar', collaborators: [{ userId: users[1].toUpperCase(), role: ' Drums ', ignored: 'not persisted' }],
    } });
    const withProject = await call('/profiles/me');
    assert.equal(withProject.projects[0].collaborators[0].userId, users[1]);
    assert.equal(withProject.projects[0].collaborators[0].role, 'Drums');
    assert.equal(withProject.projects[0].collaborators[0].ignored, undefined);
    assert.equal((await call(`/profiles/me/projects/${project.id}`, { method: 'PUT', body: {} })).name, 'Synthetic trio');
    await call(`/profiles/me/projects/${project.id}`, { actor: 1, method: 'PUT', body: { name: 'Not allowed' }, status: 404 });
    await call(`/profiles/me/projects/${project.id}`, { method: 'PUT', body: {
      name: 'Synthetic quartet', collaborators: [],
    } });
    const refreshed = await call('/profiles/me');
    assert.equal(refreshed.projects[0].name, 'Synthetic quartet');
    assert.deepEqual(refreshed.projects[0].collaborators, []);
    await call('/profiles/me', { method: 'PUT', body: { instruments: [], genreIds: [] } });
    assert.deepEqual((await call('/profiles/me')).instruments, []);
    await call(`/profiles/me/projects/${project.id}`, { method: 'DELETE' });
  });

  await t.test('filtered and sorted pages are disjoint and drafts stay private', async () => {
    const instrument = (await call('/catalog/instruments')).instruments[0].id;
    const genre = (await call('/catalog/genres')).genres[0].id;
    const one = await announcement({ title: `${marker} A call`, instrumentIds: [instrument], genreIds: [genre] });
    const two = await announcement({ title: `${marker} B call` });
    const three = await announcement({ title: `${marker} C call` });
    for (const [id, days] of [[one.id, 3], [two.id, 20], [three.id, 40]]) {
      await realmConnector.execute("UPDATE announcements SET created_at = NOW() - $2 * INTERVAL '1 day' WHERE id = $1", [id, days]);
    }
    for (const body of [{ title: null }, { description: null }, { isPublished: null }]) {
      await call(`/announcements/${one.id}`, { method: 'PUT', body, status: 400 });
    }
    assert.equal((await call(`/announcements/${one.id}`)).title, one.title);
    const first = await call(`/announcements/search?city=${marker}&sort=title&pageSize=1`);
    const second = await call(`/announcements/search?city=${marker}&sort=title&pageSize=1&page=2`);
    assert.equal(first.pagination.hasMore, true);
    assert.equal(first.announcements[0].id, one.id);
    assert.equal(second.announcements[0].id, two.id);
    assert.equal(first.announcements[0].creatorName, `${marker} artist 0`);
    assert.equal(first.announcements[0].instruments[0].instrument_id, instrument);
    assert.equal(first.announcements[0].genres[0].genre_id, genre);
    await call(`/announcements/${one.id}/save`, { actor: 1, method: 'POST' });
    for (const [path, actor] of [['/announcements/me', 0], ['/announcements/saved', 1]]) {
      const card = (await call(path, { actor })).announcements.find(item => item.id === one.id);
      assert.equal(card.creatorName, `${marker} artist 0`);
      assert.equal(card.instruments[0].instrument_id, instrument);
      assert.equal(card.genres[0].genre_id, genre);
    }
    const filteredIds = async createdWithin => (await call(`/announcements/search?city=${marker}&sort=title&createdWithin=${createdWithin}`)).announcements.map(item => item.id);
    assert.deepEqual(await filteredIds('week'), [one.id]);
    assert.deepEqual(await filteredIds('month'), [one.id, two.id]);
    assert.deepEqual(await filteredIds(''), [one.id, two.id, three.id]);
    await realmConnector.execute("UPDATE profiles SET created_at = NOW() - INTERVAL '20 days' WHERE user_id = $1", [users[1]]);
    await realmConnector.execute("UPDATE profiles SET created_at = NOW() - INTERVAL '40 days' WHERE user_id = $1", [users[2]]);
    assert.deepEqual((await call(`/profiles/search?searchTerm=${marker}&createdWithin=week`)).profiles.map(item => item.userId), [users[0]]);
    assert.equal((await call(`/profiles/search?searchTerm=${marker}&createdWithin=month`)).profiles.length, 2);
    for (const path of ['/announcements/search', '/profiles/search']) await call(`${path}?createdWithin=year`, { status: 400 });
    await call('/announcements/search?sort=title;DROP', { status: 400 });
    await call('/profiles/search?page=2junk', { status: 400 });
    const profiles = await call(`/profiles/search?searchTerm=${marker}&sort=name&pageSize=2`);
    assert.equal(profiles.profiles.length, 2);
    assert.equal(profiles.pagination.hasMore, true);
    const nextProfiles = await call(`/profiles/search?searchTerm=${marker}&sort=name&pageSize=2&page=2`);
    assert.equal(nextProfiles.profiles.length, 1);
    assert.equal(profiles.profiles.some(person => person.id === nextProfiles.profiles[0].id), false);
    const draft = await announcement({ isPublished: false });
    await call(`/announcements/${draft.id}`, { actor: 1, status: 404 });
    await call(`/announcements/${draft.id}/comments`, { actor: 1, method: 'POST', body: { body: 'Private draft test' }, status: 404 });
    assert.equal((await call(`/announcements/${one.id}`)).creatorEmail, undefined);
    const comment = await call(`/announcements/${one.id}/comments`, {
      actor: 1, method: 'POST', status: 201, body: { body: 'Can we collaborate remotely?' },
    });
    assert.equal((await call(`/announcements/${one.id}/comments`)).comments[0].body, 'Can we collaborate remotely?');
    await call(`/announcements/${one.id}/comments/${comment.id}`, { actor: 2, method: 'DELETE', status: 404 });
    await call(`/announcements/${one.id}/comments/${comment.id}`, { actor: 1, method: 'DELETE' });
    await Promise.all([1, 2].map(actor => call(`/announcements/${one.id}/react`, {
      actor, method: 'POST', body: { reactionType: 'like' },
    })));
    assert.equal((await call(`/announcements/${one.id}`)).stats.likes, 2);
  });

  await t.test('images are decoded, optimized, owner-scoped, and published only when attached', async () => {
    const image = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#ff4f8b' } }).png().toBuffer();
    const media = await call('/media', { method: 'POST', status: 201, body: {
      data: image.toString('base64'), mimeType: 'image/png', purpose: 'announcement',
    } });
    const unpublished = await app.inject(`/realm/media/${media.id}`);
    assert.equal(unpublished.statusCode, 404);
    const post = await announcement({ pictureUrl: media.url.replace(media.id, media.id.toUpperCase()) });
    assert.equal(post.pictureUrl, media.url);
    const downloaded = await app.inject(`/realm/media/${media.id.toUpperCase()}`);
    assert.equal(downloaded.statusCode, 200);
    assert.match(downloaded.headers['content-type'], /image\/webp/);
    assert.equal((await sharp(downloaded.rawPayload).metadata()).format, 'webp');
    await call('/profiles/me', { actor: 1, method: 'PUT', body: { profilePictureUrl: media.url }, status: 400 });
    assert.equal((await call('/profiles/me', { actor: 1 })).profilePictureUrl, null);
    await call(`/announcements/${post.id}`, { method: 'PUT', body: { pictureUrl: null } });
    await call('/media', { method: 'POST', status: 400, body: {
      data: Buffer.from('<svg></svg>').toString('base64'), mimeType: 'image/png', purpose: 'profile',
    } });
  });

  await t.test('private messages deduplicate retries, enforce membership, and support read/archive/block', async () => {
    await call('/conversations', { method: 'POST', status: 400, body: { recipientUserId: users[0].toUpperCase() } });
    const conversation = await call('/conversations', { method: 'POST', status: 201, body: { recipientUserId: users[1].toUpperCase() } });
    const same = await call('/conversations', { actor: 1, method: 'POST', status: 201, body: { recipientUserId: users[0] } });
    assert.equal(same.id, conversation.id);
    const input = await encryptedInput(conversation.id, 0, 'Hello, shall we rehearse?');
    const message = await call(`/conversations/${conversation.id}/messages`, { method: 'POST', status: 201, body: input });
    const retry = await call(`/conversations/${conversation.id.toUpperCase()}/messages`, { method: 'POST', status: 201, body: input });
    assert.equal(message.id, retry.id);
    await call(`/conversations/${conversation.id}/messages`, { actor: 2, status: 404 });
    await call(`/conversations/${conversation.id}/messages`, { actor: 2, method: 'POST', body: { ...input, clientId: randomUUID() }, status: 404 });
    const received = await call(`/conversations/${conversation.id}/messages`, { actor: 1 });
    assert.equal(received.messages.length, 1);
    assert.equal(received.messages[0].body, undefined);
    assert.equal((await decrypt(conversation.id, received.messages[0], 1, received.keys)).body, 'Hello, shall we rehearse?');
    assert.equal((await realmConnector.execute('SELECT body FROM messages WHERE id = $1', [message.id])).rows[0].body, null);
    await call(`/conversations/${conversation.id}/messages`, { method: 'POST', body: { body: 'No plaintext downgrade', clientId: randomUUID() }, status: 426 });
    assert.equal((await call('/conversations', { actor: 1 })).conversations.find(c => c.id === conversation.id).unreadCount, 1);
    await call(`/conversations/${conversation.id.toUpperCase()}`, { actor: 1, method: 'PATCH', body: { read: true, archived: true } });
    assert.equal((await call('/notifications', { actor: 1 })).unreadCount, 0);
    assert.equal((await call('/conversations', { actor: 1 })).conversations.length, 0);
    await call(`/conversations/${conversation.id}`, { actor: 1, method: 'PATCH', body: { blocked: true } });
    await call(`/conversations/${conversation.id}/messages`, { method: 'POST', body: { ...input, clientId: randomUUID() }, status: 403 });
    await call(`/conversations/${conversation.id}`, { actor: 1, method: 'PATCH', body: { blocked: false, archived: false } });
    await call(`/conversations/${conversation.id}/messages/${message.id}`, { actor: 1, method: 'DELETE', status: 404 });
    await call(`/conversations/${conversation.id}/messages/${message.id}`, { method: 'DELETE' });
    assert.equal((await call(`/conversations/${conversation.id}/messages`, { actor: 1 })).messages[0].isDeleted, true);
  });

  await t.test('notifications and analytics respect consent and reject push SSRF endpoints', async () => {
    await call('/preferences', { method: 'PUT', body: { analytics: true } });
    await call('/preferences', { actor: 1, method: 'PUT', body: { analytics: true } });
    await call('/preferences', { method: 'PUT', body: { profileViews: true, messages: false, engagements: false, announcements: false } });
    for (let i = 0; i < 2; i += 1) {
      await call('/analytics/events', { actor: 1, method: 'POST', body: { kind: 'profile_view', resourceId: users[0] } });
    }
    assert.equal((await call('/notifications')).notifications.filter(item => item.kind === 'profile_view').length, 1);
    const conversation = await call('/conversations', { actor: 1, method: 'POST', status: 201, body: { recipientUserId: users[0] } });
    const before = (await call('/notifications')).notifications.length;
    await send(conversation.id, 1, 'Synthetic muted notification.');
    await call(`/profiles/${users[1]}/follow`, { method: 'POST' });
    await announcement({}, 1);
    assert.equal((await call('/notifications')).notifications.length, before);
    const post = await announcement();
    await call(`/announcements/${post.id}/comments`, { actor: 1, method: 'POST', status: 201, body: { body: 'Synthetic muted comment.' } });
    await call(`/announcements/${post.id}/react`, { actor: 1, method: 'POST', body: { reactionType: 'like' } });
    assert.equal((await call('/notifications')).notifications.length, before);
    await call('/analytics/events', { actor: 1, method: 'POST', body: { kind: 'announcement_view', resourceId: post.id } });
    const report = await call('/analytics');
    assert.equal(report.daily.find(row => row.kind === 'announcement_view').count, 1);
    assert.equal(JSON.stringify(report).includes(users[1]), false);
    await call('/preferences', { actor: 1, method: 'PUT', body: { analytics: false } });
    await call('/analytics/events', { actor: 1, method: 'POST', body: { kind: 'announcement_view', resourceId: post.id } });
    assert.equal((await call('/analytics')).daily.find(row => row.kind === 'announcement_view').count, 1);
    await call('/preferences', { method: 'PUT', body: { analytics: false } });
    assert.deepEqual((await call('/analytics')).daily, []);
    const subscription = {
      endpoint: 'https://127.0.0.1/internal',
      keys: { auth: randomBytes(16).toString('base64url'), p256dh: randomBytes(65).toString('base64url') },
    };
    await call('/push/subscriptions', { method: 'POST', body: subscription, status: 400 });
    await call(`/profiles/${users[0]}/follow`, { actor: 1, method: 'POST' });
    await announcement();
    const center = await call('/notifications', { actor: 1 });
    assert.ok(center.notifications.some(n => n.kind === 'announcement'));
    await call('/notifications', { actor: 1, method: 'PATCH', body: { read: true } });
    assert.equal((await call('/notifications', { actor: 1 })).unreadCount, 0);
  });

  await t.test('authenticated event streams deliver committed updates without leaking private events', async () => {
    await call('/events', { actor: null, status: 401 });
    const base = await app.listen({ port: 0, host: '127.0.0.1' });
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), 5000);
    const readers = [];
    try {
      for (const actor of [1, 2]) {
        const response = await fetch(`${base}/realm/events`, {
          headers: { Authorization: `Bearer ${tokens[actor]}` }, signal: controller.signal,
        });
        assert.equal(response.status, 200);
        assert.match(response.headers.get('content-type'), /text\/event-stream/);
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        assert.match((await reader.read()).value, /"type":"connected"/);
        readers.push(reader);
      }
      const conversation = await call('/conversations', { method: 'POST', status: 201, body: { recipientUserId: users[1] } });
      await send(conversation.id, 0, 'Synthetic private live message');
      const barrier = randomUUID();
      await publishEvent(realmConnector, 'profiles.changed', { id: barrier });
      const untilBarrier = async reader => {
        let output = '';
        while (!output.includes(barrier)) {
          const { value, done } = await reader.read();
          assert.equal(done, false);
          output += value;
        }
        return output;
      };
      const [recipientEvents, unrelatedEvents] = await Promise.all(readers.map(untilBarrier));
      assert.match(recipientEvents, /messages\.changed/);
      assert.equal(recipientEvents.includes('Synthetic private live message'), false);
      assert.doesNotMatch(unrelatedEvents, /messages\.changed|notifications\.changed/);
    } finally {
      controller.abort();
      clearTimeout(deadline);
      await Promise.all(readers.map(reader => reader.cancel().catch(error => {
        if (error.name !== 'AbortError') throw error;
      })));
    }
  });

  await t.test('durable push jobs redact message content, remove gone subscriptions, and bound retries', async () => {
    const browserKey = createECDH('prime256v1');
    browserKey.generateKeys();
    const subscription = {
      endpoint: `https://fcm.googleapis.com/fcm/send/synthetic-${randomUUID()}`,
      keys: { p256dh: browserKey.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') },
    };
    await call('/push/subscriptions', { actor: 1, method: 'POST', body: subscription, status: 201 });
    const conversation = await call('/conversations', { method: 'POST', status: 201, body: { recipientUserId: users[1] } });
    const enqueue = () => send(conversation.id, 0, 'Never include this private message in push payloads');
    await enqueue();
    const payloads = [];
    const logger = { error() {}, warn() {} };
    const dispatcher = new PushDispatcher({ config: pushConfig, logger, send: async (_subscription, payload) => {
      payloads.push(JSON.parse(payload));
    } });
    await dispatcher.dispatch();
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].body, 'You have a new message');
    assert.equal(JSON.stringify(payloads).includes('Never include'), false);
    assert.equal((await realmConnector.execute(
      'SELECT push_sent FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [users[1]],
    )).rows[0].push_sent, true);

    await enqueue();
    const gone = new PushDispatcher({ config: pushConfig, logger, send: async () => {
      throw Object.assign(new Error('Synthetic expired subscription'), { statusCode: 410 });
    } });
    await gone.dispatch();
    assert.equal((await realmConnector.execute('SELECT id FROM push_subscriptions WHERE user_id = $1', [users[1]])).rowCount, 0);

    await call('/push/subscriptions', { actor: 1, method: 'POST', body: subscription, status: 201 });
    await enqueue();
    let attempts = 0;
    const failing = new PushDispatcher({ config: pushConfig, logger, send: async () => {
      attempts += 1;
      throw Object.assign(new Error('Synthetic provider outage'), { statusCode: 503 });
    } });
    for (let i = 0; i < 4; i += 1) {
      await realmConnector.execute('UPDATE notifications SET next_push_at = NOW() WHERE user_id = $1', [users[1]]);
      await failing.dispatch();
    }
    assert.equal(attempts, 3);
    assert.equal((await realmConnector.execute(
      'SELECT push_attempts FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1', [users[1]],
    )).rows[0].push_attempts, 3);
  });

  await t.test('Google sign-in consumes a one-time provider-verified nonce', async () => {
    const challenge = await call('/auth/google/challenge', { actor: null, method: 'POST', status: 201, body: {} });
    const googleId = randomUUID();
    let googleNonce = challenge.nonce;
    t.mock.method(googleIdentityBridge, 'verifyCredential', async () => ({
      googleId, email: `${marker}-google@example.test`, emailVerified: true, nonce: googleNonce,
      givenName: 'Synthetic', familyName: 'Musician',
    }));
    const login = await call('/auth/login/google', { actor: null, method: 'POST', body: { idToken: 'synthetic-provider-token', challengeId: challenge.id } });
    users.push(login.user.userId);
    assert.ok(login.accessToken);
    assert.equal(login.isNewUser, true);
    await call('/auth/login/google', { actor: null, method: 'POST', body: { idToken: 'synthetic-provider-token', challengeId: challenge.id }, status: 401 });
    const resetToken = randomBytes(32).toString('base64url');
    await realmConnector.execute(`
      UPDATE users SET reset_password_token_hash = $2, reset_password_expires = NOW() + INTERVAL '1 hour' WHERE id = $1`,
    [login.user.userId, cipherEngine.hashToken(resetToken)]);
    await call('/auth/password-reset/complete', { actor: null, method: 'POST', body: { token: resetToken, newPassword: 'Synthetic1NativePassword' } });
    await call('/auth/refresh-token', { actor: null, method: 'POST', body: { refreshToken: login.refreshToken }, status: 401 });
    const passwordLogin = await call('/auth/login', { actor: null, method: 'POST', body: {
      email: `${marker}-google@example.test`, password: 'Synthetic1NativePassword',
    } });
    assert.equal(passwordLogin.user.userId, login.user.userId);
    const again = await call('/auth/google/challenge', { actor: null, method: 'POST', status: 201, body: {} });
    googleNonce = again.nonce;
    const returning = await call('/auth/login/google', { actor: null, method: 'POST', body: { idToken: 'synthetic-provider-token', challengeId: again.id } });
    assert.equal(returning.user.userId, login.user.userId);
    assert.equal(returning.isNewUser, false);
  });

  await t.test('key resets preserve encrypted history, backups stay private, and invalid publications fail closed', async () => {
    const conversation = await call('/conversations', { method: 'POST', status: 201, body: { recipientUserId: users[1] } });
    const old = await keyFor(0);
    await call(`/encryption/me/${old.record.id}`, { actor: 1, status: 404 });
    const historicalInput = await encryptedInput(conversation.id, 0, 'Synthetic encrypted history before a key reset.');
    const historical = await call(`/conversations/${conversation.id}/messages`, { method: 'POST', status: 201, body: historicalInput });
    await call('/encryption/me', { method: 'POST', status: 400, body: {
      signingKey: { ...old.record.signingKey, d: 'not-public-material' }, encryptionKey: old.record.encryptionKey,
      identityProof: old.record.identityProof, encryptedPrivateKey: old.record.encryptedPrivateKey, replaceKeyId: old.record.id,
    } });
    const recovery = generateRecoveryKey();
    const generated = await createIdentity(users[0], recovery);
    await call('/encryption/me', { method: 'POST', status: 400, body: {
      ...generated.publication, encryptedPrivateKey: 'Never store an unencrypted private key', replaceKeyId: old.record.id,
    } });
    const record = await call('/encryption/me', { method: 'POST', status: 201, body: { ...generated.publication, replaceKeyId: old.record.id } });
    clientKeys.set(0, { record, recovery, unlocked: await unlockIdentity(record, recovery) });
    assert.equal((await call('/encryption/me')).keys[0].id, record.id);
    assert.equal((await call(`/encryption/me/${old.record.id}`)).isCurrent, false);
    const retry = await call(`/conversations/${conversation.id}/messages`, { method: 'POST', status: 201, body: historicalInput });
    assert.equal(retry.id, historical.id);
    const history = await call(`/conversations/${conversation.id}/messages`, { actor: 1 });
    const message = history.messages.find(row => row.id === historical.id);
    assert.equal((await decrypt(conversation.id, message, 1, history.keys)).body, 'Synthetic encrypted history before a key reset.');
    assert.equal((await decryptMessage({
      message, conversationId: conversation.id, ownUserId: users[0], unlocked: await unlockIdentity(old.record, old.recovery),
      sender: history.keys.find(key => key.id === message.senderKeyId), recipient: history.keys.find(key => key.id === message.recipientKeyId),
    })).body, 'Synthetic encrypted history before a key reset.');
  });

  await t.test('admin analytics require a live role and separate mutual platform consent', async () => {
    const email = `${marker}-admin@example.test`;
    const adminId = (await realmConnector.execute('INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email])).rows[0].id;
    users.push(adminId);
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [adminId, 'Synthetic administrator']);
    const adminActor = tokens.length;
    tokens.push(cipherEngine.createAccessToken(adminId, email));
    for (const actor of [0, adminActor]) await call('/admin/analytics', { actor, status: 403 });
    await administrationRepository.changeRole(email, 'admin');
    assert.equal((await call('/account', { actor: adminActor })).role, 'admin');
    assert.deepEqual((await call('/admin/analytics', { actor: adminActor })).daily, []);
    await call('/preferences', { method: 'PUT', body: { platformAnalytics: true }, status: 400 });
    await call('/preferences', { method: 'PUT', body: { analytics: true, platformAnalytics: true } });
    await call('/preferences', { actor: 1, method: 'PUT', body: { analytics: true, platformAnalytics: true } });
    const post = await announcement();
    await call('/analytics/events', { actor: 1, method: 'POST', body: { kind: 'announcement_view', resourceId: post.id } });
    const platform = await call('/admin/analytics', { actor: adminActor });
    assert.equal(platform.daily.find(row => row.kind === 'announcement_view').count, 1);
    assert.equal(platform.content.find(row => row.id === post.id).views, 1);
    assert.equal(JSON.stringify(platform.daily).includes(users[1]), false);
    await call('/preferences', { actor: 1, method: 'PUT', body: { platformAnalytics: false } });
    await call('/analytics/events', { actor: 1, method: 'POST', body: { kind: 'announcement_view', resourceId: post.id } });
    assert.equal((await call('/admin/analytics', { actor: adminActor })).daily.find(row => row.kind === 'announcement_view').count, 1);
    await call('/preferences', { method: 'PUT', body: { platformAnalytics: false } });
    assert.deepEqual((await call('/admin/analytics', { actor: adminActor })).daily, []);
    assert.ok((await call('/analytics')).daily.find(row => row.kind === 'announcement_view').count >= 2);
    await administrationRepository.changeRole(email, 'member');
    await call('/admin/analytics', { actor: adminActor, status: 403 });
    await administrationRepository.changeRole(email, 'admin');
  });

  await t.test('reported evidence is participant-authorized, sender-verified and audited without admin chat access', async () => {
    const adminActor = tokens.length - 1;
    const adminId = (await call('/account', { actor: adminActor })).userId;
    const conversation = await call('/conversations', { method: 'POST', status: 201, body: { recipientUserId: users[1] } });
    const sent = await send(conversation.id, 0, 'A synthetic message explicitly selected as report evidence.');
    const received = await call(`/conversations/${conversation.id}/messages`, { actor: 1 });
    const message = received.messages.find(item => item.id === sent.id);
    const evidence = await decrypt(conversation.id, message, 1, received.keys);
    const notAnAccessToken = await app.inject({ method: 'GET', url: '/realm/account', headers: { authorization: `Bearer ${evidence.signedEvidence}` } });
    assert.equal(notAnAccessToken.statusCode, 401);
    const reportBody = {
      reportedUserId: users[0], messageId: sent.id, category: 'spam',
      details: 'A fictional concern for integration testing.', signedEvidence: evidence.signedEvidence, consent: true,
    };
    await call(`/conversations/${conversation.id}/messages`, { actor: adminActor, status: 404 });
    const foreign = await call('/reports', { actor: 2, method: 'POST', body: reportBody, status: 404 });
    const missing = await call('/reports', { actor: 2, method: 'POST', body: { ...reportBody, messageId: randomUUID() }, status: 404 });
    assert.deepEqual(foreign.error, missing.error);
    await call(`/encryption/me/${(await keyFor(0)).record.id}`, { actor: adminActor, status: 404 });
    await call('/reports', { actor: 1, method: 'POST', body: { ...reportBody, consent: false }, status: 400 });
    const other = await send(conversation.id, 0, 'A different synthetic message.');
    await call('/reports', { actor: 1, method: 'POST', body: { ...reportBody, messageId: other.id }, status: 400 });
    const report = await call('/reports', { actor: 1, method: 'POST', body: reportBody, status: 201 });
    await call('/reports', { actor: 1, method: 'POST', body: reportBody, status: 409 });
    await call(`/admin/reports/${report.id}`, { actor: 1, status: 403 });
    assert.equal((await call('/reports/me', { actor: 2 })).reports.length, 0);
    assert.equal((await call('/reports/me', { actor: 1 })).reports[0].id, report.id);
    const queue = await call('/admin/reports?status=open', { actor: adminActor });
    assert.equal(queue.reports.some(row => row.id === report.id), true);
    assert.equal(JSON.stringify(queue).includes('explicitly selected'), false);
    const detail = await call(`/admin/reports/${report.id}`, { actor: adminActor });
    assert.equal(detail.evidence, 'A synthetic message explicitly selected as report evidence.');
    assert.equal(detail.evidenceVerified, true);
    await call(`/admin/reports/${report.id}`, { actor: adminActor, method: 'PATCH', body: { action: 'remove_message', note: 'Synthetic report reviewed and selected message removed.' } });
    const deleted = (await call(`/conversations/${conversation.id}/messages`, { actor: 1 })).messages.find(row => row.id === sent.id);
    assert.equal(deleted.isDeleted, true);
    assert.equal(deleted.removedByModeration, true);
    assert.equal(deleted.ciphertext, null);
    const audit = await call('/admin/audit', { actor: adminActor });
    assert.ok(audit.entries.some(row => row.action === 'report_viewed' && row.reportId === report.id));
    assert.ok(audit.entries.some(row => row.action === 'message_removed' && row.targetId === sent.id));
    assert.equal(JSON.stringify(audit).includes('explicitly selected'), false);
    const protectedReport = await call('/reports', { actor: 1, method: 'POST', status: 201, body: {
      reportedUserId: adminId, category: 'other', details: 'Synthetic administrator concern.', consent: true,
    } });
    await call(`/admin/reports/${protectedReport.id}`, { actor: adminActor, method: 'PATCH', status: 403, body: { action: 'suspend_user', note: 'Cannot suspend an administrator here.' } });
    const visiblePost = await announcement({}, 2);
    const suspend = await call('/reports', { actor: 1, method: 'POST', status: 201, body: {
      reportedUserId: users[2], category: 'other', details: 'Synthetic suspension test concern.', consent: true,
    } });
    await call(`/admin/reports/${suspend.id}`, { actor: adminActor, method: 'PATCH', body: { action: 'suspend_user', note: 'Synthetic account suspended following review.' } });
    await call('/account', { actor: 2, status: 401 });
    await call(`/profiles/${users[2]}`, { status: 404 });
    await call(`/announcements/${visiblePost.id}`, { status: 404 });
    await call('/analytics/events', { actor: 1, method: 'POST', status: 404, body: { kind: 'announcement_view', resourceId: visiblePost.id } });
    assert.equal((await call(`/announcements/search?city=${marker}`)).announcements.some(row => row.id === visiblePost.id), false);
  });
});
