import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { notificationRepository } from '../../src/repositories/notification-repository.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

test('platform foundation: plans, localized notifications, and locale preference', async (t) => {
  const marker = `foundation-${randomUUID()}`;
  const users = [];
  const tokens = [];
  await realmConnector.establish();
  const app = await buildNexus({
    config: { ...realmConfig, boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 } },
    logger: false, backgroundJobs: false,
  });
  t.after(async () => {
    await app.close();
    await realmConnector.execute('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });
  for (let i = 0; i < 3; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email, i === 2 ? 'admin' : 'member'],
    );
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} ${i}`]);
  }
  async function call(path, { actor = 0, method = 'GET', body, status = 200 } = {}) {
    const response = await app.inject({ method, url: `/realm${path}`, headers: { authorization: `Bearer ${tokens[actor]}` }, payload: body });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.json().data;
  }

  await t.test('free plan limits come from configuration until an admin grants a plan', async () => {
    const free = await call('/entitlements/me');
    assert.equal(free.plan, 'free');
    assert.deepEqual(free.limits, realmConfig.entitlements.free);
    await call(`/admin/users/${users[0]}/entitlements`, { method: 'POST', body: { plan: 'premium', days: 30 }, status: 403 });
    const granted = await call(`/admin/users/${users[0]}/entitlements`, { actor: 2, method: 'POST', body: { plan: 'premium', days: 30 }, status: 201 });
    const premium = await call('/entitlements/me');
    assert.equal(premium.plan, 'premium');
    assert.equal(premium.limits.maxActiveAnnouncements, realmConfig.entitlements.premium.maxActiveAnnouncements);
    assert.equal(premium.entitlements[0].id, granted.id);
    await call(`/admin/entitlements/${granted.id}`, { actor: 2, method: 'DELETE' });
    assert.equal((await call('/entitlements/me')).plan, 'free');
    const { rows } = await realmConnector.execute('SELECT action FROM admin_audit WHERE actor_id = $1 ORDER BY created_at', [users[2]]);
    assert.deepEqual(rows.map(row => row.action), ['entitlement_granted', 'entitlement_revoked']);
  });

  await t.test('notifications carry localization params and honor channel availability', async () => {
    await realmConnector.transaction(async executor => {
      assert.ok(await notificationRepository.create(executor, {
        userId: users[1], kind: 'new_follower', title: 'You have a new follower', link: '#profile', key: `${marker}:follow`,
        params: { name: 'Synthetic' },
      }));
      assert.equal(await notificationRepository.create(executor, {
        userId: users[1], kind: 'new_follower', title: 'Duplicate', link: '#profile', key: `${marker}:follow`,
      }), null);
      assert.equal(await notificationRepository.create(executor, {
        userId: users[1], kind: 'come_back', title: 'We miss you', link: '#feed', key: `${marker}:come-back`,
      }), null, 'come_back has no in-app channel and push is off for this user');
      const fanned = await notificationRepository.createMany(executor, [users[0], users[1]], {
        kind: 'offers', title: 'Synthetic offer', link: '#feed', keyPrefix: `${marker}:offer`,
      });
      assert.equal(fanned.length, 2);
      await assert.rejects(notificationRepository.create(executor, { userId: users[1], kind: 'unknown', title: 'x', link: '#' }), /Unknown notification kind/);
    });
    const list = await call('/notifications', { actor: 1 });
    const follow = list.notifications.find(item => item.kind === 'new_follower');
    assert.deepEqual(follow.params, { name: 'Synthetic' });
    assert.equal(list.notifications.filter(item => item.kind === 'come_back').length, 0);
  });

  await t.test('locale is a validated preference', async () => {
    assert.equal((await call('/preferences', { method: 'PUT', body: { locale: 'it' } })).locale, 'it');
    assert.equal((await call('/preferences')).locale, 'it');
    await call('/preferences', { method: 'PUT', body: { locale: 'fr' }, status: 400 });
  });
});
