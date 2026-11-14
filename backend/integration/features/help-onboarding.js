import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { mailDispatcher } from '../../src/engines/mail-dispatcher.js';
import { releaseRepository } from '../../src/repositories/release-repository.js';
import { ratingRepository } from '../../src/repositories/rating-repository.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

const until = async (check, message) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.fail(message);
};

test('help center, legal acceptance, onboarding, ratings, and release notices', async (t) => {
  const marker = `help-${randomUUID()}`;
  const users = [];
  const tokens = [];
  const sent = [];
  const termsVersion = realmConfig.legal.termsVersion;
  const config = {
    ...realmConfig,
    boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 },
    legal: { ...realmConfig.legal, operatorName: 'Synthetic Operator', operatorContactEmail: 'privacy@example.test', operatorJurisdiction: 'Netherlands', effectiveDate: '2026-11-01' },
    support: { email: 'support@example.test' },
    clientVersions: { minimum: '1.0.0', latest: '1.2.0', updateUrl: 'https://example.test/download' },
    application: { version: '1.3.0' },
  };
  await realmConnector.establish();
  const previousTransport = mailDispatcher.transporter;
  mailDispatcher.transporter = { sendMail: async message => { sent.push(message); } };
  const savedReleases = (await realmConnector.execute('SELECT * FROM app_releases')).rows;
  const app = await buildNexus({ config, logger: false, backgroundJobs: false });
  t.after(async () => {
    mailDispatcher.transporter = previousTransport;
    await app.close();
    await realmConnector.execute("DELETE FROM notifications WHERE event_key LIKE 'app-update:90%'");
    await realmConnector.execute('DELETE FROM app_releases');
    for (const row of savedReleases) {
      await realmConnector.execute(`INSERT INTO app_releases (version, major, minor, patch, notified_kind, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`, [row.version, row.major, row.minor, row.patch, row.notified_kind, row.recorded_at]);
    }
    await realmConnector.execute('DELETE FROM support_requests WHERE subject LIKE $1', [`${marker}%`]);
    await realmConnector.execute('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[]) OR email LIKE $2', [users, `${marker}%`]);
    await realmConnector.disconnect();
  });
  for (let i = 0; i < 4; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email, i === 3 ? 'admin' : 'member'],
    );
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} ${i}`]);
  }
  const ADMIN = 3;
  async function call(path, { actor = 0, method = 'GET', body, status = 200, headers } = {}) {
    const authorization = actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` };
    const response = await app.inject({ method, url: `/realm${path}`, headers: { ...authorization, ...headers }, payload: body });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.json();
  }

  await t.test('legal details and client versions come from configuration without authentication', async () => {
    const legal = (await call('/legal', { actor: null })).data;
    assert.deepEqual(legal.operator, { name: 'Synthetic Operator', contactEmail: 'privacy@example.test', jurisdiction: 'Netherlands' });
    assert.equal(legal.termsVersion, termsVersion);
    assert.equal(legal.configured, true);
    assert.equal(legal.template, true);
    assert.deepEqual((await call('/app/version', { actor: null })).data, {
      serverVersion: '1.3.0', minimumClientVersion: '1.0.0', latestClientVersion: '1.2.0', updateUrl: 'https://example.test/download',
    });
  });

  await t.test('registration records the accepted terms version and queues the welcome tour', async () => {
    const body = { email: `${marker}-register@example.test`, password: 'Synthetic1Password' };
    const missing = await call('/auth/register', { actor: null, method: 'POST', body, status: 400 });
    assert.equal(missing.error.code, 'TERMS_NOT_ACCEPTED');
    const stale = await call('/auth/register', { actor: null, method: 'POST', body: { ...body, acceptedTermsVersion: `${termsVersion}-old` }, status: 409 });
    assert.equal(stale.error.code, 'TERMS_VERSION_CHANGED');
    const created = (await call('/auth/register', { actor: null, method: 'POST', body: { ...body, acceptedTermsVersion: termsVersion }, status: 201 })).data;
    const { rows } = await realmConnector.execute(`
      SELECT t.terms_version, t.source, o.tour_status FROM terms_acceptances t
      JOIN user_onboarding o ON o.user_id = t.user_id WHERE t.user_id = $1`, [created.userId]);
    assert.deepEqual(rows, [{ terms_version: termsVersion, source: 'registration', tour_status: 'pending' }]);
  });

  await t.test('accounts are asked once per terms version and the first acceptance queues the tour', async () => {
    assert.deepEqual((await call('/legal/acceptance')).data, { termsVersion, acceptedVersion: null, acceptedAt: null, required: true });
    await realmConnector.execute("INSERT INTO terms_acceptances (user_id, terms_version, source) VALUES ($1, 'synthetic-0', 'prompt')", [users[1]]);
    const outdated = (await call('/legal/acceptance', { actor: 1 })).data;
    assert.equal(outdated.acceptedVersion, 'synthetic-0');
    assert.equal(outdated.required, true);
    const changed = await call('/legal/acceptance', { method: 'POST', body: { termsVersion: 'synthetic-0' }, status: 409 });
    assert.equal(changed.error.code, 'TERMS_VERSION_CHANGED');
    const accepted = (await call('/legal/acceptance', { method: 'POST', body: { termsVersion } })).data;
    assert.equal(accepted.required, false);
    assert.equal(accepted.acceptedVersion, termsVersion);
    assert.equal((await call('/legal/acceptance', { method: 'POST', body: { termsVersion } })).data.required, false);
    assert.equal((await call('/onboarding')).data.tour.status, 'pending');
    assert.equal((await call('/legal/acceptance', { actor: 1, method: 'POST', body: { termsVersion } })).data.required, false);
    assert.equal((await call('/onboarding', { actor: 1 })).data.tour.status, null, 'returning accounts are not re-onboarded');
    await call('/legal/acceptance', { actor: null, status: 401 });
  });

  await t.test('tour completion is stored per account', async () => {
    assert.equal((await call('/onboarding/tour', { method: 'PUT', body: { status: 'completed' } })).data.tour.status, 'completed');
    assert.equal((await call('/onboarding')).data.tour.status, 'completed');
    assert.equal((await call('/onboarding/tour', { actor: 2, method: 'PUT', body: { status: 'skipped' } })).data.tour.status, 'skipped');
    await call('/onboarding/tour', { method: 'PUT', body: { status: 'started' }, status: 400 });
  });

  let memberRequest;
  let anonymousRequest;
  await t.test('support accepts signed-out and signed-in requests with anti-spam and rate limits', async () => {
    sent.length = 0;
    const anonymous = { kind: 'contact', subject: `${marker} hello`, message: 'A synthetic question from a visitor.' };
    assert.equal((await call('/support', { actor: null, method: 'POST', body: anonymous, status: 400 })).error.code, 'CONTACT_EMAIL_REQUIRED');
    const received = (await call('/support', { actor: null, method: 'POST', body: { ...anonymous, email: 'visitor@example.test', name: 'Visitor' }, status: 201 })).data;
    assert.deepEqual(received, { received: true, id: null });
    anonymousRequest = (await realmConnector.execute('SELECT id, forwarded_at FROM support_requests WHERE subject = $1', [anonymous.subject])).rows[0];
    assert.ok(anonymousRequest);
    const bot = (await call('/support', { actor: null, method: 'POST', body: { ...anonymous, subject: `${marker} bot`, email: 'bot@example.test', website: 'https://spam.example.test' }, status: 201 })).data;
    assert.deepEqual(bot, { received: true, id: null });
    assert.equal((await realmConnector.execute('SELECT 1 FROM support_requests WHERE subject = $1', [`${marker} bot`])).rowCount, 0);
    const bug = (await call('/support', { method: 'POST', status: 201, body: {
      kind: 'bug', subject: `${marker} crash`, message: 'Synthetic crash when opening the feed.', steps: '1. Open the feed\n2. Reload',
      diagnosticsConsent: true, diagnostics: { appVersion: '1.2.0', platform: 'web', userAgent: 'Synthetic browser' },
    } })).data;
    assert.ok(bug.id);
    memberRequest = bug.id;
    const stored = (await realmConnector.execute('SELECT user_id, diagnostics, steps FROM support_requests WHERE id = $1', [bug.id])).rows[0];
    assert.equal(stored.user_id, users[0]);
    assert.deepEqual(stored.diagnostics, { appVersion: '1.2.0', platform: 'web', userAgent: 'Synthetic browser' });
    await until(async () => sent.length === 2, 'both stored requests are forwarded to SUPPORT_EMAIL');
    assert.equal(sent[0].to, 'support@example.test');
    assert.equal(sent[0].replyTo, 'visitor@example.test');
    assert.match(sent.find(message => message.subject.includes('crash')).text, /Technical details shared with consent/);
    await until(async () => (await realmConnector.execute('SELECT forwarded_at FROM support_requests WHERE id = $1', [bug.id])).rows[0].forwarded_at,
      'forwarded requests are marked');
    await realmConnector.execute(`INSERT INTO support_requests (kind, user_id, subject, message)
      SELECT 'contact', $1, $2 || ' bulk ' || n, 'Synthetic bulk request to reach the daily cap.' FROM generate_series(1, 10) n`, [users[1], marker]);
    const capped = await call('/support', { actor: 1, method: 'POST', body: { ...anonymous, subject: `${marker} capped` }, status: 429 });
    assert.equal(capped.error.code, 'SUPPORT_LIMIT');
    await call('/support', { actor: null, method: 'POST', body: anonymous, headers: { authorization: 'Bearer stale' }, status: 401 });
    assert.equal((await call('/support', { actor: null, method: 'POST', body: anonymous, status: 429 })).error.code, 'RATE_LIMIT_EXCEEDED');
  });

  await t.test('admins triage the inbox with audited decisions and requesters are notified of replies', async () => {
    await call('/admin/support', { status: 403 });
    const inbox = (await call('/admin/support?status=open&kind=bug&pageSize=100', { actor: ADMIN })).data;
    const row = inbox.requests.find(item => item.id === memberRequest);
    assert.equal(row.requesterName, `${marker} 0`);
    assert.equal(row.hasAccount, true);
    assert.ok(inbox.requests.every(item => item.kind === 'bug' && item.status === 'open'));
    assert.ok(inbox.counts.open >= 1);
    const detail = (await call(`/admin/support/${memberRequest}`, { actor: ADMIN })).data;
    assert.equal(detail.steps, '1. Open the feed\n2. Reload');
    assert.equal(detail.contactEmail, null);
    assert.ok(detail.forwardedAt);
    assert.equal((await call(`/admin/support/${memberRequest}`, { actor: ADMIN, method: 'PATCH', body: { status: 'answered' }, status: 400 })).error.code, 'REPLY_REQUIRED');
    await call(`/admin/support/${memberRequest}`, { actor: ADMIN, method: 'PATCH', body: { status: 'in_progress' } });
    const answered = (await call(`/admin/support/${memberRequest}`, { actor: ADMIN, method: 'PATCH', body: { status: 'answered', replyNote: 'Fixed in the next synthetic release.' } })).data;
    assert.equal(answered.status, 'answered');
    await call(`/admin/support/${anonymousRequest.id}`, { actor: ADMIN, method: 'PATCH', body: { status: 'closed', replyNote: 'Answered by email.' } });
    const own = (await call('/support/me')).data.requests;
    assert.deepEqual(own.map(item => [item.id, item.status, item.replyNote]), [[memberRequest, 'answered', 'Fixed in the next synthetic release.']]);
    const notifications = (await call('/notifications')).data.notifications.filter(item => item.kind === 'support_reply');
    assert.equal(notifications.length, 1);
    assert.deepEqual(notifications[0].params, { subject: `${marker} crash` });
    assert.equal(notifications[0].link, '#help?view=requests');
    const { rows } = await realmConnector.execute('SELECT action FROM admin_audit WHERE actor_id = $1 ORDER BY created_at, action', [users[ADMIN]]);
    assert.deepEqual(rows.map(item => item.action), [
      'support_request_viewed', 'support_status_changed', 'support_replied', 'support_status_changed', 'support_replied', 'support_status_changed',
    ]);
    await call(`/admin/support/${randomUUID()}`, { actor: ADMIN, status: 404 });
  });

  await t.test('ratings are limited to one per released version and expose a reward hook', async () => {
    assert.equal((await call('/ratings', { method: 'POST', body: { appVersion: '1.4.0', stars: 5 }, status: 400 })).error.code, 'INVALID_APP_VERSION');
    const rating = (await call('/ratings', { method: 'POST', body: { appVersion: '1.2.0', stars: 4, comment: 'Synthetic praise', platform: 'web' }, status: 201 })).data;
    assert.equal(rating.stars, 4);
    assert.equal((await call('/ratings', { method: 'POST', body: { appVersion: '1.2.0', stars: 1 }, status: 409 })).error.code, 'RATING_EXISTS');
    await call('/ratings', { actor: 1, method: 'POST', body: { appVersion: '1.3.0', stars: 2 }, status: 201 });
    await call('/ratings', { method: 'POST', body: { appVersion: '1.2.0', stars: 6 }, status: 400 });
    assert.deepEqual((await call('/ratings/me')).data.ratings.map(item => item.appVersion), ['1.2.0']);
    await call('/admin/ratings', { status: 403 });
    const summary = (await call('/admin/ratings', { actor: ADMIN })).data;
    assert.ok(summary.total.count >= 2);
    assert.ok(summary.distribution[4] >= 1 && summary.distribution[2] >= 1);
    assert.ok(summary.recent.some(item => item.comment === 'Synthetic praise'));
    assert.ok(summary.versions.some(item => item.version === '1.3.0'));
    await realmConnector.transaction(async executor => {
      const pending = (await ratingRepository.unrewarded(executor, 1000)).filter(item => users.includes(item.userId));
      assert.equal(pending.length, 2);
      assert.equal(await ratingRepository.markRewarded(executor, pending[0].id, `synthetic:${marker}`), true);
      assert.equal(await ratingRepository.markRewarded(executor, pending[0].id, `synthetic:${marker}`), false);
    });
  });

  await t.test('major and minor API releases notify active accounts exactly once', async () => {
    await realmConnector.execute('DELETE FROM app_releases');
    const updates = async kind => (await realmConnector.execute(
      "SELECT params FROM notifications WHERE user_id = $1 AND kind = $2 AND event_key LIKE 'app-update:90%'", [users[2], kind])).rows;
    assert.deepEqual(await releaseRepository.recordStartup('900.0.0'), { version: '900.0.0', recorded: true, kind: null, notified: 0 });
    assert.equal((await releaseRepository.recordStartup('900.0.3')).kind, null);
    assert.equal((await releaseRepository.recordStartup('900.0.3')).recorded, false);
    const minor = await releaseRepository.recordStartup('900.1.0');
    assert.equal(minor.kind, 'app_update_minor');
    assert.ok(minor.notified >= users.length);
    assert.deepEqual(await updates('app_update_minor'), [{ params: { version: '900.1.0' } }]);
    const concurrent = await Promise.all([releaseRepository.recordStartup('901.0.0'), releaseRepository.recordStartup('901.0.0')]);
    assert.deepEqual(concurrent.map(result => result.kind).sort(), ['app_update_major', null]);
    assert.equal((await updates('app_update_major')).length, 1);
    assert.equal((await releaseRepository.recordStartup('900.5.0')).kind, null, 'a rollback does not announce');
    assert.equal((await releaseRepository.recordStartup('not-a-version')).invalid, true);
    const notices = (await call('/notifications', { actor: 2 })).data.notifications.filter(item => item.kind.startsWith('app_update_'));
    assert.deepEqual(notices.map(item => item.kind).sort(), ['app_update_major', 'app_update_minor']);
  });
});
