import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { PushDispatcher } from '../../src/engines/push-dispatcher.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

test('profiles, announcements and discovery: places, distance, plans, saved searches, blocks and visits', async (t) => {
  const marker = `w1-${randomUUID().slice(0, 8)}`;
  const users = [];
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
  for (let i = 0; i < 4; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute('INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email]);
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} musician ${i}`]);
  }
  const premium = actor => realmConnector.execute("INSERT INTO user_entitlements (user_id, plan, source) VALUES ($1, 'premium', 'admin')", [users[actor]]);
  async function call(path, { actor = 0, method = 'GET', body, status = 200 } = {}) {
    const response = await app.inject({
      method, url: `/realm${path}`, payload: body,
      headers: actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` },
    });
    const payload = response.json();
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return payload.success ? payload.data : payload.error;
  }
  const place = async query => (await call(`/catalog/places?q=${encodeURIComponent(query)}`, { actor: null })).places[0];
  const instrument = (await call('/catalog/instruments', { actor: null })).instruments[0].id;
  const announcement = (actor, extra = {}) => call('/announcements', {
    actor, method: 'POST', status: 201,
    body: { title: `${marker} open call`, description: 'A synthetic collaboration opportunity for discovery tests.', ...extra },
  });
  const notifications = async (actor, kind) => (await call('/notifications?pageSize=100', { actor })).notifications.filter(item => item.kind === kind);
  let milan;
  let monza;
  let hague;

  await t.test('places autocomplete by exonym, list regions and resolve the nearest city', async () => {
    milan = await place('Milano');
    assert.equal(milan.name, 'Milan');
    assert.equal(milan.label, 'Milan, Lombardy, Italy');
    assert.equal(milan.countryCode, 'IT');
    hague = await place('Den Haag');
    assert.equal(hague.name, 'The Hague');
    monza = await place('Monza');
    assert.equal(monza.countryCode, 'IT');
    assert.deepEqual((await call('/catalog/places?q=m', { actor: null })).places, []);
    await call('/catalog/places', { actor: null, status: 400 });
    await call('/catalog/places?q=rome&limit=50', { actor: null, status: 400 });
    assert.equal((await call(`/catalog/places/${milan.id}`, { actor: null })).place.region, 'Lombardy');
    await call('/catalog/places/9999999999', { actor: null, status: 404 });
    assert.equal((await call('/catalog/places/nearest?latitude=45.47&longitude=9.2', { actor: null })).place.id, milan.id);
    await call('/catalog/places/nearest?latitude=95&longitude=9', { actor: null, status: 400 });
    assert.ok((await call('/catalog/countries', { actor: null })).countries.some(item => item.code === 'IT' && item.name === 'Italy'));
    assert.ok((await call('/catalog/regions?country=it', { actor: null })).regions.some(item => item.code === '09' && item.name === 'Lombardy'));
  });

  await t.test('profiles store a place, gated contacts, content links and owner-plan display limits', async () => {
    const links = ['spotify', 'youtube', 'soundcloud', 'bandcamp', 'instagram'].map(linkType => ({ linkType, url: `https://example.test/${linkType}` }));
    const saved = await call('/profiles/me', { method: 'PUT', body: {
      age: 29, placeId: milan.id, phone: '+39 02 555 0100', telegramId: '@synthetic_band', whatsapp: '+39 333 555 0100',
      signal: 'synthetic.01', websiteUrl: 'https://example.test', contactVisibility: 'members', openToProjects: false, links,
    } });
    assert.equal(saved.age, 29);
    assert.deepEqual([saved.city, saved.state, saved.country], ['Milan', 'Lombardy', 'Italy']);
    assert.equal(saved.place.id, milan.id);
    assert.equal(saved.location.latitude, milan.latitude);
    assert.equal(saved.links.length, 5);
    assert.deepEqual(saved.publicDisplay, { maxProjectsShown: 3, maxContentShown: 3, hiddenProjects: 0, hiddenLinks: 2 });
    for (let i = 0; i < 4; i += 1) await call('/profiles/me/projects', { method: 'POST', status: 201, body: { name: `${marker} project ${i}` } });
    assert.equal((await call('/profiles/me')).publicDisplay.hiddenProjects, 1);

    const seen = await call(`/profiles/${users[0]}`, { actor: 1 });
    assert.equal(seen.contacts.telegramId, '@synthetic_band');
    assert.equal(seen.links.length, 3);
    assert.equal(seen.projects.length, 3);
    assert.equal(seen.contactVisibility, undefined);
    assert.equal(seen.publicDisplay, undefined);
    assert.equal((await call(`/profiles/${users[0]}`, { actor: null })).contacts, null);

    await call('/profiles/me', { method: 'PUT', body: { contactVisibility: 'following' } });
    assert.equal((await call(`/profiles/${users[0]}`, { actor: 1 })).contacts, null);
    await call(`/profiles/${users[1]}/follow`, { method: 'POST' });
    assert.equal((await call(`/profiles/${users[0]}`, { actor: 1 })).contacts.phone, '+39 02 555 0100');
    assert.equal((await call(`/profiles/${users[0]}`, { actor: 2 })).contacts, null);
    await call('/profiles/me', { method: 'PUT', body: { contactVisibility: 'hidden' } });
    assert.equal((await call(`/profiles/${users[0]}`, { actor: 1 })).contacts, null);
    assert.equal((await call('/profiles/me')).contacts.signal, 'synthetic.01');

    for (const body of [{ telegramId: 'x' }, { links: [{ linkType: 'spotify', url: 'ftp://example.test' }] },
      { links: [{ linkType: 'myspace', url: 'https://example.test' }] }, { contactVisibility: 'public' }, { contactVisibility: '' },
      { placeId: 'milan' }, { age: 9 }]) {
      await call('/profiles/me', { method: 'PUT', body, status: 400 });
    }
    assert.equal((await call('/profiles/me', { method: 'PUT', body: { placeId: 2147483000 }, status: 400 })).code, 'PLACE_NOT_FOUND');

    await premium(0);
    const upgraded = await call(`/profiles/${users[0]}`, { actor: 1 });
    assert.equal(upgraded.links.length, 5);
    assert.equal(upgraded.projects.length, 4);

    await call('/profiles/me', { actor: 3, method: 'PUT', body: { placeId: milan.id } });
    const manual = await call('/profiles/me', { actor: 3, method: 'PUT', body: { city: 'Synthetic manual town' } });
    assert.deepEqual([manual.place, manual.city], [null, 'Synthetic manual town']);
    await call('/profiles/me', { actor: 3, method: 'PUT', body: { placeId: milan.id } });
    const cleared = await call('/profiles/me', { actor: 3, method: 'PUT', body: { placeId: null, city: 'Synthetic legacy town' } });
    assert.equal(cleared.place, null);
    assert.equal(cleared.city, 'Synthetic legacy town');
    assert.equal(cleared.location, null);
    await call('/profiles/me', { actor: 3, method: 'PUT', body: { links: [] } });
  });

  await t.test('musicians are found by place, distance, region and open-to status', async () => {
    await call('/profiles/me', { actor: 1, method: 'PUT', body: { placeId: hague.id } });
    await call('/profiles/me', { actor: 2, method: 'PUT', body: { placeId: monza.id } });
    const search = async query => (await call(`/profiles/search?searchTerm=${marker}&${query}`, { actor: 3 })).profiles;
    const near = await search(`placeId=${milan.id}&radiusKm=50&sort=distance`);
    assert.deepEqual(near.map(item => item.userId), [users[0], users[2]]);
    assert.equal(near[0].distanceKm, 0);
    assert.ok(near[1].distanceKm > 5 && near[1].distanceKm < 30);
    assert.equal(near[1].place.name, monza.name);
    assert.deepEqual((await search(`latitude=${monza.latitude}&longitude=${monza.longitude}&radiusKm=5`)).map(item => item.userId), [users[2]]);
    assert.deepEqual((await search('country=NL')).map(item => item.userId), [users[1]]);
    assert.deepEqual((await search('country=IT&region=09&sort=name')).map(item => item.userId), [users[0], users[2]]);
    await call(`/profiles/search?sort=distance`, { status: 400 });
    await call(`/profiles/search?radiusKm=10`, { status: 400 });
    await call(`/profiles/search?region=09`, { status: 400 });

    assert.deepEqual(await search('openToProjects=true'), []);
    await call('/profiles/me', { actor: 1, method: 'PUT', body: { openToProjects: true } });
    const post = await announcement(2, { placeId: monza.id });
    assert.deepEqual((await search('openToProjects=true&sort=name')).map(item => item.userId), [users[1], users[2]]);
    const own = await call('/profiles/me', { actor: 2 });
    assert.deepEqual([own.openToProjects, own.openToProjectsManual, own.hasActiveAnnouncement], [true, false, true]);
    await call(`/announcements/${post.id}`, { actor: 2, method: 'PUT', body: { isPublished: false } });
    assert.equal((await call(`/profiles/${users[2]}`, { actor: 1 })).openToProjects, false);
  });

  await t.test('announcements take a place, plan-limited expiry and the active cap', async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const created = await announcement(2, { placeId: milan.id, isCoverBand: true });
    assert.equal(created.place.id, milan.id);
    assert.equal(created.location.city, 'Milan');
    assert.equal(created.location.coordinates.latitude, milan.latitude);
    const days = (new Date(created.expiresAt) - Date.now()) / 86400000;
    assert.ok(days > 29 && days < 32, `default expiry ${created.expiresAt}`);
    assert.equal((await call('/announcements', { actor: 2, method: 'POST', status: 403, body: {
      title: `${marker} too long`, description: 'A synthetic collaboration opportunity for discovery tests.',
      expiresAt: new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10),
    } })).code, 'EXPIRY_BEYOND_PLAN');
    for (const [expiresAt, status, code] of [['2001-01-01', 400, 'EXPIRY_IN_PAST'], [null, 403, 'EXPIRY_REQUIRED'], ['soon', 400, 'VALIDATION_ERROR']]) {
      assert.equal((await call('/announcements', { actor: 2, method: 'POST', status, body: {
        title: `${marker} invalid`, description: 'A synthetic collaboration opportunity for discovery tests.', expiresAt,
      } })).code, code);
    }
    const manual = await announcement(2, { expiresAt: tomorrow });
    assert.equal(manual.expiresAt.slice(0, 10) <= tomorrow, true);
    for (let i = 0; i < 3; i += 1) await announcement(2);
    const quotas = await call('/quotas', { actor: 2 });
    assert.deepEqual(quotas.activeAnnouncements, { used: 5, limit: 5, remaining: 0 });
    assert.equal(quotas.announcementExpiryDays, 30);
    assert.equal((await call('/announcements', { actor: 2, method: 'POST', status: 403, body: {
      title: `${marker} sixth`, description: 'A synthetic collaboration opportunity for discovery tests.',
    } })).code, 'PLAN_LIMIT_REACHED');
    const draft = await announcement(2, { isPublished: false });
    assert.equal(draft.isPublished, false);
    await call(`/announcements/${draft.id}`, { actor: 2, method: 'PUT', body: { isPublished: true }, status: 403 });
    await call(`/announcements/${manual.id}`, { actor: 2, method: 'PUT', body: { isPublished: false } });
    const published = await call(`/announcements/${draft.id}`, { actor: 2, method: 'PUT', body: { isPublished: true } });
    assert.ok(published.expiresAt);
    await call(`/announcements/${manual.id}`, { actor: 2, method: 'PUT', body: { title: `${marker} draft edit` } });

    const open = await announcement(0);
    assert.equal(open.expiresAt, null);
    const later = new Date(Date.now() + 400 * 86400000).toISOString().slice(0, 10);
    assert.equal((await call(`/announcements/${open.id}`, { method: 'PUT', body: { expiresAt: later } })).expiresAt.slice(0, 4), later.slice(0, 4));
    await call(`/announcements/${open.id}`, { method: 'PUT', body: { expiresAt: null } });

    const cover = (await call(`/announcements/search?searchTerm=${marker}&isCoverBand=true&placeId=${milan.id}&radiusKm=20&sort=distance`, { actor: 1 })).announcements;
    assert.deepEqual(cover.map(item => item.id), [created.id]);
    assert.equal(cover[0].distanceKm, 0);
    assert.ok((await call(`/announcements/search?searchTerm=${marker}&country=IT&region=09&sort=expiring`, { actor: 1 })).announcements.length >= 1);
  });

  await t.test('saved announcements stop at the plan cap and saving again is idempotent', async () => {
    const { rows } = await realmConnector.execute(`
      INSERT INTO announcements (user_id, title, description)
      SELECT $1, $2 || ' saved ' || n, 'A synthetic collaboration opportunity for discovery tests.' FROM generate_series(1, 11) n
      RETURNING id`, [users[0], marker]);
    for (const row of rows.slice(0, 10)) await call(`/announcements/${row.id}/save`, { actor: 3, method: 'POST' });
    assert.equal((await call(`/announcements/${rows[10].id}/save`, { actor: 3, method: 'POST', status: 403 })).code, 'PLAN_LIMIT_REACHED');
    await call(`/announcements/${rows[0].id}/save`, { actor: 3, method: 'POST' });
    assert.deepEqual((await call('/quotas', { actor: 3 })).savedAnnouncements, { used: 10, limit: 10, remaining: 0 });
    await call(`/announcements/${rows[0].id}/save`, { actor: 3, method: 'DELETE' });
    await call(`/announcements/${rows[10].id}/save`, { actor: 3, method: 'POST' });
  });

  await t.test('reaction counts and statistics are visible only to the owner', async () => {
    const post = await announcement(0, { title: `${marker} reactions` });
    await call(`/announcements/${post.id}/react`, { actor: 1, method: 'POST', body: { reactionType: 'like' } });
    await call(`/announcements/${post.id}/react`, { actor: 2, method: 'POST', body: { reactionType: 'dislike' } });
    const visitor = await call(`/announcements/${post.id}`, { actor: 1 });
    assert.equal(visitor.stats, null);
    assert.equal(visitor.myReaction, 'like');
    assert.equal((await call(`/announcements/${post.id}`, { actor: null })).stats, null);
    const card = (await call(`/announcements/search?searchTerm=${encodeURIComponent(`${marker} reactions`)}`, { actor: 1 })).announcements[0];
    assert.equal(card.stats, null);
    assert.equal(JSON.stringify(card).includes('likes'), false);
    const owner = await call(`/announcements/${post.id}`);
    assert.deepEqual([owner.stats.likes, owner.stats.dislikes, owner.statsLocked], [1, 1, false]);
    assert.equal(typeof owner.stats.views, 'number');
    const liked = await announcement(0, { title: `${marker} reactions liked` });
    await call(`/announcements/${liked.id}/react`, { actor: 1, method: 'POST', body: { reactionType: 'like' } });
    const ranked = (await call(`/announcements/search?searchTerm=${encodeURIComponent(`${marker} reactions`)}&sort=popular`, { actor: 3 })).announcements;
    assert.deepEqual(ranked.map(item => item.id), [liked.id, post.id]);
    const freeOwner = await call('/announcements/me', { actor: 2 });
    assert.deepEqual(Object.keys(freeOwner.announcements[0].stats).sort(), ['dislikes', 'likes']);
    const freeDetail = await call(`/announcements/${freeOwner.announcements[0].id}`, { actor: 2 });
    assert.equal(freeDetail.statsLocked, true);
    assert.equal((await call('/analytics', { actor: 2, status: 403 })).code, 'PLAN_LIMIT_REACHED');
    assert.ok(Array.isArray((await call('/analytics')).daily));
  });

  await t.test('saved searches are capped, normalized and notify matching publications once', async () => {
    assert.equal((await call('/saved-searches', { actor: 1, method: 'POST', status: 400, body: { name: 'Empty', filters: {} } })).code, 'EMPTY_SEARCH');
    const search = await call('/saved-searches', { actor: 1, method: 'POST', status: 201, body: {
      name: 'Cover bands near Milan', filters: { instrumentId: instrument, isCoverBand: true, placeId: milan.id, radiusKm: 50, searchTerm: marker },
    } });
    assert.equal(search.filters.placeLabel, milan.label);
    assert.equal(search.notify, true);
    assert.equal((await call('/saved-searches', { actor: 1, method: 'POST', status: 403, body: { name: 'Second', filters: { city: 'x' } } })).code, 'PLAN_LIMIT_REACHED');
    assert.equal((await call('/saved-searches', { actor: 1 })).searches.length, 1);
    assert.equal((await call(`/saved-searches/${search.id}`, { actor: 1, method: 'PATCH', body: { notify: false } })).notify, false);
    await call(`/saved-searches/${search.id}`, { actor: 2, method: 'PATCH', body: { notify: true }, status: 404 });
    await call(`/saved-searches/${search.id}`, { actor: 1, method: 'PATCH', body: { notify: true, name: 'Covers near Milan' } });

    await premium(3);
    const nearMe = await call('/saved-searches', { actor: 3, method: 'POST', status: 201, body: {
      name: 'Near me', filters: { latitude: 45.47, longitude: 9.2, radiusKm: 50, isCoverBand: true },
    } });
    assert.deepEqual([nearMe.filters.placeId, nearMe.filters.latitude], [milan.id, milan.latitude]);
    await call('/saved-searches', { method: 'POST', status: 201, body: { name: 'Own', filters: { isCoverBand: true } } });

    const before = (await notifications(1, 'saved_search_match')).length;
    await announcement(0, { title: `${marker} not a cover band`, instrumentIds: [instrument], placeId: monza.id });
    assert.equal((await notifications(1, 'saved_search_match')).length, before);
    const draft = await announcement(0, {
      title: `${marker} cover band in Monza`, instrumentIds: [instrument], placeId: monza.id, isCoverBand: true, isPublished: false,
    });
    assert.equal((await notifications(1, 'saved_search_match')).length, before);
    await call(`/profiles/${users[3]}/block`, { method: 'POST' });
    await call(`/announcements/${draft.id}`, { method: 'PUT', body: { isPublished: true } });
    const matched = await notifications(1, 'saved_search_match');
    assert.equal(matched.length, before + 1);
    assert.deepEqual(matched[0].params, { announcementId: draft.id, title: `${marker} cover band in Monza` });
    assert.equal(matched[0].link, `#announcement?id=${draft.id}`);
    assert.equal((await notifications(0, 'saved_search_match')).length, 0, 'authors are never notified');
    assert.equal((await notifications(3, 'saved_search_match')).length, 0, 'blocked members are never notified');
    await call(`/announcements/${draft.id}`, { method: 'PUT', body: { isPublished: false } });
    await call(`/announcements/${draft.id}`, { method: 'PUT', body: { isPublished: true } });
    assert.equal((await notifications(1, 'saved_search_match')).length, before + 1);
    await call(`/profiles/${users[3]}/block`, { method: 'DELETE' });
    await call(`/saved-searches/${search.id}`, { actor: 1, method: 'DELETE' });
    await call(`/saved-searches/${search.id}`, { actor: 1, method: 'DELETE', status: 404 });
  });

  await t.test('follows notify once and count; blocks hide profiles and announcements both ways', async () => {
    await call(`/profiles/${users[2]}/follow`, { actor: 1, method: 'POST' });
    await call(`/profiles/${users[2]}/follow`, { actor: 1, method: 'DELETE' });
    await call(`/profiles/${users[2]}/follow`, { actor: 1, method: 'POST' });
    const followed = await notifications(2, 'new_follower');
    assert.equal(followed.length, 1);
    assert.equal(followed[0].params.followerId, users[1]);
    assert.equal((await call(`/profiles/${users[2]}`, { actor: 3 })).followersCount, 1);
    assert.ok((await call(`/profiles/${users[1]}`, { actor: 3 })).followingCount >= 1);

    const post = await announcement(0, { title: `${marker} hidden from blocked` });
    await call(`/profiles/${users[1]}/block`, { actor: 2, method: 'POST' });
    await call(`/profiles/${users[1]}/block`, { actor: 2, method: 'POST' });
    assert.equal((await call(`/profiles/${users[2]}`, { actor: 3 })).followersCount, 0);
    await call(`/profiles/${users[2]}`, { actor: 1, status: 404 });
    assert.equal((await call(`/profiles/${users[1]}`, { actor: 2 })).isBlocked, true);
    const visible = async (actor, path) => (await call(`/profiles/search?searchTerm=${marker}&pageSize=50`, { actor })).profiles.map(p => p.userId).includes(path);
    assert.equal(await visible(1, users[2]), false);
    assert.equal(await visible(2, users[1]), false);
    assert.equal(await visible(3, users[2]), true);
    await call(`/profiles/${users[2]}/follow`, { actor: 1, method: 'POST', status: 404 });
    assert.deepEqual((await call('/blocks', { actor: 2 })).blocked.map(item => item.userId), [users[1]]);
    await call(`/profiles/${users[2]}/block`, { actor: 2, method: 'POST', status: 400 });

    await call(`/profiles/${users[1]}/block`, { method: 'POST' });
    await call(`/announcements/${post.id}`, { actor: 1, status: 404 });
    await call(`/announcements/${post.id}/comments`, { actor: 1, method: 'POST', body: { body: 'Synthetic' }, status: 404 });
    const feed = (await call(`/announcements/search?searchTerm=${encodeURIComponent(`${marker} hidden`)}`, { actor: 1 })).announcements;
    assert.equal(feed.length, 0);
    assert.equal((await call('/conversations', { actor: 1, method: 'POST', body: { recipientUserId: users[0] }, status: 403 })).code, 'MESSAGING_UNAVAILABLE');
    await call(`/profiles/${users[1]}/block`, { method: 'DELETE' });
    assert.equal((await call(`/announcements/search?searchTerm=${encodeURIComponent(`${marker} hidden`)}`, { actor: 1 })).announcements.length, 1);
    await call(`/profiles/${users[1]}/block`, { actor: 2, method: 'DELETE' });
    assert.deepEqual((await call('/blocks', { actor: 2 })).blocked, []);
  });

  await t.test('reports accept inappropriate language and fake profile categories', async () => {
    for (const [target, category] of [[3, 'inappropriate_language'], [2, 'fake_profile']]) {
      await call('/reports', { actor: 1, method: 'POST', status: 201, body: {
        reportedUserId: users[target], category, details: 'Synthetic concern for category coverage.', consent: true,
      } });
    }
    const { rows } = await realmConnector.execute('SELECT category FROM user_reports WHERE reporter_id = $1 ORDER BY category', [users[1]]);
    assert.deepEqual(rows.map(row => row.category), ['fake_profile', 'inappropriate_language']);
    await call('/reports', { actor: 1, method: 'POST', status: 400, body: {
      reportedUserId: users[3], category: 'impersonation', details: 'Synthetic concern.', consent: true,
    } });
  });

  await t.test('profile visits need visitor consent, skip self-views and require the owner plan', async () => {
    const visitors = async () => (await call('/profile-visits')).visits.map(item => item.userId);
    await call(`/profiles/${users[0]}`, { actor: 1 });
    assert.deepEqual(await visitors(), []);
    assert.equal((await call('/profile-visits/sharing', { actor: 1 })).share, false);
    await call('/profile-visits/sharing', { actor: 1, method: 'PUT', body: { share: true } });
    await call(`/profiles/${users[0]}`, { actor: 1 });
    await call(`/profiles/${users[0]}`, { actor: 1 });
    await call(`/profiles/${users[0]}`);
    const list = (await call('/profile-visits')).visits;
    assert.deepEqual(list.map(item => [item.userId, item.days]), [[users[1], 1]]);
    assert.equal((await call('/profile-visits', { actor: 2, status: 403 })).code, 'PLAN_LIMIT_REACHED');
    await call('/profile-visits/sharing', { actor: 1, method: 'PUT', body: { share: false } });
    assert.deepEqual(await visitors(), []);
    await call('/profile-visits/sharing', { actor: 1, method: 'PUT', body: { share: true } });
    await realmConnector.execute("INSERT INTO profile_visits (owner_id, visitor_id, day) VALUES ($1, $2, CURRENT_DATE - 40)", [users[0], users[1]]);
    await new PushDispatcher({ config: {}, connector: realmConnector, logger: { error() {}, warn() {} } }).maintain();
    const { rows } = await realmConnector.execute('SELECT day FROM profile_visits WHERE owner_id = $1', [users[0]]);
    assert.equal(rows.length, 0);
  });
});
