import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { entitlementRepository } from '../../src/repositories/entitlement-repository.js';
import { organizationRepository } from '../../src/repositories/organization-repository.js';
import { OrganizationFeedImporter } from '../../src/engines/organization-feed-importer.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

const channel = 'UCsyntheticchannel000001';

test('organizations: pages, memberships, relations, releases, feeds, claims, and music lovers', async (t) => {
  const marker = `organizations-${randomUUID()}`;
  const users = [];
  const tokens = [];
  const organizations = [];
  await realmConnector.establish();
  const app = await buildNexus({
    config: { ...realmConfig, boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 } },
    logger: false, backgroundJobs: false,
  });
  t.after(async () => {
    await app.close();
    await realmConnector.execute('DELETE FROM organizations WHERE id = ANY($1::uuid[]) OR created_by = ANY($2::uuid[])', [organizations, users]);
    await realmConnector.execute('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });
  // 0 leader, 1 bandmate, 2 fan, 3 agency owner, 4 admin, 5 outsider
  for (let i = 0; i < 6; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email, i === 4 ? 'admin' : 'member'],
    );
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `${marker} person ${i}`, 'Synthetic City']);
  }
  const genres = (await realmConnector.execute('SELECT id FROM genres ORDER BY name LIMIT 3')).rows.map(row => row.id);
  async function call(path, { actor = 0, method = 'GET', body, status = 200 } = {}) {
    const headers = actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` };
    const response = await app.inject({ method, url: `/realm${path}`, headers, payload: body });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.headers['content-type']?.includes('json') ? response.json().data : response;
  }
  async function notifications(actor) {
    return (await call('/notifications?pageSize=50', { actor })).notifications;
  }
  async function image(actor) {
    const data = (await sharp({ create: { width: 40, height: 30, channels: 3, background: '#6a5acd' } }).png().toBuffer()).toString('base64');
    return call('/media', { actor, method: 'POST', body: { data, mimeType: 'image/png', purpose: 'organization' }, status: 201 });
  }
  let band;
  let otherBand;

  await t.test('anyone can create a band and becomes its leader; pages route by id or slug', async () => {
    const picture = await image(0);
    band = await call('/organizations', { method: 'POST', status: 201, body: {
      kind: 'band', name: `${marker} Band`, slug: `org-${marker.slice(-12)}-band`, bio: 'A synthetic band.', pictureUrl: picture.url,
      city: 'Synthetic City', country: 'Testland', latitude: 45.1, longitude: 9.1, genreIds: genres.slice(0, 2), formedYear: 2019,
      openTo: { tours: true, supportActs: true }, title: 'Lead guitar',
      links: [{ linkType: 'bandcamp', url: 'https://example.test/band' }, { linkType: 'instagram', url: 'https://example.test/insta' }],
    } });
    organizations.push(band.id);
    assert.equal(band.kind, 'band');
    assert.equal(band.members.length, 1);
    assert.deepEqual([band.members[0].role, band.members[0].title], ['leader', 'Lead guitar']);
    assert.deepEqual(band.band.openTo, { tours: true, live: false, supportActs: true, endorsements: false });
    assert.equal(band.viewer.role, 'leader');
    assert.equal(band.links.length, 2);
    const anonymous = await call(`/organizations/${band.slug}`, { actor: null });
    assert.equal(anonymous.id, band.id);
    assert.deepEqual(anonymous.viewer.permissions, []);
    const media = await app.inject({ method: 'GET', url: picture.url });
    assert.equal(media.statusCode, 200, 'referenced organization pictures are public');
    await call('/organizations', { method: 'POST', status: 400, body: { kind: 'band', name: 'Wrong', capacity: 30 } });
    await call('/organizations', { method: 'POST', status: 409, body: { kind: 'band', name: 'Copy', slug: band.slug } });
    await call('/organizations', { method: 'POST', status: 400, body: { kind: 'band', name: 'Foreign image', pictureUrl: (await image(5)).url } });
    otherBand = await call('/organizations', { actor: 5, method: 'POST', status: 201, body: {
      kind: 'band', name: `${marker} Neighbours`, city: 'Synthetic City', genreIds: [genres[0]],
    } });
    organizations.push(otherBand.id);
  });

  await t.test('business pages respect the configured plan limit', async () => {
    const original = entitlementRepository.config;
    entitlementRepository.config = { ...original, free: { ...original.free, businessPages: false } };
    try {
      const denied = await app.inject({ method: 'POST', url: '/realm/organizations', headers: { authorization: `Bearer ${tokens[3]}` },
        payload: { kind: 'booking_agency', name: `${marker} Agency` } });
      assert.equal(denied.json().error.code, 'PLAN_LIMIT_REACHED');
      const unmanaged = await call('/organizations', { actor: 5, method: 'POST', status: 201, body: {
        kind: 'venue', managed: false, name: `${marker} Community Hall`, venueType: 'social_center', capacity: 120,
      } });
      organizations.push(unmanaged.id);
      assert.equal(unmanaged.managed, false);
      assert.equal(unmanaged.viewer.role, 'maintainer');
      await call(`/organizations/${unmanaged.id}/claims`, { actor: 3, method: 'POST', status: 403, body: { message: 'I run this synthetic venue.' } });
    } finally {
      entitlementRepository.config = original;
    }
  });

  await t.test('profile editing needs manage_profile and keeps kind-specific rules', async () => {
    await call(`/organizations/${band.id}`, { actor: 5, method: 'PATCH', status: 403, body: { bio: 'Hijack' } });
    const updated = await call(`/organizations/${band.id}`, { method: 'PATCH', body: {
      bio: 'Updated synthetic bio.', genreIds: [genres[0]], links: [], openTo: { live: true }, youtubeChannelId: channel,
    } });
    assert.equal(updated.bio, 'Updated synthetic bio.');
    assert.equal(updated.genres.length, 1);
    assert.equal(updated.links.length, 0);
    assert.deepEqual(updated.band.openTo, { tours: true, live: true, supportActs: true, endorsements: false });
    assert.equal(updated.pictureUrl, band.pictureUrl, 'omitted fields stay unchanged');
    await call(`/organizations/${band.id}`, { method: 'PATCH', status: 400, body: { venueType: 'club' } });
    const photo = await call(`/organizations/${band.id}/photos`, { method: 'POST', status: 201, body: { url: (await image(0)).url, category: 'gallery', caption: 'Rehearsal' } });
    assert.equal((await call(`/organizations/${band.id}`, { actor: null })).photos[0].id, photo.id);
  });

  await t.test('invitations, permissions, titles, history, and leadership transfer', async () => {
    await call(`/organizations/${band.id}/members`, { actor: 1, method: 'POST', status: 403, body: { userId: users[5] } });
    await call(`/organizations/${band.id}/members`, { method: 'POST', status: 201, body: { userId: users[1], title: 'Drums', permissions: ['post_announcements'] } });
    await call(`/organizations/${band.id}/members`, { method: 'POST', status: 409, body: { userId: users[1] } });
    const inbox = await call('/organizations/mine', { actor: 1 });
    assert.equal(inbox.invitations[0].organization.id, band.id);
    assert.ok((await notifications(1)).some(item => item.kind === 'organization_invitation' && item.params.organizationId === band.id));
    await call(`/organizations/${band.id}/invitation`, { actor: 1, method: 'PATCH', body: { response: 'accept' } });
    assert.ok((await notifications(0)).some(item => item.kind === 'organization_membership' && item.params.response === 'accepted'));
    const members = (await call(`/organizations/${band.id}/members`, { actor: 1 })).members;
    const drummer = members.find(member => member.userId === users[1]);
    assert.deepEqual([drummer.role, drummer.status, drummer.title, drummer.permissions], ['member', 'active', 'Drums', ['post_announcements']]);
    await call(`/organizations/${band.id}/members/${users[1]}`, { actor: 1, method: 'PATCH', status: 403, body: { permissions: ['manage_profile'] } });
    await call(`/organizations/${band.id}/members/${users[1]}`, { actor: 1, method: 'PATCH', body: { title: 'Drums and vocals' } });
    await call(`/organizations/${band.id}/members/${users[1]}`, { method: 'PATCH', status: 400, body: { joinedOn: '2023-02-30' } });
    await call(`/organizations/${band.id}/members/${users[1]}`, { method: 'PATCH', body: { joinedOn: '2020-03-01', permissions: ['post_announcements', 'manage_members'] } });
    await call(`/organizations/${band.id}/members`, { actor: 1, method: 'POST', status: 403, body: { userId: users[5], role: 'admin' } });
    await call(`/organizations/${band.id}/members`, { actor: 1, method: 'POST', status: 201, body: { userId: users[5] } });
    await call(`/organizations/${band.id}/members/${users[5]}`, { actor: 1, method: 'DELETE' });
    assert.equal((await call('/organizations/invitations', { actor: 5 })).invitations.length, 0, 'cancelled invitations disappear');
    await call(`/organizations/${band.id}/members/${users[0]}`, { method: 'DELETE', status: 409 });
    await call(`/organizations/${band.id}/leadership`, { actor: 1, method: 'POST', status: 403, body: { userId: users[0] } });
    await call(`/organizations/${band.id}/leadership`, { method: 'POST', status: 400, body: { userId: users[0] } });
    await call(`/organizations/${band.id}/leadership`, { method: 'POST', body: { userId: users[1] } });
    let detail = await call(`/organizations/${band.id}`);
    assert.deepEqual(detail.members.map(member => [member.userId, member.role]), [[users[1], 'leader'], [users[0], 'admin']]);
    assert.ok((await notifications(1)).some(item => item.kind === 'organization_membership' && item.params.change === 'leader'));
    await call(`/organizations/${band.id}/members/${users[0]}`, { method: 'DELETE' });
    detail = await call(`/organizations/${band.id}`, { actor: null });
    assert.equal(detail.members.length, 1);
    assert.equal(detail.history[0].userId, users[0]);
    assert.equal(detail.history[0].status, 'left');
    assert.ok(detail.history[0].leftOn);
    await call(`/organizations/${band.id}`, { method: 'PATCH', status: 403, body: { bio: 'Former member edit' } });
    await call(`/organizations/${band.id}/members`, { actor: 1, method: 'POST', status: 201, body: { userId: users[0], role: 'admin', title: 'Lead guitar' } });
    await call(`/organizations/${band.id}/invitation`, { method: 'PATCH', body: { response: 'accept' } });
    assert.equal((await call(`/organizations/${band.id}`)).viewer.role, 'admin');
    const formerStint = detail.history[0].memberId;
    await call(`/organizations/${band.id}/members/${users[0]}`, { actor: 1, method: 'PATCH', body: { memberId: formerStint, title: 'Rhythm guitar', leftOn: detail.history[0].leftOn } });
    detail = await call(`/organizations/${band.id}`, { actor: null });
    assert.deepEqual(detail.history.map(item => [item.memberId, item.title]), [[formerStint, 'Rhythm guitar']]);
    assert.equal(detail.members.find(item => item.userId === users[0]).title, 'Lead guitar', 'editing a former period leaves the current one unchanged');
    assert.equal((await call(`/users/${users[0]}/organizations`, { actor: null })).organizations[0].id, band.id);
  });

  await t.test('followers receive posts and releases, and the updates feed lists them', async () => {
    await call(`/organizations/${band.id}/follow`, { actor: 2, method: 'POST' });
    assert.equal((await call(`/organizations/${band.id}`, { actor: 2 })).isFollowing, true);
    await call(`/organizations/${band.id}/posts`, { actor: 2, method: 'POST', status: 403, body: { body: 'Not a member' } });
    await call(`/organizations/${band.id}/posts`, { actor: 1, method: 'POST', status: 400, body: {} });
    const post = await call(`/organizations/${band.id}/posts`, { actor: 1, method: 'POST', status: 201, body: { title: 'Rehearsal tonight', body: 'Synthetic news.' } });
    const release = await call(`/organizations/${band.id}/releases`, { method: 'POST', status: 201, body: {
      title: 'Synthetic EP', releaseType: 'ep', releaseDate: '2026-03-01', links: [{ linkType: 'bandcamp', url: 'https://example.test/ep' }],
    } });
    await call(`/organizations/${band.id}/releases`, { method: 'POST', status: 400, body: { title: 'Bad date', releaseType: 'lp', releaseDate: '2026-13-01' } });
    const kinds = (await notifications(2)).filter(item => item.kind === 'organization_update').map(item => item.params.source);
    assert.deepEqual(kinds.sort(), ['manual', 'release']);
    const feed = await call('/organizations/updates', { actor: 2 });
    assert.deepEqual(feed.posts.map(item => item.source).sort(), ['manual', 'release']);
    assert.equal(feed.posts[0].organization.id, band.id);
    assert.equal((await call(`/organizations/${band.id}`, { actor: null })).releases[0].id, release.id);
    await call(`/organizations/${band.id}/releases/${release.id}`, { method: 'PATCH', body: { title: 'Synthetic EP (deluxe)' } });
    await call(`/organizations/${band.id}/releases/${release.id}`, { method: 'DELETE' });
    await call(`/organizations/${band.id}/posts/${post.id}`, { actor: 1, method: 'DELETE' });
    assert.equal((await call(`/organizations/${band.id}/posts`, { actor: null })).posts.length, 0);
  });

  await t.test('YouTube imports dedupe videos and notify only for videos after linking', async () => {
    await realmConnector.execute("UPDATE organizations SET youtube_linked_at = '2026-01-01T00:00:00Z', feed_checked_at = NULL WHERE id = $1", [band.id]);
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><yt:videoId>oldvideo001</yt:videoId><title>Old upload</title><published>2025-06-01T00:00:00+00:00</published></entry>
      <entry><yt:videoId>newvideo001</yt:videoId><title>Brand new single</title><published>2026-02-01T00:00:00+00:00</published></entry></feed>`;
    const requested = [];
    const importer = new OrganizationFeedImporter({
      config: { youtubeFeedIntervalMinutes: 60 }, logger: { warn: assert.fail },
      fetchImpl: async url => { requested.push(url); return new Response(xml, { headers: { 'content-type': 'application/atom+xml' } }); },
    });
    const first = await importer.run();
    assert.equal(first.imported, 2);
    assert.deepEqual(requested, [`https://www.youtube.com/feeds/videos.xml?channel_id=${channel}`]);
    assert.equal((await importer.run()).checked, 0, 'recently checked channels are not fetched again');
    await realmConnector.execute('UPDATE organizations SET feed_checked_at = NULL WHERE id = $1', [band.id]);
    assert.equal((await importer.run()).imported, 0, 'videos are deduplicated');
    const videos = (await notifications(2)).filter(item => item.params.source === 'youtube');
    assert.deepEqual(videos.map(item => item.params.title), ['New video: Brand new single']);
    const posts = (await call(`/organizations/${band.id}/posts`, { actor: null })).posts;
    assert.deepEqual(posts.map(item => item.url), ['https://www.youtube.com/watch?v=newvideo001', 'https://www.youtube.com/watch?v=oldvideo001']);
    await call(`/organizations/${band.id}/posts/${posts[0].id}`, { actor: 1, method: 'DELETE', status: 404 });
  });

  await t.test('announcements can be published on behalf of a page by permitted members', async () => {
    const body = { title: `${marker} needs a bassist`, description: 'Synthetic band looking for a bass player for shows.' };
    await call('/announcements', { actor: 5, method: 'POST', status: 403, body: { ...body, organizationId: band.id } });
    const created = await call('/announcements', { actor: 1, method: 'POST', status: 201, body: { ...body, organizationId: band.id } });
    assert.deepEqual([created.organization.id, created.organization.name], [band.id, band.name]);
    const listed = await call(`/organizations/${band.id}/announcements`, { actor: null });
    assert.equal(listed.announcements[0].id, created.id);
    assert.ok((await notifications(2)).some(item => item.params.source === 'announcement' && item.link === `#announcement?id=${created.id}`));
    const search = await call(`/announcements/search?searchTerm=${encodeURIComponent(marker)}`, { actor: 2 });
    assert.equal(search.announcements[0].organization.id, band.id);
    const detached = await call(`/announcements/${created.id}`, { actor: 1, method: 'PUT', body: { organizationId: null } });
    assert.equal(detached.organization, null);
    const personal = await call('/announcements', { actor: 2, method: 'POST', status: 201, body: { ...body, title: `${marker} personal call` } });
    assert.equal(personal.organization, null);
  });

  await t.test('agency rosters and label signings need the band to accept', async () => {
    const agency = await call('/organizations', { actor: 3, method: 'POST', status: 201, body: { kind: 'booking_agency', name: `${marker} Agency` } });
    const label = await call('/organizations', { actor: 3, method: 'POST', status: 201, body: { kind: 'label', name: `${marker} Records` } });
    organizations.push(agency.id, label.id);
    await call(`/organizations/${band.id}/relations`, { actor: 1, method: 'POST', status: 409, body: { bandId: otherBand.id } });
    const roster = await call(`/organizations/${agency.id}/relations`, { actor: 3, method: 'POST', status: 201, body: { bandId: band.id } });
    await call(`/organizations/${agency.id}/relations`, { actor: 3, method: 'POST', status: 409, body: { bandId: band.id } });
    const signing = await call(`/organizations/${label.id}/relations`, { actor: 3, method: 'POST', status: 201, body: { bandId: band.id } });
    assert.equal((await call('/organizations/mine', { actor: 1 })).relationRequests.length, 2);
    await call(`/organizations/${band.id}/relations/${roster.id}`, { actor: 2, method: 'PATCH', status: 403, body: { response: 'accept' } });
    await call(`/organizations/${band.id}/relations/${roster.id}`, { actor: 1, method: 'PATCH', body: { response: 'accept' } });
    await call(`/organizations/${band.id}/relations/${signing.id}`, { actor: 1, method: 'PATCH', body: { response: 'decline' } });
    await call(`/organizations/${band.id}/relations/${signing.id}`, { actor: 1, method: 'PATCH', status: 409, body: { response: 'accept' } });
    assert.ok((await notifications(3)).some(item => item.kind === 'organization_relation' && item.params.status === 'accepted'));
    const agencyPage = await call(`/organizations/${agency.id}`, { actor: null });
    assert.deepEqual(agencyPage.relations.map(item => [item.kind, item.band.id]), [['roster', band.id]]);
    assert.equal((await call(`/organizations/${band.id}`, { actor: null })).relations[0].organization.id, agency.id);
    await call(`/organizations/${agency.id}/relations/${roster.id}`, { actor: 3, method: 'DELETE' });
    assert.equal((await call(`/organizations/${agency.id}`, { actor: null })).relations.length, 0);
  });

  await t.test('similar bands combine manual picks with explained suggestions', async () => {
    const suggestions = (await call(`/organizations/${band.id}/suggestions`, { actor: null })).suggestions;
    const neighbour = suggestions.find(item => item.id === otherBand.id);
    assert.ok(neighbour, 'a band sharing a genre and city is suggested');
    assert.deepEqual(neighbour.reasons.map(item => item.reason), ['shared_genres', 'nearby']);
    await call(`/organizations/${band.id}/similar`, { actor: 5, method: 'PUT', status: 403, body: { bandIds: [otherBand.id] } });
    await call(`/organizations/${band.id}/similar`, { actor: 1, method: 'PUT', status: 400, body: { bandIds: [band.id] } });
    const { similar } = await call(`/organizations/${band.id}/similar`, { actor: 1, method: 'PUT', body: { bandIds: [otherBand.id] } });
    assert.deepEqual(similar.map(item => item.id), [otherBand.id]);
    assert.equal((await call(`/organizations/${band.id}/suggestions`, { actor: null })).suggestions.some(item => item.id === otherBand.id), false);
  });

  await t.test('community venues can be claimed through audited admin review, and pages verified', async () => {
    const hall = await call('/organizations', { actor: 2, method: 'POST', status: 201, body: {
      kind: 'venue', managed: false, name: `${marker} Open Hall`, venueType: 'venue', capacity: 80, parkingInfo: 'Street parking',
      latitude: 45.2, longitude: 9.2,
    } });
    organizations.push(hall.id);
    assert.deepEqual(hall.coordinates, { latitude: 45.2, longitude: 9.2 });
    await call(`/organizations/${hall.id}`, { actor: 5, method: 'PATCH', status: 403, body: { capacity: 90 } });
    await call(`/organizations/${hall.id}`, { actor: 2, method: 'PATCH', body: { capacity: 90 } });
    await call(`/organizations/${hall.id}/members`, { actor: 2, method: 'POST', status: 403, body: { userId: users[5] } });
    await call(`/organizations/${hall.id}/posts`, { actor: 2, method: 'POST', status: 403, body: { body: 'Unmanaged update' } });
    const claim = await call(`/organizations/${hall.id}/claims`, { actor: 3, method: 'POST', status: 201, body: { message: 'I manage this synthetic venue.' } });
    await call(`/organizations/${hall.id}/claims`, { actor: 3, method: 'POST', status: 409, body: { message: 'Second synthetic request.' } });
    const rival = await call(`/organizations/${hall.id}/claims`, { actor: 5, method: 'POST', status: 201, body: { message: 'I also run this synthetic venue.' } });
    assert.equal((await call(`/organizations/${hall.id}`, { actor: 3 })).viewer.claim.status, 'pending');
    await call('/admin/organization-claims', { actor: 3, status: 403 });
    const queue = await call('/admin/organization-claims?status=pending&pageSize=100', { actor: 4 });
    assert.ok(queue.claims.some(item => item.id === claim.id && item.organization.id === hall.id));
    await call(`/admin/organization-claims/${claim.id}`, { actor: 4, method: 'PATCH', body: { decision: 'approve', note: 'Synthetic evidence checked.' } });
    await call(`/admin/organization-claims/${claim.id}`, { actor: 4, method: 'PATCH', status: 409, body: { decision: 'reject' } });
    const claimed = await call(`/organizations/${hall.id}`, { actor: 3 });
    assert.equal(claimed.managed, true);
    assert.equal(claimed.viewer.role, 'leader');
    await call(`/organizations/${hall.id}`, { actor: 2, method: 'PATCH', status: 403, body: { capacity: 100 } });
    assert.ok((await notifications(5)).some(item => item.kind === 'organization_claim' && item.params.outcome === 'rejected'));
    assert.equal((await realmConnector.execute('SELECT status FROM organization_claims WHERE id = $1', [rival.id])).rows[0].status, 'rejected');
    await call(`/admin/organizations/${band.id}/verification`, { actor: 1, method: 'PUT', status: 403, body: { verified: true } });
    assert.equal((await call(`/admin/organizations/${band.id}/verification`, { actor: 4, method: 'PUT', body: { verified: true } })).verified, true);
    assert.equal((await call(`/organizations?kind=band&q=${encodeURIComponent(marker)}`, { actor: null })).organizations.find(item => item.id === band.id).verified, true);
    await call(`/admin/organizations/${band.id}/verification`, { actor: 4, method: 'PUT', body: { verified: false } });
    const { rows } = await realmConnector.execute('SELECT action, target_id FROM admin_audit WHERE actor_id = $1 ORDER BY created_at, action', [users[4]]);
    assert.deepEqual(rows.map(row => [row.action, row.target_id]), [
      ['organization_claim_approved', hall.id], ['organization_verified', band.id], ['organization_unverified', band.id],
    ]);
  });

  await t.test('discovery filters by kind, name, genre, and location with bounded pages', async () => {
    const byGenre = await call(`/organizations?q=${encodeURIComponent(marker)}&genreId=${genres[0]}&kind=band`, { actor: null });
    assert.deepEqual(byGenre.organizations.map(item => item.id).sort(), [band.id, otherBand.id].sort());
    const byLocation = await call(`/organizations?q=${encodeURIComponent(marker)}&location=testland`, { actor: null });
    assert.deepEqual(byLocation.organizations.map(item => item.id), [band.id]);
    const paged = await call(`/organizations?q=${encodeURIComponent(marker)}&pageSize=2&sort=name`, { actor: null });
    assert.equal(paged.organizations.length, 2);
    assert.equal(paged.pagination.hasMore, true);
    await call('/organizations?kind=castle', { actor: null, status: 400 });
  });

  await t.test('music lovers have a profile kind and a follow list they can hide', async () => {
    const profile = await call('/profiles/me', { actor: 2, method: 'PUT', body: { accountKind: 'music_lover', bio: 'I go to every synthetic show.' } });
    assert.equal(profile.accountKind, 'music_lover');
    await call('/profiles/me', { actor: 2, method: 'PUT', status: 400, body: { accountKind: 'robot' } });
    await call(`/profiles/${users[1]}/follow`, { actor: 2, method: 'POST' });
    const visible = await call(`/users/${users[2]}/follows`, { actor: 5 });
    assert.deepEqual([visible.visible, visible.artists[0].userId, visible.organizations[0].id], [true, users[1], band.id]);
    assert.deepEqual(await call('/follows/visibility', { actor: 2, method: 'PUT', body: { visible: false } }), { visible: false });
    assert.deepEqual(await call(`/users/${users[2]}/follows`, { actor: 5 }), { visible: false, artists: [], organizations: [] });
    assert.equal((await call(`/users/${users[2]}/follows`, { actor: 2 })).artists.length, 1, 'owners still see their own lists');
    assert.equal((await call(`/profiles/${users[2]}`, { actor: 5 })).accountKind, 'music_lover');
  });

  await t.test('requireMember exposes the reusable permission check and deleted pages disappear', async () => {
    await realmConnector.transaction(async executor => {
      const access = await organizationRepository.requireMember(executor, band.id, users[0], 'manage_calendar');
      assert.equal(access.role, 'admin');
      await assert.rejects(organizationRepository.requireMember(executor, band.id, users[5], 'manage_calendar'), { code: 'ORGANIZATION_PERMISSION_REQUIRED' });
      await assert.rejects(organizationRepository.requireMember(executor, randomUUID(), users[0]), { code: 'ORGANIZATION_NOT_FOUND' });
      await assert.rejects(organizationRepository.requireMember(executor, band.id, users[0], 'fly'), /Unknown organization permission/);
    });
    await call(`/organizations/${otherBand.id}`, { actor: 0, method: 'DELETE', status: 403 });
    await call(`/organizations/${otherBand.id}`, { actor: 5, method: 'DELETE' });
    await call(`/organizations/${otherBand.id}`, { actor: null, status: 404 });
  });
});
