import test from 'node:test';
import assert from 'node:assert/strict';
import { createECDH, randomUUID } from 'node:crypto';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { notificationRepository } from '../../src/repositories/notification-repository.js';
import { PushDispatcher } from '../../src/engines/push-dispatcher.js';
import { NativePush } from '../../src/engines/native-push.js';
import { NotificationEmailWorker } from '../../src/engines/notification-email-worker.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

const quiet = { info() {}, warn() {}, error() {} };

test('polish backend: project instruments and localized push and email text', async (t) => {
  const marker = `polish-${randomUUID()}`;
  const users = [];
  const emails = [];
  const tokens = [];
  await realmConnector.establish();
  const app = await buildNexus({
    config: { ...realmConfig, boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 } },
    logger: false, backgroundJobs: false,
  });
  t.after(async () => {
    await app.close();
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });
  for (let i = 0; i < 3; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email],
    );
    users.push(rows[0].id);
    emails.push(email);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} ${i}`]);
  }
  async function call(path, { actor = 0, method = 'GET', body, status = 200 } = {}) {
    const response = await app.inject({ method, url: `/realm${path}`, headers: { authorization: `Bearer ${tokens[actor]}` }, payload: body });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return status < 400 ? response.json().data : response.json().error;
  }
  const { rows: catalog } = await realmConnector.execute('SELECT id, name FROM instruments ORDER BY name, id LIMIT 11');
  assert.equal(catalog.length, 11, 'the bootstrap catalog has enough instruments');
  const names = instruments => instruments.map(item => item.name);

  await t.test('projects keep catalog instruments: omitted leaves them, [] clears them, and input is checked', async () => {
    const created = await call('/profiles/me/projects', {
      method: 'POST', status: 201,
      body: { name: `${marker} trio`, instrumentIds: [catalog[1].id, catalog[0].id, catalog[0].id.toUpperCase()] },
    });
    assert.deepEqual(names(created.instruments), [catalog[0].name, catalog[1].name]);
    const path = `/profiles/me/projects/${created.id}`;
    assert.deepEqual(names((await call('/profiles/me')).projects[0].instruments), [catalog[0].name, catalog[1].name]);

    const renamed = await call(path, { method: 'PUT', body: { name: `${marker} quartet` } });
    assert.deepEqual(names(renamed.instruments), [catalog[0].name, catalog[1].name], 'omitted instruments stay unchanged');
    const replaced = await call(path, { method: 'PUT', body: { instrumentIds: [catalog[2].id] } });
    assert.equal(replaced.name, `${marker} quartet`);
    assert.deepEqual(names(replaced.instruments), [catalog[2].name]);
    const visitor = await call(`/profiles/${users[0]}`, { actor: 1 });
    assert.deepEqual(visitor.projects[0].instruments, [{ instrument_id: catalog[2].id, name: catalog[2].name, category: replaced.instruments[0].category }]);

    const tooMany = await call(path, { method: 'PUT', status: 400, body: { instrumentIds: catalog.map(item => item.id) } });
    assert.equal(tooMany.code, 'VALIDATION_ERROR');
    for (const instrumentIds of [null, 'not-a-list', ['not-a-uuid']]) {
      assert.equal((await call(path, { method: 'PUT', status: 400, body: { instrumentIds } })).code, 'VALIDATION_ERROR');
    }
    const unknown = await call(path, { method: 'PUT', status: 400, body: { name: `${marker} unknown`, instrumentIds: [catalog[3].id, randomUUID()] } });
    assert.equal(unknown.code, 'INVALID_INSTRUMENT');
    const unchanged = (await call('/profiles/me')).projects[0];
    assert.equal(unchanged.name, `${marker} quartet`, 'a rejected instrument rolls back the whole update');
    assert.deepEqual(names(unchanged.instruments), [catalog[2].name]);
    assert.equal((await call(path, { actor: 1, method: 'PUT', status: 404, body: { instrumentIds: [] } })).code, 'PROJECT_NOT_FOUND');

    const exported = await call('/account/export');
    assert.deepEqual(exported.projectInstruments.map(row => [row.projectId, row.projectName, row.instrument]),
      [[created.id, `${marker} quartet`, catalog[2].name]]);
    assert.deepEqual((await call('/account/export', { actor: 1 })).projectInstruments, [], 'exports contain only your own projects');

    assert.deepEqual((await call(path, { method: 'PUT', body: { instrumentIds: [] } })).instruments, []);
    await call(path, { method: 'PUT', body: { instrumentIds: [catalog[4].id] } });
    await call(path, { method: 'DELETE' });
    const { rows } = await realmConnector.execute('SELECT 1 FROM project_instruments WHERE project_id = $1', [created.id]);
    assert.equal(rows.length, 0, 'removing a project removes its instruments');
  });

  await t.test('push text is built from the kind in the recipient language without private content', async () => {
    await realmConnector.execute("INSERT INTO user_preferences (user_id, push, locale) VALUES ($1, TRUE, 'it')", [users[2]]);
    await realmConnector.execute(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)`, [
      users[2], `https://fcm.googleapis.com/fcm/send/${marker}`,
      createECDH('prime256v1').generateKeys().toString('base64url'), Buffer.alloc(16, 3).toString('base64url'),
    ]);
    const token = `synthetic-${marker}-device-token-with-enough-length`;
    await realmConnector.execute("INSERT INTO push_devices (user_id, platform, token) VALUES ($1, 'android', $2)", [users[2], token]);
    const id = await realmConnector.transaction(executor => notificationRepository.create(executor, {
      userId: users[2], kind: 'calendar_invite', title: 'You are invited: Synthetic private rehearsal',
      link: '#calendar', key: `${marker}:calendar`,
      params: { entryId: randomUUID(), title: 'Synthetic private rehearsal', change: 'invited' },
    }));
    const web = [];
    const native = [];
    const dispatcher = new PushDispatcher({
      config: { publicKey: 'synthetic-public', privateKey: 'synthetic-private', subject: 'mailto:push@example.test' },
      send: async (subscription, body) => { if (subscription.endpoint.endsWith(marker)) web.push(JSON.parse(body)); },
      nativePush: new NativePush({}, {
        providers: { android: { send: async (device, payload) => { if (device === token) native.push(payload); return 'sent'; } } },
        logger: quiet,
      }),
      logger: quiet,
    });
    for (let attempt = 0; attempt < 5 && !web.length; attempt += 1) await dispatcher.dispatch();
    const expected = {
      title: 'Sei stato invitato a un appuntamento',
      body: 'Sei stato invitato a una prova, un concerto o un altro appuntamento. Apri Every.music per rispondere.',
      tag: id, url: '#calendar',
    };
    assert.deepEqual(web, [expected]);
    assert.deepEqual(native, [expected]);
    assert.equal(JSON.stringify([web, native]).includes('Synthetic private'), false);
    const { rows: [stored] } = await realmConnector.execute('SELECT push_sent FROM notifications WHERE id = $1', [id]);
    assert.equal(stored.push_sent, true);
  });

  await t.test('emails for newer kinds use their own localized text instead of the generic fallback', async () => {
    await realmConnector.execute("UPDATE user_preferences SET locale = 'nl', push = FALSE WHERE user_id = $1", [users[2]]);
    await call('/preferences/notifications', {
      actor: 2, method: 'PUT', body: { kinds: { application_status: { email: true }, organization_membership: { email: true } } },
    });
    for (const [kind, params] of [
      ['application_status', { applicationId: randomUUID(), title: 'Synthetic private call', status: 'accepted' }],
      ['organization_membership', { organizationId: randomUUID(), organizationName: 'Synthetic private band', change: 'leader' }],
    ]) {
      await realmConnector.transaction(executor => notificationRepository.create(executor, {
        userId: users[2], kind, title: `Synthetic ${kind}`, link: `#notifications?ref=${randomUUID()}`, key: `${marker}:${kind}`, params,
      }));
    }
    const sent = [];
    const worker = new NotificationEmailWorker({
      origin: 'https://app.example.test', logger: quiet,
      mailer: { available: true, async send(to, message) { if (to === emails[2]) sent.push(message); } },
    });
    await worker.dispatch();
    assert.deepEqual(sent.map(message => message.subject).sort(), [
      'Je bent nu de leider van een pagina | Every.music',
      'Je sollicitatie is geaccepteerd | Every.music',
    ]);
    for (const message of sent) {
      assert.equal(message.locale, 'nl');
      assert.equal(`${message.text}${message.html}`.includes('Synthetic private'), false);
      assert.equal(message.text.includes('Open Every.music om deze te bekijken.'), false, 'not the generic fallback body');
    }
  });
});
