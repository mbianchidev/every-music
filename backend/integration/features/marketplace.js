import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { MarketplaceExpiryJob } from '../../src/engines/marketplace-expiry-job.js';
import { PushDispatcher } from '../../src/engines/push-dispatcher.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

test('marketplace: listings, discovery, saving, reports, moderation, and expiry reminders', async (t) => {
  const marker = `market-${randomUUID()}`;
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
  for (let i = 0; i < 4; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await realmConnector.execute(
      'INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email, i === 3 ? 'admin' : 'member'],
    );
    users.push(rows[0].id);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} seller ${i}`]);
  }
  async function call(path, { actor = 0, method = 'GET', body, status = 200 } = {}) {
    const response = await app.inject({
      method, url: `/realm${path}`, headers: actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` }, payload: body,
    });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.headers['content-type']?.startsWith('application/json') ? response.json().data ?? response.json() : response;
  }
  const png = (await sharp({ create: { width: 40, height: 30, channels: 3, background: '#4f8a6b' } }).png().toBuffer()).toString('base64');
  const upload = (actor, purpose = 'listing') => call('/media', { actor, method: 'POST', status: 201, body: { data: png, mimeType: 'image/png', purpose } });
  const instruments = (await realmConnector.execute("SELECT id FROM instruments WHERE name IN ('Electric Guitar', 'Drums') ORDER BY name")).rows;
  const genre = (await realmConnector.execute("SELECT id FROM genres WHERE name = 'Rock'")).rows[0];
  const sale = (extra = {}) => ({
    type: 'sell', category: 'guitars', subcategory: 'electric_guitar', title: `${marker} vintage guitar`,
    description: 'A synthetic electric guitar in good shape for testing.', condition: 'used',
    priceMode: 'fixed', priceMinor: 45000, currency: 'EUR', locationText: `${marker} Amsterdam`, shipping: true, ...extra,
  });
  const search = query => call(`/marketplace/listings?${new URLSearchParams({ q: marker, pageSize: '20', ...query })}`, { actor: 1 });
  let guitar;
  let photo;

  await t.test('the catalog is public and describes every tab', async () => {
    const catalog = await call('/marketplace/catalog', { actor: null });
    assert.deepEqual(catalog.tabs.map(tab => tab.id), ['gear', 'lessons', 'services', 'endorsements']);
    assert.ok(catalog.tabs.find(tab => tab.id === 'services').categories.some(category => category.id === 'tour_manager'));
    assert.equal(catalog.listingDays, realmConfig.marketplace.listingDays);
    assert.ok(catalog.currencies.includes('EUR'));
  });

  await t.test('sellers create listings with owned listing photos and catalog tags', async () => {
    photo = await upload(0);
    const foreign = await upload(1);
    const wrongPurpose = await upload(0, 'announcement');
    await call('/marketplace/listings', { method: 'POST', status: 400, body: sale({ photos: [foreign.url] }) });
    await call('/marketplace/listings', { method: 'POST', status: 400, body: sale({ photos: [wrongPurpose.url] }) });
    await call('/marketplace/listings', { method: 'POST', status: 400, body: sale({ condition: null }) });
    await call('/marketplace/listings', { method: 'POST', status: 400, body: sale({ instrumentIds: [randomUUID()] }) });
    await call('/marketplace/listings', { method: 'POST', status: 400, body: sale({ unknown: true }) });
    guitar = await call('/marketplace/listings', {
      method: 'POST', status: 201,
      body: sale({ photos: [photo.url], instrumentIds: [instruments[1].id], genreIds: [genre.id] }),
    });
    assert.equal(guitar.priceMinor, 45000);
    assert.deepEqual(guitar.photos, [photo.url]);
    assert.equal(guitar.instruments[0].id, instruments[1].id);
    assert.equal(guitar.status, 'active');
    assert.equal(guitar.isOwner, true);
    const days = (new Date(guitar.expiresAt) - Date.now()) / 86400000;
    assert.ok(Math.abs(days - realmConfig.marketplace.listingDays) < 0.01, `expiry ${days}`);
    const anonymous = await call(`/marketplace/listings/${guitar.id}`, { actor: null });
    assert.equal(anonymous.isOwner, false);
    assert.equal(anonymous.seller.artistName, `${marker} seller 0`);
    assert.equal((await call(`/media/${photo.id}`, { actor: null })).statusCode, 200);
    await call(`/media/${foreign.id}`, { actor: null, status: 404 });
  });

  await t.test('search filters, sorts, and pages listings across tabs', async () => {
    await call('/marketplace/listings', {
      method: 'POST', status: 201,
      body: sale({ title: `${marker} amp`, category: 'amplifiers', subcategory: 'guitar_amp', condition: 'new', priceMinor: 9000, shipping: false, locationText: `${marker} Rome` }),
    });
    await call('/marketplace/listings', {
      actor: 1, method: 'POST', status: 201,
      body: {
        type: 'lesson', category: 'instrument_lessons', subcategory: 'guitar', title: `${marker} guitar lessons`,
        description: 'Synthetic online guitar lessons for beginners.', priceMode: 'fixed', priceMinor: 3500, currency: 'EUR',
        rateUnit: 'hour', remote: true,
      },
    });
    await call('/marketplace/listings', {
      actor: 2, method: 'POST', status: 201,
      body: {
        type: 'service_offer', category: 'tour_manager', title: `${marker} tour manager`, description: 'Synthetic tour management for small bands.',
        priceMode: 'contact', locationText: `${marker} Utrecht`,
      },
    });
    await call('/marketplace/listings', {
      actor: 2, method: 'POST', status: 201,
      body: { type: 'wanted', category: 'keyboards', title: `${marker} wanted synth`, description: 'Looking for a synthetic synthesizer.', priceMode: 'negotiable' },
    });
    assert.equal((await search({})).listings.length, 5);
    assert.deepEqual((await search({ tab: 'gear', sort: 'price_asc' })).listings.map(item => item.priceMinor), [9000, 45000, null]);
    assert.deepEqual((await search({ tab: 'gear', sort: 'price_desc', type: 'sell' })).listings.map(item => item.priceMinor), [45000, 9000]);
    assert.equal((await search({ tab: 'lessons' })).listings[0].rateUnit, 'hour');
    assert.equal((await search({ tab: 'services', category: 'tour_manager' })).listings.length, 1);
    assert.equal((await search({ condition: 'new' })).listings[0].title, `${marker} amp`);
    assert.equal((await search({ currency: 'EUR', priceMin: '5000', priceMax: '10000' })).listings[0].title, `${marker} amp`);
    assert.equal((await search({ remote: 'true' })).listings[0].type, 'lesson');
    assert.equal((await search({ shipping: 'true' })).listings[0].id, guitar.id);
    assert.equal((await search({ location: 'utrecht' })).listings[0].type, 'service_offer');
    assert.equal((await search({ instrumentId: instruments[1].id })).listings[0].id, guitar.id);
    assert.equal((await search({ genreId: genre.id, subcategory: 'electric_guitar' })).listings[0].id, guitar.id);
    assert.deepEqual((await search({ sort: 'title' })).listings.map(item => item.title),
      [`${marker} amp`, `${marker} guitar lessons`, `${marker} tour manager`, `${marker} vintage guitar`, `${marker} wanted synth`]);
    const first = await search({ pageSize: '2', page: '1' });
    const second = await search({ pageSize: '2', page: '2' });
    assert.equal(first.pagination.hasMore, true);
    assert.equal(second.listings.length, 2);
    assert.ok(!second.listings.some(item => first.listings.some(other => other.id === item.id)));
    await call(`/marketplace/listings?priceMin=100`, { status: 400 });
    await call(`/marketplace/listings?tab=lessons&type=sell`, { status: 400 });
    await call(`/marketplace/listings?sort=random`, { status: 400 });
    assert.equal((await search({ q: `${marker}%` })).listings.length, 0, 'wildcards are literal');
  });

  await t.test('owners edit, reserve, sell, reopen, renew, and delete their listings', async () => {
    await call(`/marketplace/listings/${guitar.id}`, { actor: 1, method: 'PATCH', status: 404, body: { title: 'Not mine' } });
    const edited = await call(`/marketplace/listings/${guitar.id}`, {
      method: 'PATCH', body: { priceMode: 'negotiable', priceMinor: 40000, subcategory: null, instrumentIds: [] },
    });
    assert.deepEqual([edited.priceMode, edited.priceMinor, edited.subcategory, edited.instruments, edited.photos],
      ['negotiable', 40000, null, [], [photo.url]]);
    await call(`/marketplace/listings/${guitar.id}`, { method: 'PATCH', status: 400, body: { type: 'lesson' } });
    await call(`/marketplace/listings/${guitar.id}`, { method: 'PATCH', status: 400, body: {} });
    assert.equal((await call(`/marketplace/listings/${guitar.id}`, { method: 'PATCH', body: { status: 'reserved' } })).status, 'reserved');
    assert.ok((await search({ type: 'sell' })).listings.some(item => item.id === guitar.id));
    await call(`/marketplace/listings/${guitar.id}`, { method: 'PATCH', body: { status: 'sold' } });
    assert.ok(!(await search({ type: 'sell' })).listings.some(item => item.id === guitar.id));
    assert.equal((await call(`/marketplace/listings/${guitar.id}`, { actor: 1 })).status, 'sold');
    await call(`/marketplace/listings/${guitar.id}/renew`, { method: 'POST', status: 409 });
    await call(`/marketplace/listings/${guitar.id}`, { method: 'PATCH', body: { status: 'active' } });
    await realmConnector.execute("UPDATE marketplace_listings SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [guitar.id]);
    await call(`/marketplace/listings/${guitar.id}`, { actor: 1, status: 404 });
    await call(`/media/${photo.id}`, { actor: null, status: 404 });
    assert.equal((await call('/marketplace/listings/mine')).listings.find(item => item.id === guitar.id).expired, true);
    const renewed = await call(`/marketplace/listings/${guitar.id}/renew`, { method: 'POST' });
    assert.equal(renewed.expired, false);
    assert.equal((await call(`/media/${photo.id}`, { actor: null })).statusCode, 200);
    const draft = await call('/marketplace/listings', {
      method: 'POST', status: 201,
      body: { type: 'endorsement', category: 'sponsorship', subcategory: 'audio', title: `${marker} sponsor`, description: 'Synthetic audio brand sponsorship.', priceMode: 'contact' },
    });
    await call(`/marketplace/listings/${draft.id}`, { actor: 1, method: 'DELETE', status: 404 });
    await call(`/marketplace/listings/${draft.id}`, { method: 'DELETE' });
    await call(`/marketplace/listings/${draft.id}`, { status: 404 });
  });

  await t.test('buyers save listings and contact the seller', async () => {
    await call(`/marketplace/listings/${guitar.id}/save`, { actor: 1, method: 'POST' });
    await call(`/marketplace/listings/${guitar.id}/save`, { actor: 1, method: 'POST' });
    assert.equal((await call(`/marketplace/listings/${guitar.id}`, { actor: 1 })).isSaved, true);
    assert.deepEqual((await call('/marketplace/listings/saved', { actor: 1 })).listings.map(item => item.id), [guitar.id]);
    await call(`/marketplace/listings/${randomUUID()}/save`, { actor: 1, method: 'POST', status: 404 });
    const conversation = await call('/conversations', { actor: 1, method: 'POST', status: 201, body: { recipientUserId: guitar.seller.userId } });
    assert.ok(conversation.id);
  });

  await t.test('listing reports reach moderators, who remove listings with an audit record', async () => {
    const report = { category: 'spam', details: 'Synthetic concern about this listing.', consent: true };
    await call(`/marketplace/listings/${guitar.id}/reports`, { method: 'POST', status: 400, body: report });
    await call(`/marketplace/listings/${guitar.id}/reports`, { actor: 1, method: 'POST', status: 400, body: { ...report, consent: false } });
    const created = await call(`/marketplace/listings/${guitar.id}/reports`, { actor: 1, method: 'POST', status: 201, body: report });
    await call(`/marketplace/listings/${guitar.id}/reports`, { actor: 1, method: 'POST', status: 409, body: report });
    await call(`/marketplace/listings/${guitar.id}/reports`, { actor: 2, method: 'POST', status: 201, body: { ...report, category: 'other' } });
    assert.ok((await call('/reports/me', { actor: 1 })).reports.some(item => item.id === created.id));
    await call('/admin/marketplace/reports?status=open', { actor: 1, status: 403 });
    const queue = await call('/admin/marketplace/reports?status=open', { actor: 3 });
    const queued = queue.reports.filter(item => item.listingId === guitar.id);
    assert.equal(queued.length, 2);
    assert.equal(queued[0].listingTitle, `${marker} vintage guitar`);
    assert.equal(queued[0].details, undefined, 'details are only disclosed through the audited report view');
    await call(`/admin/marketplace/listings/${guitar.id}`, { actor: 1, method: 'DELETE', status: 403, body: { note: 'Not an admin' } });
    await call(`/admin/marketplace/listings/${guitar.id}`, { actor: 3, method: 'DELETE', status: 400, body: { note: '    x   ' } });
    const removal = await call(`/admin/marketplace/listings/${guitar.id}`, { actor: 3, method: 'DELETE', body: { note: 'Synthetic listing removed after review.' } });
    assert.deepEqual([removal.removed, removal.resolvedReports], [true, 2]);
    await call(`/admin/marketplace/listings/${guitar.id}`, { actor: 3, method: 'DELETE', status: 409, body: { note: 'Synthetic second removal.' } });
    const { rows: audit } = await realmConnector.execute('SELECT action, target_id, report_id FROM admin_audit WHERE actor_id = $1', [users[3]]);
    assert.deepEqual(audit.map(row => [row.action, row.target_id]), [['listing_removed', guitar.id]]);
    assert.ok(audit[0].report_id);
    assert.equal((await call('/reports/me', { actor: 1 })).reports.find(item => item.id === created.id).status, 'actioned');
    assert.ok((await call('/notifications', { actor: 1 })).notifications.some(item => item.kind === 'report_reviewed'));
    const ownerNotice = (await call('/notifications')).notifications.find(item => item.kind === 'listing_removed');
    assert.equal(ownerNotice.params.listingId, guitar.id);
    await call(`/marketplace/listings/${guitar.id}`, { actor: 1, status: 404 });
    assert.equal((await call(`/marketplace/listings/${guitar.id}`, { actor: 3 })).moderationNote, 'Synthetic listing removed after review.');
    const own = await call(`/marketplace/listings/${guitar.id}`);
    assert.deepEqual([own.removedByModeration, own.moderationNote], [true, undefined]);
    await call(`/marketplace/listings/${guitar.id}`, { method: 'PATCH', status: 409, body: { title: 'Back again' } });
    await call(`/marketplace/listings/${guitar.id}`, { method: 'DELETE', status: 409 });
    assert.equal((await call('/marketplace/listings/saved', { actor: 1 })).listings.length, 0);
    await call(`/media/${photo.id}`, { actor: null, status: 404 });
    assert.equal((await call(`/media/${photo.id}`)).statusCode, 200, 'uploaders keep access to their own media');
  });

  await t.test('photos survive media maintenance while attached', async () => {
    await realmConnector.execute("UPDATE media SET created_at = NOW() - INTERVAL '2 days' WHERE id = $1", [photo.id]);
    await new PushDispatcher({ config: {}, connector: realmConnector, logger: { error() {}, warn() {} } }).maintain();
    assert.equal((await realmConnector.execute('SELECT 1 FROM media WHERE id = $1', [photo.id])).rowCount, 1);
  });

  await t.test('the expiry job sends one localized reminder per expiry and renewal re-arms it', async () => {
    const lesson = (await search({ tab: 'lessons' })).listings[0];
    await realmConnector.execute("UPDATE marketplace_listings SET expires_at = NOW() + INTERVAL '1 day' WHERE id = $1", [lesson.id]);
    const job = new MarketplaceExpiryJob({ config: realmConfig.marketplace, connector: realmConnector, logger: { error() {} } });
    assert.ok((await job.runOnce()).notified >= 1);
    await job.runOnce();
    const reminders = (await call('/notifications', { actor: 1 })).notifications.filter(item => item.kind === 'listing_expiring');
    assert.equal(reminders.length, 1);
    assert.deepEqual([reminders[0].params.listingId, reminders[0].params.title, reminders[0].link],
      [lesson.id, `${marker} guitar lessons`, `#listing?id=${lesson.id}`]);
    await call(`/marketplace/listings/${lesson.id}/renew`, { actor: 1, method: 'POST' });
    await realmConnector.execute("UPDATE marketplace_listings SET expires_at = NOW() + INTERVAL '2 days' WHERE id = $1", [lesson.id]);
    await job.runOnce();
    assert.equal((await call('/notifications', { actor: 1 })).notifications.filter(item => item.kind === 'listing_expiring').length, 2);
  });

  await t.test('open listings are capped per account', async () => {
    await realmConnector.execute(`
      INSERT INTO marketplace_listings (user_id, listing_type, category, title, description, price_mode, expires_at)
      SELECT $1, 'wanted', 'dj', 'Synthetic filler ' || n, 'Synthetic filler listing.', 'contact', NOW() + INTERVAL '1 day'
      FROM generate_series(1, 50) n`, [users[2]]);
    const response = await app.inject({
      method: 'POST', url: '/realm/marketplace/listings', headers: { authorization: `Bearer ${tokens[2]}` },
      payload: { type: 'wanted', category: 'dj', title: 'One too many', description: 'Synthetic over-limit listing.', priceMode: 'contact' },
    });
    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error.code, 'LISTING_LIMIT_REACHED');
  });
});
