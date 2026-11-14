import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { accountRepository } from '../../src/repositories/account-repository.js';
import { EventReminderJob } from '../../src/engines/event-reminder-job.js';
import { utcToZoned } from '../../src/engines/event-model.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

const DAY = 24 * 60 * 60 * 1000;
const rome = offsetMs => utcToZoned(new Date(Date.now() + offsetMs), 'Europe/Rome');

test('events: lineups, discovery, attendance, reminders, discussion, communications, and page verification', async (t) => {
  const marker = `events-${randomUUID()}`;
  const users = [];
  const tokens = [];
  const organizations = [];
  await realmConnector.establish();
  const app = await buildNexus({
    config: { ...realmConfig, boundaries: { ...realmConfig.boundaries, rateThreshold: 10000, portalOrigins: ['https://app.example.test'] } },
    logger: false, backgroundJobs: false,
  });
  t.after(async () => {
    await app.close();
    await realmConnector.execute('DELETE FROM events WHERE created_by = ANY($1::uuid[]) OR owner_user_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM organizations WHERE id = ANY($1::uuid[]) OR created_by = ANY($2::uuid[])', [organizations, users]);
    await realmConnector.execute('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });
  // 0 solo artist, 1 organizer leader, 2 band leader, 3 fan, 4 admin, 5 outsider, 6 organizer member without calendar rights
  for (let i = 0; i < 7; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email, i === 4 ? 'admin' : 'member'],
    );
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} person ${i}`]);
  }
  async function call(path, { actor = 0, method = 'GET', body, status = 200 } = {}) {
    const headers = actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` };
    const response = await app.inject({ method, url: `/realm${path}`, headers, payload: body });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.headers['content-type']?.includes('json') ? response.json().data ?? response.json() : response;
  }
  const kinds = async (actor, kind) => (await call('/notifications?pageSize=100', { actor })).notifications.filter(item => item.kind === kind);
  const png = (await sharp({ create: { width: 40, height: 30, channels: 3, background: '#7a5c3e' } }).png().toBuffer()).toString('base64');
  const upload = (actor, purpose = 'event') => call('/media', { actor, method: 'POST', status: 201, body: { data: png, mimeType: 'image/png', purpose } });
  const place = (await realmConnector.execute("SELECT id, latitude, longitude FROM places WHERE name = 'Milan' ORDER BY population DESC LIMIT 1")).rows[0];
  const genre = (await realmConnector.execute("SELECT id FROM genres WHERE name = 'Rock'")).rows[0];
  const search = query => call(`/gigs?${new URLSearchParams({ q: marker, pageSize: '50', ...query })}`, { actor: 5 });
  let organizer;
  let band;
  let venue;
  let solo;
  let festival;
  let image;

  await t.test('pages and members set up the organizer, band, and venue', async () => {
    organizer = await call('/organizations', { actor: 1, method: 'POST', status: 201, body: { kind: 'organizer', name: `${marker} Promotions` } });
    band = await call('/organizations', { actor: 2, method: 'POST', status: 201, body: { kind: 'band', name: `${marker} Amplifiers` } });
    venue = await call('/organizations', { actor: 1, method: 'POST', status: 201, body: {
      kind: 'venue', name: `${marker} Hall`, city: 'Milan', latitude: 45.47, longitude: 9.2, capacity: 900,
    } });
    organizations.push(organizer.id, band.id, venue.id);
    await call(`/organizations/${organizer.id}/members`, { actor: 1, method: 'POST', status: 201, body: { userId: users[6], permissions: ['post_announcements'] } });
    await call(`/organizations/${organizer.id}/invitation`, { actor: 6, method: 'PATCH', body: { response: 'accept' } });
    await call(`/organizations/${band.id}/follow`, { actor: 3, method: 'POST' });
    await realmConnector.execute('INSERT INTO followers (follower_id, following_id) VALUES ($1, $2)', [users[5], users[0]]);
  });

  await t.test('artists create their own events and invalid input is rejected', async () => {
    const base = { title: `${marker} solo night`, timezone: 'Europe/Rome', startsAt: rome(3 * DAY), lineup: [{ role: 'headliner', artistId: users[0] }] };
    await call('/gigs', { method: 'POST', status: 400, body: { ...base, timezone: 'Mars/Olympus' } });
    await call('/gigs', { method: 'POST', status: 400, body: { ...base, capacity: 10, ticketsSold: 11 } });
    await call('/gigs', { method: 'POST', status: 400, body: { ...base, ticketLinks: [{ label: 'Shop', url: 'http://tickets.example.test' }] } });
    await call('/gigs', { method: 'POST', status: 400, body: { ...base, lineup: [{ role: 'headliner', name: 'Both', bandId: band.id }] } });
    await call('/gigs', { method: 'POST', status: 400, body: { ...base, images: [(await upload(1)).url] } });
    await call('/gigs', { method: 'POST', status: 400, body: { ...base, images: [(await upload(0, 'listing')).url] } });
    await call('/gigs', { method: 'POST', status: 403, body: { ...base, organizerIds: [organizer.id] } });
    await call('/gigs', { method: 'POST', status: 400, body: { ...base, unknown: true } });
    image = await upload(0);
    solo = await call('/gigs', { method: 'POST', status: 201, body: {
      ...base, description: 'Doors, bar; merch', placeId: place.id, address: 'Via Synthetic 1', capacity: 120, ticketsSold: 30,
      images: [image.url], genreIds: [genre.id], ticketLinks: [{ label: 'Synthetic Tickets', url: 'https://tickets.example.test/solo' }],
    } });
    assert.equal(solo.owner.userId, users[0]);
    assert.equal(solo.visibility, 'draft');
    assert.equal(solo.ticketsSoldPercent, 25);
    assert.equal(solo.local.startsAt, base.startsAt);
    assert.equal(solo.viewer.canEdit, true);
    assert.equal(solo.place.id, place.id);
    assert.ok(solo.map.map.startsWith('https://www.openstreetmap.org/'));
    await call(`/gigs/${solo.id}`, { actor: 5, status: 404 });
    await call(image.url.replace('/realm', ''), { actor: 5, status: 404 });
    const published = await call(`/gigs/${solo.id}`, { method: 'PATCH', body: { visibility: 'published' } });
    assert.ok(published.publishedAt);
    await call(image.url.replace('/realm', ''), { actor: null });
    assert.equal((await kinds(5, 'event_published')).length, 1, 'followers of the artist hear about the event');
    await call(`/gigs/${solo.id}`, { actor: 5, method: 'PATCH', status: 403, body: { title: 'Hijacked title' } });
  });

  await t.test('organizers publish events for their pages with venues, lineups, and tickets', async () => {
    const body = {
      title: `${marker} festival`, type: 'festival', timezone: 'Europe/Rome', startsAt: rome(10 * DAY), endsAt: rome(11 * DAY),
      doorsOpenAt: rome(10 * DAY - 60 * 60 * 1000), venueId: venue.id, organizerIds: [organizer.id], capacity: 900, ticketsSold: 450,
      genreIds: [genre.id], ticketLinks: [{ label: 'Official shop', url: 'https://tickets.example.test/festival' }],
      lineup: [
        { role: 'headliner', bandId: band.id, setStartsAt: rome(10 * DAY + 2 * 60 * 60 * 1000), setEndsAt: rome(10 * DAY + 3 * 60 * 60 * 1000) },
        { role: 'opener', artistId: users[0] },
        { role: 'support', name: 'The Synthetic Strangers' },
      ],
      visibility: 'published',
    };
    await call('/gigs', { actor: 6, method: 'POST', status: 403, body });
    festival = await call('/gigs', { actor: 1, method: 'POST', status: 201, body });
    assert.equal(festival.owner, null);
    assert.deepEqual(festival.organizers.map(item => item.id), [organizer.id]);
    assert.equal(festival.venue.id, venue.id);
    assert.deepEqual(festival.coordinates, { latitude: 45.47, longitude: 9.2 });
    assert.deepEqual(festival.lineup.map(entry => [entry.role, entry.name]), [
      ['headliner', `${marker} Amplifiers`], ['opener', `${marker} person 0`], ['support', 'The Synthetic Strangers'],
    ]);
    assert.equal(festival.lineup[0].band.id, band.id);
    assert.equal(festival.lineup[0].local.setStartsAt, body.lineup[0].setStartsAt);
    assert.equal(festival.ticketsSoldPercent, 50);
    assert.equal(festival.status, 'scheduled');
    assert.equal((await kinds(3, 'event_published')).length, 1, 'band followers are told');
    assert.equal((await kinds(2, 'event_lineup')).length, 1, 'band managers are told they are on the lineup');
    assert.equal((await kinds(0, 'event_lineup')).length, 1, 'artists are told they are on the lineup');
    const google = new URL(festival.calendar.googleUrl);
    assert.equal(google.searchParams.get('ctz'), 'Europe/Rome');
    assert.match(google.searchParams.get('details'), new RegExp(`https://app\\.example\\.test/#event\\?id=${festival.id}`));
    await call(`/gigs/${festival.id}`, { actor: 0, method: 'PATCH', status: 403, body: { title: 'Not mine' } });
    await call(`/gigs/${festival.id}`, { actor: 1, method: 'PATCH', status: 400, body: { organizerIds: [] } });
    await call(`/gigs/${festival.id}`, { actor: 1, method: 'PATCH', status: 400, body: { ticketsSold: 901 } });
    const updated = await call(`/gigs/${festival.id}`, { actor: 1, method: 'PATCH', body: { ticketsSold: 900 } });
    assert.equal(updated.soldOut, true);
    assert.equal(updated.ticketsSoldPercent, 100);
  });

  await t.test('calendar exports carry the event time zone and escaped text', async () => {
    const response = await call(`/gigs/${solo.id}/calendar.ics`, { actor: null });
    assert.match(response.headers['content-type'], /^text\/calendar/);
    assert.match(response.headers['content-disposition'], /attachment; filename=".+\.ics"/);
    assert.match(response.body, /DTSTART;TZID=Europe\/Rome:\d{8}T\d{6}/);
    assert.match(response.body, /DESCRIPTION:Doors\\, bar\\; merch/);
    assert.match(response.body, new RegExp(`UID:${solo.id}@every.music`));
  });

  await t.test('discovery searches, filters, and sorts published events', async () => {
    const all = await search({});
    assert.deepEqual(all.events.map(item => item.id), [solo.id, festival.id], 'upcoming events sort by date');
    assert.deepEqual((await search({ bandId: band.id })).events.map(item => item.id), [festival.id]);
    assert.deepEqual((await search({ artistId: users[0] })).events.map(item => item.id), [solo.id, festival.id]);
    assert.deepEqual((await search({ organizerId: organizer.id })).events.map(item => item.id), [festival.id]);
    assert.deepEqual((await search({ venueId: venue.id })).events.map(item => item.id), [festival.id]);
    assert.deepEqual((await search({ type: 'festival' })).events.map(item => item.id), [festival.id]);
    assert.equal((await search({ genreId: genre.id })).events.length, 2);
    assert.equal((await search({ placeId: String(place.id), radiusKm: '20' })).events.length, 2);
    assert.equal((await search({ latitude: '41.9', longitude: '12.5', radiusKm: '50' })).events.length, 0);
    assert.deepEqual((await search({ q: 'Synthetic Strangers' })).events.map(item => item.id), [festival.id]);
    assert.deepEqual((await search({ from: rome(8 * DAY).slice(0, 10) })).events.map(item => item.id), [festival.id]);
    assert.equal((await search({ when: 'past' })).events.length, 0);
    assert.deepEqual((await search({ sort: 'band' })).events.map(item => item.id), [festival.id, solo.id], 'Amplifiers before person 0');
    assert.deepEqual((await search({ sort: 'organizer' })).events.map(item => item.id), [solo.id, festival.id], 'person 0 before Promotions');
    assert.equal((await search({ sort: 'location' })).events.length, 2);
    await call('/gigs?from=2026-12-02&to=2026-12-01', { actor: null, status: 400 });
    await call('/gigs?latitude=45', { actor: null, status: 400 });
  });

  await t.test('attendance, profile lists, and page lists follow privacy choices', async () => {
    const going = await call(`/gigs/${festival.id}/attendance`, { actor: 3, method: 'PUT', body: { status: 'going' } });
    assert.deepEqual(going.attendance, { going: 1, interested: 0 });
    assert.equal(going.viewer.attendance, 'going');
    await call(`/gigs/${festival.id}/attendance`, { actor: 5, method: 'PUT', body: { status: 'interested' } });
    const profile = await call(`/gigs/profiles/${users[3]}`, { actor: 5 });
    assert.deepEqual(profile.events.map(item => [item.id, item.relations]), [[festival.id, ['attendee']]]);
    await call(`/gigs/${festival.id}/attendance`, { actor: 3, method: 'PUT', body: { status: 'going', showOnProfile: false } });
    assert.equal((await call(`/gigs/profiles/${users[3]}`, { actor: 5 })).events.length, 0);
    assert.equal((await call(`/gigs/profiles/${users[3]}`, { actor: 3 })).events.length, 1);
    const performer = await call(`/gigs/profiles/${users[0]}`, { actor: null });
    assert.deepEqual(performer.events.map(item => item.relations), [['performer'], ['performer']]);
    assert.deepEqual((await call(`/gigs/organizations/${band.id}`, { actor: null })).events.map(item => item.relations), [['performer']]);
    assert.deepEqual((await call(`/gigs/organizations/${venue.id}`, { actor: null })).events.map(item => item.relations), [['venue']]);
    assert.deepEqual((await call(`/gigs/organizations/${organizer.id}`, { actor: null })).events.map(item => item.relations), [['organizer']]);
    assert.equal((await call(`/gigs/organizations/${organizer.id}?when=past`, { actor: null })).events.length, 0);
    assert.deepEqual((await call('/gigs/mine?role=attending', { actor: 3 })).events.map(item => item.id), [festival.id]);
    assert.deepEqual((await call('/gigs/mine', { actor: 1 })).events.map(item => item.id), [festival.id]);
    assert.deepEqual((await call('/gigs/mine', { actor: 0 })).events.map(item => item.id), [solo.id]);
  });

  await t.test('reminders are leased once and sent through the events notification kinds', async () => {
    await call(`/gigs/${festival.id}/reminders`, { actor: 3, method: 'PUT', status: 400, body: { offsets: [1] } });
    await call(`/gigs/${festival.id}/reminders`, { actor: 3, method: 'PUT', status: 400, body: { offsets: [20160] } });
    const saved = await call(`/gigs/${festival.id}/reminders`, { actor: 3, method: 'PUT', body: { offsets: [1440, 60] } });
    assert.deepEqual(saved.reminders, [60, 1440]);
    assert.deepEqual((await call(`/gigs/${festival.id}`, { actor: 3 })).viewer.reminders, [60, 1440]);
    await realmConnector.execute(`
      UPDATE event_reminders SET remind_at = NOW() - INTERVAL '1 minute' WHERE event_id = $1 AND user_id = $2 AND offset_minutes = 1440`,
    [festival.id, users[3]]);
    const job = new EventReminderJob({ intervalSeconds: 60 });
    const [first, second] = await Promise.all([job.runOnce(), new EventReminderJob({ intervalSeconds: 60 }).runOnce()]);
    assert.equal(first.sent + second.sent, 1);
    assert.equal((await job.runOnce()).sent, 0);
    const reminders = await kinds(3, 'event_reminder');
    assert.equal(reminders.length, 1);
    assert.equal(reminders[0].params.eventId, festival.id);
    assert.equal(reminders[0].params.offsetMinutes, 1440);
    const kept = await call(`/gigs/${festival.id}/reminders`, { actor: 3, method: 'PUT', body: { offsets: [1440, 15] } });
    assert.deepEqual(kept.reminders, [15, 1440], 'a reminder that already fired can stay selected');
    assert.equal((await job.runOnce()).sent, 0, 'kept reminders do not fire again');
    await call(`/gigs/${festival.id}/reminders`, { actor: 3, method: 'PUT', body: { offsets: [1440, 60] } });
    const moved = await call(`/gigs/${festival.id}`, { actor: 1, method: 'PATCH', body: { startsAt: rome(12 * DAY), endsAt: rome(13 * DAY) } });
    assert.equal(moved.local.startsAt, rome(12 * DAY));
    const { rows } = await realmConnector.execute(
      'SELECT offset_minutes, sent_at FROM event_reminders WHERE event_id = $1 AND user_id = $2 ORDER BY offset_minutes', [festival.id, users[3]]);
    assert.deepEqual(rows.map(row => [row.offset_minutes, row.sent_at]), [[60, null], [1440, null]], 'rescheduling re-arms reminders');
  });

  await t.test('attendees discuss the event while organizers moderate and reports reach administrators', async () => {
    await call(`/gigs/${festival.id}/posts`, { actor: 6, status: 403 });
    await call(`/gigs/${festival.id}/posts`, { actor: 6, method: 'POST', status: 403, body: { body: 'Let me in' } });
    const post = await call(`/gigs/${festival.id}/posts`, { actor: 3, method: 'POST', status: 201, body: { body: 'Who is sharing a ride?' } });
    assert.equal(post.isOwn, true);
    const rude = await call(`/gigs/${festival.id}/posts`, { actor: 5, method: 'POST', status: 201, body: { body: 'A synthetic rude remark' } });
    const board = await call(`/gigs/${festival.id}/posts`, { actor: 1 });
    assert.deepEqual(board.posts.map(item => [item.body, item.canDelete]), [['A synthetic rude remark', true], ['Who is sharing a ride?', true]]);
    await realmConnector.execute('INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2)', [users[3], users[5]]);
    assert.deepEqual((await call(`/gigs/${festival.id}/posts`, { actor: 3 })).posts.map(item => item.id), [post.id]);
    await call(`/gigs/${festival.id}/posts/${post.id}`, { actor: 5, method: 'DELETE', status: 403 });
    const report = await call(`/gigs/${festival.id}/posts/${rude.id}/reports`, {
      actor: 3, method: 'POST', status: 201, body: { category: 'harassment', details: 'Synthetic harassment report', consent: true },
    });
    await call(`/gigs/${festival.id}/posts/${rude.id}/reports`, {
      actor: 3, method: 'POST', status: 409, body: { category: 'harassment', details: 'Synthetic harassment report', consent: true },
    });
    const detail = await call(`/admin/reports/${report.id}`, { actor: 4 });
    assert.equal(detail.evidence, 'A synthetic rude remark');
    assert.equal(detail.reportedUserId, users[5]);
    const second = await call(`/gigs/${festival.id}/posts`, { actor: 5, method: 'POST', status: 201, body: { body: 'Another synthetic remark' } });
    const secondReport = await call(`/gigs/${festival.id}/posts/${second.id}/reports`, {
      actor: 3, method: 'POST', status: 201, body: { category: 'spam', details: 'Synthetic spam report', consent: true },
    });
    await call(`/gigs/${festival.id}/posts/${second.id}`, { actor: 5, method: 'DELETE' });
    await call(`/gigs/${festival.id}/posts/${rude.id}`, { actor: 4, method: 'DELETE' });
    const { rows } = await realmConnector.execute(
      'SELECT id, status, event_post_id FROM user_reports WHERE id = ANY($1::uuid[])', [[report.id, secondReport.id]]);
    const statusOf = id => rows.find(row => row.id === id);
    assert.deepEqual([statusOf(report.id).status, statusOf(report.id).event_post_id], ['actioned', null], 'administrator removal resolves reports');
    assert.equal(statusOf(secondReport.id).status, 'open', 'an author deleting a reported post does not close the report');
    const audit = await realmConnector.execute("SELECT 1 FROM admin_audit WHERE actor_id = $1 AND action = 'event_post_removed'", [users[4]]);
    assert.equal(audit.rowCount, 1);
    await call(`/gigs/${festival.id}/reports`, {
      actor: 5, method: 'POST', status: 201, body: { category: 'other', details: 'This synthetic event looks fake', consent: true },
    });
    await call(`/gigs/${festival.id}/reports`, {
      actor: 1, method: 'POST', status: 400, body: { category: 'other', details: 'Reporting my own event', consent: true },
    });
  });

  await t.test('official communications and status changes reach every attendee', async () => {
    await call(`/gigs/${festival.id}/communications`, { actor: 3, method: 'POST', status: 403, body: { kind: 'general', body: 'Fake news' } });
    const doors = await call(`/gigs/${festival.id}/communications`, {
      actor: 1, method: 'POST', status: 201, body: { kind: 'door_open', body: 'Doors open at 18:00 at the north gate.' },
    });
    assert.equal(doors.kind, 'door_open');
    const messages = await kinds(3, 'event_communication');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].params.communicationKind, 'door_open');
    assert.equal((await kinds(5, 'event_communication')).length, 1, 'interested people are told too');
    await call(`/gigs/${festival.id}`, { actor: 1, method: 'DELETE', status: 409 });
    await call(`/gigs/${festival.id}`, { actor: 1, method: 'PATCH', status: 409, body: { visibility: 'draft' } });
    const cancelled = await call(`/gigs/${festival.id}`, {
      actor: 1, method: 'PATCH', body: { status: 'cancelled', statusNote: 'Refunds go back to the original payment method.' },
    });
    assert.equal(cancelled.status, 'cancelled');
    const detail = await call(`/gigs/${festival.id}`, { actor: 3 });
    assert.deepEqual(detail.communications.map(item => [item.kind, item.automatic]), [['cancellation', true], ['door_open', false]]);
    assert.equal((await kinds(3, 'event_communication')).length, 2);
    await call(`/gigs/${festival.id}/attendance`, { actor: 6, method: 'PUT', status: 409, body: { status: 'going' } });
    await call(`/gigs/${festival.id}/reminders`, { actor: 3, method: 'PUT', status: 409, body: { offsets: [60, 120] } });
    await call(`/gigs/${festival.id}/reminders`, { actor: 3, method: 'PUT', body: { offsets: [] } });
    const ics = await call(`/gigs/${festival.id}/calendar.ics`, { actor: null });
    assert.match(ics.body, /STATUS:CANCELLED/);
  });

  await t.test('performers can leave a lineup and editors can delete finished or cancelled events', async () => {
    const entry = (await call(`/gigs/${festival.id}`, { actor: 0 })).lineup.find(item => item.artist?.userId === users[0]);
    await call(`/gigs/${festival.id}/lineup/${entry.id}`, { actor: 5, method: 'DELETE', status: 403 });
    await call(`/gigs/${festival.id}/lineup/${entry.id}`, { actor: 0, method: 'DELETE' });
    assert.equal((await call(`/gigs/${festival.id}`, { actor: 0 })).lineup.length, 2);
    await call(`/gigs/${festival.id}`, { actor: 1, method: 'DELETE' });
    await call(`/gigs/${festival.id}`, { actor: 3, status: 404 });
  });

  await t.test('deleted organizer pages can be dropped, and events left without organizers are hidden', async () => {
    const other = await call('/organizations', { actor: 1, method: 'POST', status: 201, body: { kind: 'organizer', name: `${marker} Side Stage` } });
    organizations.push(other.id);
    const base = { timezone: 'Europe/Rome', startsAt: rome(30 * DAY), visibility: 'published' };
    const shared = await call('/gigs', { actor: 1, method: 'POST', status: 201, body: { ...base, title: `${marker} co-hosted`, organizerIds: [organizer.id, other.id] } });
    const orphan = await call('/gigs', { actor: 1, method: 'POST', status: 201, body: { ...base, title: `${marker} side stage only`, organizerIds: [other.id] } });
    await call(`/organizations/${other.id}`, { actor: 1, method: 'DELETE' });
    assert.deepEqual((await call(`/gigs/${shared.id}`, { actor: 5 })).organizers.map(item => item.id), [organizer.id]);
    const saved = await call(`/gigs/${shared.id}`, { actor: 1, method: 'PATCH', body: { title: `${marker} co-hosted night`, organizerIds: [organizer.id] } });
    assert.equal(saved.title, `${marker} co-hosted night`);
    await call(`/gigs/${orphan.id}`, { actor: 5, status: 404 });
    assert.ok(!(await search({})).events.some(item => item.id === orphan.id));
  });

  await t.test('page leaders request verification and administrators decide in the shared queue', async () => {
    const status = await call(`/organizations/${band.id}/verification-request`, { actor: 2 });
    assert.equal(status.verified, false);
    assert.match(status.challengeCode, /^EM-[A-Z0-9]{6}$/);
    await call(`/organizations/${band.id}/verification-request`, { actor: 3, status: 403 });
    const document = await upload(2, 'verification');
    await call(`/organizations/${band.id}/verification-request`, { actor: 2, method: 'POST', status: 400, body: { note: 'short' } });
    const request = await call(`/organizations/${band.id}/verification-request`, {
      actor: 2, method: 'POST', status: 201,
      body: { note: `Our official site links back here with ${status.challengeCode}.`, documentMediaId: document.id },
    });
    assert.equal(request.status, 'pending');
    await call(`/organizations/${band.id}/verification-request`, {
      actor: 2, method: 'POST', status: 409, body: { note: 'A second request while pending' },
    });
    const queue = await call('/admin/verification-requests?status=pending&pageSize=100', { actor: 4 });
    const queued = queue.requests.find(item => item.id === request.id);
    assert.equal(queued.subjectType, 'organization');
    assert.equal(queued.organizationName, `${marker} Amplifiers`);
    assert.match(queued.requestNote, /official site/);
    const evidence = await call(`/admin/verification-requests/${request.id}/media/${document.id}`, { actor: 4 });
    assert.equal(evidence.headers['content-type'], 'image/webp');
    await call(`/admin/verification-requests/${request.id}`, { actor: 4, method: 'PATCH', body: { decision: 'approve', note: 'Matches the official website.' } });
    const page = await call(`/organizations/${band.id}`, { actor: null });
    assert.equal(page.verified, true);
    const audit = await realmConnector.execute(
      "SELECT action FROM admin_audit WHERE actor_id = $1 AND target_id = $2 AND action LIKE 'organization_verification_%'", [users[4], band.id]);
    assert.deepEqual(audit.rows.map(row => row.action), ['organization_verification_approved']);
    const decided = await kinds(2, 'verification_decided');
    assert.equal(decided[0].params.subjectType, 'organization');
    assert.equal(decided[0].link, `#organization?id=${band.id}`);
    await call(`/organizations/${band.id}/verification-request`, { actor: 2, method: 'POST', status: 409, body: { note: 'Already verified page' } });
    assert.equal((await call('/verification/me', { actor: 2 })).request, null, 'user verification stays separate');
  });

  await t.test('exports include event data and deletion keeps organization events', async () => {
    const shared = await call('/gigs', { actor: 1, method: 'POST', status: 201, body: {
      title: `${marker} shared night`, timezone: 'Europe/Rome', startsAt: rome(20 * DAY), organizerIds: [organizer.id],
    } });
    await call(`/gigs/${shared.id}`, { actor: 1, method: 'PATCH', body: { visibility: 'published' } });
    await call(`/gigs/${shared.id}/attendance`, { actor: 3, method: 'PUT', body: { status: 'interested' } });
    await call(`/gigs/${shared.id}/reminders`, { actor: 3, method: 'PUT', body: { offsets: [120] } });
    await call(`/gigs/${shared.id}/posts`, { actor: 3, method: 'POST', status: 201, body: { body: 'Who is sharing a ride?' } });
    const exported = await call('/account/export', { actor: 3 });
    assert.ok(exported.eventAttendance.length >= 1);
    assert.ok(exported.eventReminders.length >= 1);
    assert.ok(exported.eventPostsWritten.some(item => item.body === 'Who is sharing a ride?'));
    const leaderExport = await call('/account/export', { actor: 2 });
    assert.equal(leaderExport.organizationVerificationRequests.length, 1);
    await accountRepository.deleteAccount(users[1]);
    const { rows } = await realmConnector.execute('SELECT owner_user_id, created_by FROM events WHERE id = $1', [shared.id]);
    assert.deepEqual(rows[0], { owner_user_id: null, created_by: null });
    await accountRepository.deleteAccount(users[0]);
    assert.equal((await realmConnector.execute('SELECT 1 FROM events WHERE id = $1', [solo.id])).rowCount, 0, 'solo events are removed');
  });
});
