import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { notificationRepository } from '../../src/repositories/notification-repository.js';
import { notificationKinds } from '../../src/engines/notification-catalog.js';
import { NotificationEmailWorker } from '../../src/engines/notification-email-worker.js';
import { NotificationScheduler } from '../../src/engines/notification-scheduler.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

const quiet = { info() {}, warn() {}, error() {} };

test('notification channels: preferences, delivery, email outbox, and scheduled jobs', async (t) => {
  const marker = `channels-${randomUUID()}`;
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
    await realmConnector.execute("DELETE FROM notification_job_runs WHERE name LIKE 'test_%'");
    await realmConnector.disconnect();
  });
  for (let i = 0; i < 4; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified, last_login) VALUES ($1, $2, NOW()) RETURNING id', [email, i !== 2],
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
  const notify = (userId, kind, extra = {}) => realmConnector.transaction(executor => notificationRepository.create(executor, {
    userId, kind, title: `Synthetic ${kind}`, link: '#notifications', key: `${marker}:${randomUUID()}`, ...extra,
  }));
  const stored = async id => (await realmConnector.execute(
    'SELECT in_app, push_sent, email_status, email_attempts FROM notifications WHERE id = $1', [id],
  )).rows[0];
  const mine = sent => sent.filter(item => emails.includes(item.to));

  await t.test('GET lists every catalog kind with availability, defaults, and effective choices', async () => {
    const overview = await call('/preferences/notifications');
    assert.deepEqual(overview.kinds.map(item => item.kind), Object.keys(notificationKinds));
    assert.deepEqual(overview.categories, { messages: true, announcements: true, engagements: true, profileViews: false });
    assert.equal(overview.email.address, emails[0]);
    assert.equal(overview.email.verified, true);
    assert.equal(overview.email.configured, false);
    const kind = name => overview.kinds.find(item => item.kind === name);
    assert.deepEqual(kind('message').channels, {
      inApp: { availability: 'on', default: true, enabled: true },
      push: { availability: 'on', default: true, enabled: true },
      email: { availability: 'optional', default: false, enabled: false },
    });
    assert.deepEqual(kind('come_back').channels.inApp, { availability: 'off', default: false, enabled: false });
    assert.equal(kind('come_back').channels.email.enabled, true);
    assert.equal(kind('profile_view').channels.inApp.enabled, true, 'the profileViews switch is the in-app opt-in');
    assert.equal(kind('profile_view').categoryEnabled, false);
    assert.equal(kind('new_follower').category, null);
    assert.equal(kind('announcement_stats').planFeature, 'announcementStats');
    assert.equal(kind('announcement_stats').planAllowed, realmConfig.entitlements.free.announcementStats);
  });

  await t.test('PUT accepts partial updates, resets with null, and rejects unavailable channels', async () => {
    const error = await call('/preferences/notifications', {
      method: 'PUT', body: { kinds: { come_back: { inApp: true } } }, status: 400,
    });
    assert.equal(error.code, 'CHANNEL_UNAVAILABLE');
    assert.equal((await call('/preferences/notifications', {
      method: 'PUT', body: { kinds: { unknown_kind: { email: true } } }, status: 400,
    })).code, 'VALIDATION_ERROR');
    await call('/preferences/notifications', { method: 'PUT', body: { kinds: { message: { sms: true } } }, status: 400 });
    await call('/preferences/notifications', { method: 'PUT', body: {}, status: 400 });

    const updated = await call('/preferences/notifications', {
      method: 'PUT', body: { kinds: { message: { email: true }, comment: { inApp: false }, come_back: { inApp: false } } },
    });
    const kind = (overview, name) => overview.kinds.find(item => item.kind === name);
    assert.equal(kind(updated, 'message').channels.email.enabled, true);
    assert.equal(kind(updated, 'message').channels.inApp.enabled, true, 'omitted channels are unchanged');
    assert.equal(kind(updated, 'comment').channels.inApp.enabled, false);
    await call('/preferences/notifications', { method: 'PUT', body: { kinds: { message: { push: false } } } });
    const reread = await call('/preferences/notifications');
    assert.equal(kind(reread, 'message').channels.email.enabled, true);
    assert.equal(kind(reread, 'message').channels.push.enabled, false);

    await call('/preferences/notifications', { method: 'PUT', body: { kinds: { comment: { inApp: null }, message: { push: null } } } });
    const { rows } = await realmConnector.execute(
      'SELECT kind, in_app, push, email FROM notification_channel_preferences WHERE user_id = $1 ORDER BY kind', [users[0]],
    );
    assert.deepEqual(rows, [{ kind: 'message', in_app: null, push: null, email: true }],
      'rows reset to defaults are removed and off channels are never stored');
  });

  await t.test('delivery honors per-kind choices, category switches, push opt-in, and verification', async () => {
    const message = await notify(users[0], 'message');
    assert.deepEqual(await stored(message), { in_app: true, push_sent: true, email_status: 'pending', email_attempts: 0 });

    await call('/preferences/notifications', { method: 'PUT', body: { kinds: { comment: { inApp: false } } } });
    assert.equal(await notify(users[0], 'comment'), null, 'in-app opted out, push disabled, email not opted in');

    await call('/preferences', { method: 'PUT', body: { messages: false } });
    assert.equal(await notify(users[0], 'message'), null, 'the legacy category switch turns off every channel');
    await call('/preferences', { method: 'PUT', body: { messages: true } });

    await realmConnector.execute('INSERT INTO user_preferences (user_id, push) VALUES ($1, TRUE) ON CONFLICT (user_id) DO UPDATE SET push = TRUE', [users[1]]);
    assert.equal((await stored(await notify(users[1], 'new_follower'))).push_sent, true, 'optional push stays off until chosen');
    await call('/preferences/notifications', { actor: 1, method: 'PUT', body: { kinds: { new_follower: { push: true } } } });
    assert.equal((await stored(await notify(users[1], 'new_follower'))).push_sent, false, 'opted-in push is queued');

    await call('/preferences/notifications', { actor: 1, method: 'PUT', body: { kinds: { come_back: { email: false } } } });
    assert.equal(await notify(users[1], 'come_back'), null, 'an "on" email channel can be opted out');
    await call('/preferences/notifications', { actor: 1, method: 'PUT', body: { kinds: { come_back: { email: null } } } });

    assert.equal(await notify(users[2], 'come_back'), null, 'unverified accounts never receive email');
    await call('/preferences/notifications', { actor: 2, method: 'PUT', body: { kinds: { message: { email: true } } } });
    assert.equal((await stored(await notify(users[2], 'message'))).email_status, 'none');

    const fanned = await realmConnector.transaction(executor => notificationRepository.createMany(executor, users.slice(0, 2), {
      kind: 'comment', title: 'Synthetic fan-out', link: '#feed', keyPrefix: `${marker}:fan`,
    }));
    assert.equal(fanned.length, 1, 'createMany skips recipients without a channel');
  });

  await t.test('the email worker localizes, redacts, retries with backoff, and shares work safely', async () => {
    const logged = [];
    const idle = new NotificationEmailWorker({ mailer: { available: false }, logger: { ...quiet, info: message => logged.push(message) } });
    assert.equal(await idle.dispatch(), 0);
    assert.equal(await idle.dispatch(), 0);
    assert.equal(logged.length, 1, 'an unconfigured SMTP transport is reported once');

    await realmConnector.execute("UPDATE user_preferences SET locale = 'it' WHERE user_id = $1", [users[0]]);
    await call('/preferences/notifications', { actor: 3, method: 'PUT', body: { kinds: { message: { email: true } } } });
    const secret = await notify(users[0], 'message', {
      title: 'Synthetic secret title', link: '#messages?id=00000000-0000-4000-8000-000000000001',
      params: { preview: 'Synthetic secret message text', count: 2 },
    });
    const english = await notify(users[3], 'message');
    const sent = [];
    const slowMailer = {
      available: true,
      async send(to, message) {
        await new Promise(resolve => setTimeout(resolve, 20));
        sent.push({ to, ...message });
      },
    };
    const first = new NotificationEmailWorker({ origin: 'https://app.example.test/', mailer: slowMailer, logger: quiet });
    const second = new NotificationEmailWorker({ origin: 'https://app.example.test/', mailer: slowMailer, logger: quiet });
    await Promise.all([first.dispatch(), second.dispatch()]);
    const delivered = mine(sent);
    assert.equal(delivered.filter(item => item.to === emails[0]).length, 2, 'both pending emails for the user are sent exactly once');
    const italian = delivered.find(item => item.to === emails[0] && item.text.includes('#messages?id='));
    assert.match(italian.subject, /^Hai un nuovo messaggio/);
    assert.ok(italian.text.includes('https://app.example.test/#messages?id=00000000-0000-4000-8000-000000000001'));
    assert.ok(italian.html.includes('https://app.example.test/#settings?section=notifications'));
    for (const content of [italian.text, italian.html, italian.subject]) {
      assert.equal(content.includes('Synthetic secret'), false);
    }
    assert.match(delivered.find(item => item.to === emails[3]).subject, /^You have a new message/);
    assert.equal((await stored(secret)).email_status, 'sent');
    assert.equal((await stored(english)).email_status, 'sent');

    const retried = await notify(users[3], 'message');
    let attempts = 0;
    const failing = new NotificationEmailWorker({
      mailer: { available: true, async send(to) { if (emails.includes(to)) attempts += 1; throw Object.assign(new Error('Synthetic outage'), { responseCode: 451 }); } },
      logger: quiet,
    });
    await failing.dispatch();
    const { rows: [lease] } = await realmConnector.execute(
      "SELECT EXTRACT(EPOCH FROM next_email_at - NOW()) AS wait FROM notifications WHERE id = $1", [retried],
    );
    assert.ok(Number(lease.wait) > 240, 'a failed attempt backs off before retrying');
    for (let i = 0; i < 3; i += 1) {
      await realmConnector.execute('UPDATE notifications SET next_email_at = NOW() WHERE id = $1', [retried]);
      await failing.dispatch();
    }
    assert.equal(attempts, 3);
    assert.deepEqual(await stored(retried), { in_app: true, push_sent: true, email_status: 'failed', email_attempts: 3 });

    const skipped = await notify(users[3], 'message');
    await realmConnector.execute('UPDATE users SET is_active = FALSE WHERE id = $1', [users[3]]);
    await first.dispatch();
    await realmConnector.execute('UPDATE users SET is_active = TRUE WHERE id = $1', [users[3]]);
    assert.equal((await stored(skipped)).email_status, 'skipped', 'inactive accounts are skipped');
  });

  await t.test('scheduled jobs are idempotent, opt-in, and coordinated across processes', async () => {
    const settings = { ...realmConfig.notifications, statsDigestWeekday: 1, statsDigestMinimum: 1, comeBackAfterDays: 30, comeBackMaxReminders: 3, inviteNudgeAfterDays: 7 };
    const scheduler = new NotificationScheduler({ settings, logger: quiet });
    const other = new NotificationScheduler({ settings, logger: quiet });
    const claims = await Promise.all([scheduler.claim('test_lease', 60), other.claim('test_lease', 60)]);
    assert.deepEqual(claims.sort(), [false, true], 'only one process claims a job per interval');
    assert.equal(await scheduler.claim('test_lease', 60), false);

    const announcement = (await realmConnector.execute(
      "INSERT INTO announcements (user_id, title, description, city) VALUES ($1, $2, 'A synthetic call for digest tests.', 'Synthetic City') RETURNING id",
      [users[0], `${marker} digest`],
    )).rows[0].id;
    await realmConnector.execute("UPDATE user_preferences SET analytics = TRUE WHERE user_id = $1", [users[0]]);
    await realmConnector.execute(`
      INSERT INTO analytics_daily (user_id, day, kind, resource_id, count) VALUES
        ($1, CURRENT_DATE - 1, 'announcement_view', $2, 5), ($1, CURRENT_DATE - 3, 'announcement_view', $2, 2),
        ($1, CURRENT_DATE - 2, 'like', $2, 3), ($1, CURRENT_DATE - 2, 'save', $2, 1),
        ($1, CURRENT_DATE, 'announcement_view', $2, 50), ($1, CURRENT_DATE - 1, 'profile_view', $1, 4)`, [users[0], announcement]);
    const digests = async userId => (await realmConnector.execute(
      "SELECT kind, params, email_status FROM notifications WHERE user_id = $1 AND kind IN ('announcement_stats', 'profile_stats') ORDER BY kind", [userId],
    )).rows;

    await scheduler.weeklyDigests();
    assert.deepEqual(await digests(users[0]), [], 'no digest without a chosen channel');
    await call('/preferences/notifications', {
      method: 'PUT', body: { kinds: { announcement_stats: { email: true }, profile_stats: { email: true } } },
    });
    await scheduler.weeklyDigests();
    if (!realmConfig.entitlements.free.announcementStats) {
      assert.deepEqual(await digests(users[0]), [], 'digests follow plan statistics features');
      await realmConnector.execute("INSERT INTO user_entitlements (user_id, plan, source) VALUES ($1, 'premium', 'admin')", [users[0]]);
      await scheduler.weeklyDigests();
    }
    const created = await digests(users[0]);
    assert.equal(created.length, 2);
    assert.deepEqual({ ...created[0].params, week: undefined }, { views: 7, likes: 3, saves: 1, week: undefined });
    assert.equal(created[0].email_status, 'pending');
    assert.equal(created[1].params.views, 4);
    await scheduler.weeklyDigests();
    assert.equal((await digests(users[0])).length, 2, 'one digest per ISO week');
    await realmConnector.execute("UPDATE user_preferences SET analytics = FALSE WHERE user_id = $1", [users[0]]);

    const comeBack = async userId => (await realmConnector.execute(
      "SELECT event_key, params FROM notifications WHERE user_id = $1 AND kind = 'come_back' ORDER BY created_at", [userId],
    )).rows;
    await realmConnector.execute("UPDATE users SET last_login = NOW() - INTERVAL '40 days' WHERE id = $1", [users[1]]);
    await realmConnector.execute("UPDATE users SET last_login = NOW() - INTERVAL '130 days' WHERE id = $1", [users[3]]);
    await realmConnector.execute("UPDATE users SET last_login = NOW() - INTERVAL '45 days' WHERE id = $1", [users[2]]);
    const before = (await comeBack(users[1])).length;
    await scheduler.comeBack();
    await other.comeBack();
    const reminders = await comeBack(users[1]);
    assert.equal(reminders.length, before + 1, 'at most one reminder per inactivity period');
    assert.match(reminders.at(-1).event_key, new RegExp(`^come-back:${users[1]}:\\d+:1$`));
    assert.deepEqual(reminders.at(-1).params, { days: 30 });
    assert.equal((await comeBack(users[3])).length, 0, 'reminders stop after the configured maximum');
    assert.equal((await comeBack(users[2])).length, 0, 'accounts without a deliverable channel are skipped');
    await realmConnector.execute("UPDATE users SET last_login = last_login - INTERVAL '30 days' WHERE id = $1", [users[1]]);
    await scheduler.comeBack();
    await scheduler.comeBack();
    const later = await comeBack(users[1]);
    assert.equal(later.length, before + 2, 'the next period sends one more reminder');
    assert.match(later.at(-1).event_key, /:2$/);
    await realmConnector.execute("UPDATE users SET last_login = NOW() - INTERVAL '5 days' WHERE id = $1", [users[1]]);
    await scheduler.comeBack();
    assert.equal((await comeBack(users[1])).length, before + 2, 'recent sign-ins receive no reminder');
    await realmConnector.execute("UPDATE users SET last_login = NOW() WHERE id = ANY($1::uuid[])", [users]);

    await realmConnector.execute("UPDATE users SET created_at = NOW() - INTERVAL '8 days' WHERE id = $1", [users[0]]);
    await realmConnector.execute("UPDATE users SET created_at = NOW() - INTERVAL '60 days' WHERE id = $1", [users[1]]);
    await scheduler.inviteNudges();
    await scheduler.inviteNudges();
    const invites = (await realmConnector.execute(
      "SELECT user_id, link, in_app, event_key FROM notifications WHERE kind = 'invite_friends' AND user_id = ANY($1::uuid[])", [users],
    )).rows;
    assert.deepEqual(invites, [{ user_id: users[0], link: '#invite', in_app: true, event_key: `invite-friends:${users[0]}` }]);
    const listed = await call('/notifications');
    assert.ok(listed.notifications.some(item => item.kind === 'invite_friends' && item.params.days === 7));

    const stale = await notify(users[0], 'message');
    await realmConnector.execute("UPDATE notifications SET created_at = NOW() - INTERVAL '2 days' WHERE id = $1", [stale]);
    await scheduler.cleanup();
    assert.equal((await stored(stale)).email_status, 'expired', 'cleanup expires stale outbox rows');
  });
});
