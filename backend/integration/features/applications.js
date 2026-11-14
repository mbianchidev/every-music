import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { ApplicationMaintenance } from '../../src/engines/application-maintenance.js';
import { APPLICATION_DAILY_LIMIT } from '../../src/engines/application-rules.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

test('announcement applications: apply, owner dashboard, notifications, and retention', async (t) => {
  const marker = `applications-${randomUUID()}`;
  const retentionDays = 30;
  const users = [];
  const tokens = [];
  await realmConnector.establish();
  const app = await buildNexus({
    config: { ...realmConfig, applications: { retentionDays }, boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 } },
    logger: false, backgroundJobs: false,
  });
  const events = [];
  const stopListening = await realmConnector.listen('everymusic_events', event => events.push(event), () => {});
  t.after(async () => {
    await stopListening();
    await app.close();
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });
  for (let i = 0; i < 5; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email],
    );
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `${marker} ${i}`, 'Synthetic City']);
  }
  const [owner, applicant, second, blocked, blocker] = [0, 1, 2, 3, 4];
  async function call(path, { actor = owner, method = 'GET', body, status = 200 } = {}) {
    const response = await app.inject({ method, url: `/realm${path}`, headers: { authorization: `Bearer ${tokens[actor]}` }, payload: body });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.json().data ?? response.json().error;
  }
  const { rows: instruments } = await realmConnector.execute('SELECT id, name FROM instruments ORDER BY name LIMIT 3');
  const [drums, bass, unrelated] = instruments.map(item => item.id);
  const announcement = await call('/announcements/', { method: 'POST', status: 201, body: {
    title: `${marker} open call`, description: 'A synthetic collaboration opportunity for integration testing.', instrumentIds: [drums, bass],
  } });
  const profile = (await realmConnector.execute('SELECT id FROM profiles WHERE user_id = $1', [users[applicant]])).rows[0];
  await realmConnector.execute("INSERT INTO user_instruments (profile_id, instrument_id, skill_level, years_experience) VALUES ($1, $2, 'advanced', 6)", [profile.id, drums]);
  await realmConnector.execute('INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2), ($3, $1)', [users[owner], users[blocked], users[blocker]]);
  const applyPath = `/announcements/${announcement.id}/applications`;
  let applicationId;

  await t.test('signed-in musicians apply once with instruments from the call and links', async () => {
    await call(applyPath, { actor: applicant, method: 'POST', status: 400, body: { message: '   ' } });
    await call(applyPath, { actor: applicant, method: 'POST', status: 400, body: { message: 'Hello', instrumentIds: [unrelated] } });
    await call(applyPath, { actor: applicant, method: 'POST', status: 400, body: { message: 'Hello', links: [{ url: 'javascript:alert(1)' }] } });
    await call(applyPath, { actor: applicant, method: 'POST', status: 400, body: { message: 'Hello', extra: true } });
    const unauthenticated = await app.inject({ method: 'POST', url: `/realm${applyPath}`, payload: { message: 'Hello' } });
    assert.equal(unauthenticated.statusCode, 401);
    assert.equal((await call(applyPath, { method: 'POST', status: 403, body: { message: 'Self' } })).code, 'OWN_ANNOUNCEMENT');
    assert.equal((await call(applyPath, { actor: blocked, method: 'POST', status: 403, body: { message: 'Hi' } })).code, 'APPLICATION_UNAVAILABLE');
    assert.equal((await call(applyPath, { actor: blocker, method: 'POST', status: 403, body: { message: 'Hi' } })).code, 'APPLICATION_UNAVAILABLE');
    const created = await call(applyPath, { actor: applicant, method: 'POST', status: 201, body: {
      message: '  I play drums and bass for synthetic projects.  ', instrumentIds: [drums.toUpperCase()],
      links: [{ linkType: 'website', url: 'https://example.test/demo' }],
    } });
    applicationId = created.id;
    assert.equal(created.status, 'new');
    assert.equal(created.message, 'I play drums and bass for synthetic projects.');
    assert.deepEqual(created.instruments.map(item => item.instrumentId), [drums]);
    assert.deepEqual(created.links, [{ linkType: 'website', url: 'https://example.test/demo' }]);
    assert.equal(created.announcement.isOpen, true);
    assert.equal(created.ownerNote, undefined);
    assert.equal((await call(applyPath, { actor: applicant, method: 'POST', status: 409, body: { message: 'Again' } })).code, 'ALREADY_APPLIED');
    assert.equal((await call(`${applyPath}/me`, { actor: applicant })).application.id, applicationId);
    assert.equal((await call(`${applyPath}/me`, { actor: second })).application, null);
    await call(applyPath, { actor: second, method: 'POST', status: 201, body: { message: 'Bass player, available weekends.', instrumentIds: [bass] } });
  });

  await t.test('owners are notified with localizable params and live invalidations', async () => {
    const list = await call('/notifications');
    const received = list.notifications.filter(item => item.kind === 'application_received');
    assert.equal(received.length, 2);
    const first = received.find(item => item.params.applicationId === applicationId);
    assert.deepEqual(first.params, {
      applicationId, announcementId: announcement.id, title: announcement.title, applicantName: `${marker} ${applicant}`,
    });
    assert.equal(first.link, `#applications?announcement=${announcement.id}`);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.ok(events.some(event => event.type === 'applications.changed' && event.userId === users[owner] && event.id === announcement.id));
    assert.ok(events.some(event => event.type === 'applications.changed' && event.userId === users[applicant]));
  });

  await t.test('the dashboard shows profile summaries, counts, filters, and pages only to the owner', async () => {
    const all = await call('/applications/received?pageSize=1');
    assert.equal(all.applications.length, 1);
    assert.equal(all.pagination.hasMore, true);
    assert.deepEqual(all.counts, { total: 2, new: 2, shortlisted: 0, accepted: 0, declined: 0 });
    const scoped = await call(`/applications/received?announcementId=${announcement.id}&instrumentId=${drums}`);
    assert.equal(scoped.announcement.title, announcement.title);
    assert.equal(scoped.announcement.isOpen, true);
    assert.equal(scoped.applications.length, 1);
    assert.deepEqual(scoped.counts, { total: 1, new: 1, shortlisted: 0, accepted: 0, declined: 0 });
    const row = scoped.applications[0];
    assert.equal(row.id, applicationId);
    assert.equal(row.applicant.userId, users[applicant]);
    assert.equal(row.applicant.profileId, profile.id);
    assert.equal(row.applicant.artistName, `${marker} ${applicant}`);
    assert.equal(row.applicant.city, 'Synthetic City');
    assert.deepEqual(row.applicant.instruments.map(item => [item.instrumentId, item.skillLevel, item.yearsExperience]), [[drums, 'advanced', 6]]);
    assert.equal(row.canMessage, true);
    const summary = await call('/applications/announcements');
    assert.deepEqual(summary.announcements.find(item => item.id === announcement.id).counts, { total: 2, new: 2, shortlisted: 0, accepted: 0, declined: 0 });
    assert.equal((await call('/applications/received', { actor: applicant })).applications.length, 0);
    await call(`/applications/received?announcementId=${announcement.id}`, { actor: applicant, status: 404 });
    await call(`/applications/${applicationId}`, { actor: applicant, method: 'PATCH', status: 404, body: { status: 'accepted' } });
    await call('/applications/received?status=withdrawn', { status: 400 });
    await call(`/applications/${applicationId}`, { method: 'PATCH', status: 400, body: {} });
  });

  await t.test('status changes notify applicants once per status; notes stay private', async () => {
    const shortlisted = await call(`/applications/${applicationId}`, { method: 'PATCH', body: { status: 'shortlisted', ownerNote: '  Strong groove.  ' } });
    assert.equal(shortlisted.status, 'shortlisted');
    assert.equal(shortlisted.ownerNote, 'Strong groove.');
    assert.ok(shortlisted.statusChangedAt);
    await call(`/applications/${applicationId}`, { method: 'PATCH', body: { status: 'new' } });
    await call(`/applications/${applicationId}`, { method: 'PATCH', body: { status: 'shortlisted' } });
    const notes = await call(`/applications/${applicationId}`, { method: 'PATCH', body: { ownerNote: '' } });
    assert.equal(notes.ownerNote, null);
    assert.equal(notes.status, 'shortlisted');
    const alerts = (await call('/notifications', { actor: applicant })).notifications.filter(item => item.kind === 'application_status');
    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0].params, { applicationId, announcementId: announcement.id, title: announcement.title, status: 'shortlisted' });
    assert.equal(alerts[0].link, '#applications?view=sent');
    const mine = await call('/applications/me', { actor: applicant });
    assert.equal(mine.applications[0].status, 'shortlisted');
    assert.equal(mine.applications[0].ownerNote, undefined);
    assert.equal(JSON.stringify(mine).includes('Strong groove'), false);
    assert.deepEqual((await call('/applications/received?status=shortlisted')).counts, { total: 2, new: 1, shortlisted: 1, accepted: 0, declined: 0 });
  });

  await t.test('owners message applicants through the existing conversation', async () => {
    const conversation = await call('/conversations', { method: 'POST', status: 201, body: { recipientUserId: users[applicant] } });
    assert.equal((await call('/conversations', { method: 'POST', status: 201, body: { recipientUserId: users[applicant] } })).id, conversation.id);
    await realmConnector.execute('INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2)', [users[applicant], users[owner]]);
    assert.equal((await call(`/applications/received?announcementId=${announcement.id}&instrumentId=${drums}`)).applications[0].canMessage, false);
    await realmConnector.execute('DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2', [users[applicant], users[owner]]);
  });

  await t.test('withdrawing hides the application from the owner and allows a later reply', async () => {
    const other = (await call('/applications/me', { actor: second })).applications[0];
    await call(`/applications/${other.id}`, { actor: applicant, method: 'DELETE', status: 404 });
    assert.equal((await call(`/applications/${other.id}`, { actor: second, method: 'DELETE' })).status, 'withdrawn');
    await call(`/applications/${other.id}`, { actor: second, method: 'DELETE', status: 404 });
    const withdrawn = (await call('/applications/me', { actor: second })).applications[0];
    assert.equal(withdrawn.status, 'withdrawn');
    assert.equal(withdrawn.message, '');
    assert.deepEqual(withdrawn.instruments, []);
    assert.equal((await call('/applications/received')).counts.total, 1);
    await call(`/applications/${other.id}`, { method: 'PATCH', status: 404, body: { status: 'accepted' } });
    await call(applyPath, { actor: second, method: 'POST', status: 201, body: { message: 'Back again with a new demo.' } });
    assert.equal((await call('/applications/received')).counts.total, 2);
  });

  await t.test('closed calls stay readable for the owner, read-only, and closed for applicants', async () => {
    await call(`/announcements/${announcement.id}`, { method: 'PUT', body: { isPublished: false } });
    await call(applyPath, { actor: blocker, method: 'POST', status: 404, body: { message: 'Too late.' } });
    const mine = await call('/applications/me', { actor: applicant });
    assert.equal(mine.applications[0].status, 'closed');
    assert.equal(mine.applications[0].announcement.isOpen, false);
    const owned = await call(`/applications/received?announcementId=${announcement.id}`);
    assert.equal(owned.announcement.isOpen, false);
    assert.ok(owned.announcement.retentionEndsAt);
    assert.equal(owned.applications.length, 2);
    assert.equal((await call(`/applications/${applicationId}`, { method: 'PATCH', status: 409, body: { status: 'accepted' } })).code, 'ANNOUNCEMENT_CLOSED');
    assert.equal((await call(`/applications/${applicationId}`, { method: 'PATCH', body: { ownerNote: 'Closed call note' } })).ownerNote, 'Closed call note');

    const maintenance = new ApplicationMaintenance({ retentionDays, logger: { error() {} } });
    assert.ok((await maintenance.sweep()).closed >= 2);
    const { rows: closedRows } = await realmConnector.execute('SELECT closed_at FROM announcement_applications WHERE announcement_id = $1', [announcement.id]);
    assert.ok(closedRows.every(item => item.closed_at));
    await call(`/announcements/${announcement.id}`, { method: 'PUT', body: { isPublished: true } });
    assert.ok((await maintenance.sweep()).reopened >= 2);
    assert.equal((await call('/applications/me', { actor: applicant })).applications[0].status, 'shortlisted');

    await call(`/announcements/${announcement.id}`, { method: 'DELETE' });
    await maintenance.sweep();
    const deleted = await call('/applications/announcements');
    assert.equal(deleted.announcements.find(item => item.id === announcement.id).isOpen, false);
    assert.equal((await call(`/applications/received?announcementId=${announcement.id}`)).applications.length, 2);
    assert.equal((await call('/applications/me', { actor: applicant })).applications[0].status, 'closed');

    await realmConnector.execute(`UPDATE announcement_applications SET closed_at = NOW() - make_interval(days => $2::int)
      WHERE announcement_id = $1`, [announcement.id, retentionDays + 1]);
    assert.equal((await call(`/applications/received?announcementId=${announcement.id}`, { status: 404 })).code, 'ANNOUNCEMENT_NOT_FOUND');
    assert.ok((await maintenance.sweep()).removed >= 3);
    const { rows: remaining } = await realmConnector.execute('SELECT id FROM announcement_applications WHERE announcement_id = $1', [announcement.id]);
    assert.deepEqual(remaining, []);
    assert.equal((await call('/applications/me', { actor: applicant })).applications.length, 0);
  });

  await t.test('expired calls cannot receive applications and each account has a daily limit', async () => {
    const expired = await call('/announcements/', { method: 'POST', status: 201, body: {
      title: `${marker} expired call`, description: 'A synthetic call that has already expired for testing.', expiresAt: '2001-01-01T00:00:00Z',
    } });
    await call(`/announcements/${expired.id}/applications`, { actor: second, method: 'POST', status: 404, body: { message: 'Hello' } });
    const open = await call('/announcements/', { method: 'POST', status: 201, body: {
      title: `${marker} limit call`, description: 'A synthetic call used to check the daily application limit.',
    } });
    await realmConnector.execute(`
      INSERT INTO announcement_applications (announcement_id, applicant_id, message, status, withdrawn_at)
      SELECT $1, $2, '', 'withdrawn', NOW() FROM generate_series(1, $3::int)`, [open.id, users[second], APPLICATION_DAILY_LIMIT]);
    assert.equal((await call(`/announcements/${open.id}/applications`, { actor: second, method: 'POST', status: 429, body: { message: 'Hello' } })).code, 'APPLICATION_LIMIT');
  });
});
