import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { MonetizationJobs } from '../../src/engines/monetization-jobs.js';
import { PaymentGateway } from '../../src/engines/payment-gateway.js';
import { accountRepository } from '../../src/repositories/account-repository.js';
import { syntheticStripeClient, signedStripeEvent } from '../synthetic-stripe.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

const WEBHOOK_SECRET = 'whsec_syntheticIntegrationSecret';
const PREMIUM_PRICE = 'price_syntheticPremium';
const PARTNER_PRICE = 'price_syntheticPartner';

test('monetization: payments, points, promotions, referrals, sponsored cards, rewarded videos and offers', async (t) => {
  const marker = `w7${randomUUID().slice(0, 8)}`;
  const users = [];
  const tokens = [];
  const emails = [];
  const client = syntheticStripeClient({ origin: 'http://localhost:3000' });
  const monetization = {
    ...realmConfig.monetization,
    stripe: {
      ...realmConfig.monetization.stripe,
      secretKey: 'sk_test_syntheticIntegrationKey', webhookSecret: WEBHOOK_SECRET,
      premiumPriceId: PREMIUM_PRICE, partnerPriceId: PARTNER_PRICE,
      packs: [{ id: 'starter', points: 500, priceId: 'price_syntheticStarter', amountMinor: 499 }],
      client,
    },
    points: { ...realmConfig.monetization.points, referralMonthlyCap: 1, rewardedVideoDailyCap: 2, rewardedVideoMinimumSeconds: 15 },
  };
  const config = { ...realmConfig, boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 }, monetization };
  await realmConnector.establish();
  const app = await buildNexus({ config, logger: false, backgroundJobs: false });
  const disabled = await buildNexus({
    config: { ...config, monetization: { ...realmConfig.monetization, stripe: { ...realmConfig.monetization.stripe, secretKey: '', webhookSecret: '' } } },
    logger: false, backgroundJobs: false,
  });
  const jobs = new MonetizationJobs({ config, gateway: new PaymentGateway(monetization.stripe), logger: { error() {} } });
  const cards = [];
  t.after(async () => {
    await app.close();
    await disabled.close();
    await realmConnector.execute('DELETE FROM sponsored_cards WHERE id = ANY($1::uuid[])', [cards]);
    await realmConnector.execute('DELETE FROM offer_broadcasts WHERE actor_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM billing_subscriptions WHERE user_id = ANY($1::uuid[]) OR id LIKE $2', [users, `sub_${marker}%`]);
    await realmConnector.execute('DELETE FROM billing_customers WHERE user_id = ANY($1::uuid[])', [users]);
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });

  const seed = async (label, { role = 'member', createdDaysAgo = 0 } = {}) => {
    const email = `${marker}-${label}@example.test`;
    const { rows } = await realmConnector.execute(`
      INSERT INTO users (email, email_verified, role, created_at) VALUES ($1, TRUE, $2, NOW() - make_interval(days => $3::int)) RETURNING id`,
    [email, role, createdDaysAgo]);
    users.push(rows[0].id);
    emails.push(email);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2)', [rows[0].id, `${marker} ${label}`]);
    return users.length - 1;
  };
  const owner = await seed('owner');
  const fan = await seed('fan');
  const admin = await seed('admin', { role: 'admin' });
  const veteran = await seed('veteran', { createdDaysAgo: 30 });

  async function call(path, { actor = owner, method = 'GET', body, status = 200, target = app, headers = {} } = {}) {
    const response = await target.inject({
      method, url: `/realm${path}`, payload: body,
      headers: { ...(actor === null ? {} : { authorization: `Bearer ${tokens[actor]}` }), ...headers },
    });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.headers['content-type']?.startsWith('application/json') ? response.json().data ?? response.json() : response;
  }
  async function deliver(type, object, options = {}) {
    const event = signedStripeEvent(WEBHOOK_SECRET, type, object, options);
    const response = await app.inject({
      method: 'POST', url: '/realm/billing/webhook', payload: event.payload,
      headers: { 'content-type': 'application/json; charset=utf-8', 'stripe-signature': event.signature },
    });
    assert.equal(response.statusCode, options.status ?? 200, response.body);
    return response.json().data;
  }
  const notifications = async (actor, kind) => (await realmConnector.execute(
    'SELECT kind, params, link FROM notifications WHERE user_id = $1 AND kind = $2 ORDER BY created_at', [users[actor], kind])).rows;
  const plan = async actor => (await call('/entitlements/me', { actor })).plan;
  const balance = async actor => (await call('/points', { actor })).balance;
  const place = async (name, country) => (await realmConnector.execute(
    'SELECT id FROM places WHERE name = $1 AND country_code = $2 ORDER BY population DESC LIMIT 1', [name, country])).rows[0].id;
  const amsterdam = await place('Amsterdam', 'NL');
  const milan = await place('Milan', 'IT');

  await t.test('payments are disabled and reported as unavailable without Stripe keys', async () => {
    const overview = await call('/billing', { target: disabled });
    assert.equal(overview.enabled, false);
    assert.equal(overview.plans.every(item => !item.available), true);
    assert.deepEqual(overview.packs, []);
    assert.equal(overview.plan, 'free');
    assert.equal((await call('/billing/checkout', { target: disabled, method: 'POST', body: { product: 'premium' }, status: 503 })).error.code, 'PAYMENTS_DISABLED');
    const webhook = await disabled.inject({ method: 'POST', url: '/realm/billing/webhook', payload: '{}', headers: { 'content-type': 'application/json' } });
    assert.equal(webhook.statusCode, 503);
    assert.equal((await call('/points', { target: disabled })).balance, 0);
  });

  await t.test('checkout creates one Stripe customer per account and never fulfills from the redirect', async () => {
    const overview = await call('/billing');
    assert.equal(overview.enabled, true);
    assert.deepEqual(overview.packs, [{ id: 'starter', points: 500, amountMinor: 499 }]);
    const first = await call('/billing/checkout', { method: 'POST', body: { product: 'premium' }, status: 201 });
    assert.match(first.url, /^http:\/\/localhost:3000\/synthetic-checkout\/cs_test_/);
    const params = client.calls.checkouts.at(-1);
    assert.equal(params.mode, 'subscription');
    assert.deepEqual(params.line_items, [{ price: PREMIUM_PRICE, quantity: 1 }]);
    assert.equal(params.success_url, 'http://localhost:3000/#store?checkout=success');
    assert.equal(params.subscription_data.metadata.userId, users[owner]);
    await call('/billing/checkout', { method: 'POST', body: { product: 'points', packId: 'starter' }, status: 201 });
    assert.equal(client.calls.customers.length, 1);
    assert.equal(client.calls.customers[0].options.idempotencyKey, `customer-${users[owner]}`);
    assert.equal(client.calls.checkouts.at(-1).mode, 'payment');
    await call('/billing/checkout', { method: 'POST', body: { product: 'points', packId: 'missing' }, status: 404 });
    assert.equal(await plan(owner), 'free');
    assert.equal(await balance(owner), 0);
    const portal = await call('/billing/portal', { method: 'POST', status: 200 });
    assert.equal(portal.url, 'http://localhost:3000/synthetic-portal');
    await call('/billing/portal', { actor: fan, method: 'POST', status: 404 });
  });

  await t.test('webhooks verify the raw-body signature and apply each event once', async () => {
    const bad = await app.inject({
      method: 'POST', url: '/realm/billing/webhook', payload: JSON.stringify({ id: 'evt_x', type: 'ping' }),
      headers: { 'content-type': 'application/json', 'stripe-signature': 't=1,v1=deadbeef' },
    });
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.json().error.code, 'INVALID_SIGNATURE');
    const customer = (await realmConnector.execute('SELECT customer_id FROM billing_customers WHERE user_id = $1', [users[owner]])).rows[0].customer_id;
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
    const subscription = status => ({
      id: `sub_${marker}`, object: 'subscription', customer, status, cancel_at_period_end: false, metadata: { userId: users[owner], plan: 'premium' },
      items: { data: [{ price: { id: PREMIUM_PRICE }, current_period_end: periodEnd }] },
    });
    const created = Math.floor(Date.now() / 1000);
    const eventId = `evt_${marker}_created`;
    assert.equal((await deliver('customer.subscription.created', subscription('active'), { eventId, created })).duplicate, false);
    assert.equal((await deliver('customer.subscription.created', subscription('active'), { eventId, created })).duplicate, true);
    assert.equal(await plan(owner), 'premium');
    assert.equal((await notifications(owner, 'subscription_started')).length, 1);
    const billing = await call('/billing');
    assert.equal(billing.subscription.status, 'active');
    assert.equal(billing.billingAccount, true);
    await deliver('customer.subscription.updated', subscription('canceled'), { created: created - 60 });
    assert.equal(await plan(owner), 'premium', 'an older event cannot override a newer one');
    await call('/billing/checkout', { method: 'POST', body: { product: 'partner' }, status: 409 });
    await deliver('invoice.payment_failed', { id: `in_${marker}`, object: 'invoice', customer, parent: { subscription_details: { subscription: `sub_${marker}` } } });
    assert.deepEqual((await notifications(owner, 'payment_failed')).map(row => row.params), [{ plan: 'premium' }]);
    await deliver('customer.subscription.updated', { ...subscription('active'), items: { data: [{ price: { id: PARTNER_PRICE }, current_period_end: periodEnd }] } },
      { created: created + 1 });
    assert.equal(await plan(owner), 'partner');
    await deliver('customer.subscription.deleted', subscription('canceled'), { created: created + 2 });
    assert.equal(await plan(owner), 'free');
    assert.equal((await notifications(owner, 'subscription_ended')).length, 1);
    await deliver('customer.created', { id: customer, object: 'customer' });
  });

  await t.test('paid points packs are credited once from completed checkout sessions', async () => {
    const session = client.calls.checkouts.findIndex(item => item.mode === 'payment');
    const { rows: [checkout] } = await realmConnector.execute(
      `SELECT id FROM billing_checkout_sessions WHERE user_id = $1 AND product = 'points'`, [users[owner]]);
    assert.ok(session >= 0 && checkout);
    const object = { id: checkout.id, object: 'checkout.session', mode: 'payment', customer: null, payment_status: 'unpaid' };
    await deliver('checkout.session.completed', object);
    assert.equal(await balance(owner), 0, 'unpaid delayed payments are not credited yet');
    await deliver('checkout.session.async_payment_succeeded', { ...object, payment_status: 'paid' });
    await deliver('checkout.session.completed', { ...object, payment_status: 'paid' });
    assert.equal(await balance(owner), 500);
    assert.equal((await notifications(owner, 'points_earned')).length, 1);
    await deliver('checkout.session.completed', { ...object, id: 'cs_test_unknown_session', payment_status: 'paid' });
    const ledger = await call('/points/ledger?page=1&pageSize=5');
    assert.deepEqual(ledger.entries.map(entry => [entry.reason, entry.delta, entry.balanceAfter]), [['purchase', 500, 500]]);
    await assert.rejects(realmConnector.execute('UPDATE points_ledger SET delta = 900 WHERE user_id = $1', [users[owner]]), /append-only/);
  });

  let announcements;
  await t.test('points buy Premium days, boosts and area pins with concurrency-safe balances', async () => {
    const create = async (title, extra = {}) => call('/announcements', {
      method: 'POST', status: 201,
      body: { title: `${marker} ${title}`, description: 'A synthetic call used for monetization integration tests.', ...extra },
    });
    announcements = [await create('pinned call'), await create('boosted one'), await create('boosted two'), await create('boosted three')];
    const nearby = await create('organic Amsterdam call', { placeId: amsterdam });
    const spend = (body, options = {}) => call('/points/spend', { method: 'POST', body, status: 201, ...options });
    const results = await Promise.allSettled([
      spend({ kind: 'premium_days', days: 7 }), spend({ kind: 'premium_days', days: 7 }), spend({ kind: 'premium_days', days: 7 }),
      spend({ kind: 'premium_days', days: 7 }),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 3, 'three 140-point purchases fit in 500 points');
    assert.equal(await balance(owner), 80);
    const { rows: premium } = await realmConnector.execute(`
      SELECT starts_at, ends_at FROM user_entitlements WHERE user_id = $1 AND source = 'points' ORDER BY starts_at`, [users[owner]]);
    assert.equal(premium.length, 3);
    assert.equal(premium[1].starts_at.getTime(), premium[0].ends_at.getTime(), 'Premium days queue after each other');
    assert.equal(await plan(owner), 'premium');
    await call('/points/spend', { method: 'POST', body: { kind: 'profile_boost', days: 7 }, status: 409 });
    await call('/admin/points/grants', { actor: owner, method: 'POST', body: { email: emails[owner], points: 5, note: 'Not allowed' }, status: 403 });
    const grant = await call('/admin/points/grants', {
      actor: admin, method: 'POST', status: 201, body: { email: emails[owner].toUpperCase(), points: 5000, note: 'Synthetic festival' },
    });
    assert.equal(grant.balance, 5080);
    assert.equal((await realmConnector.execute(
      `SELECT 1 FROM admin_audit WHERE actor_id = $1 AND action = 'points_granted' AND target_id = $2`, [users[admin], users[owner]])).rowCount, 1);
    await call('/points/spend', { method: 'POST', body: { kind: 'profile_boost', days: 2 }, status: 400 });
    await spend({ kind: 'profile_boost', days: 3 });
    await spend({ kind: 'announcement_pin', days: 1, announcementId: announcements[0].id, placeId: amsterdam, radiusKm: 25 });
    for (const announcement of announcements.slice(1)) await spend({ kind: 'announcement_boost', days: 1, announcementId: announcement.id });
    await call('/points/spend', { actor: fan, method: 'POST', body: { kind: 'announcement_boost', days: 1, announcementId: nearby.id }, status: 404 });
    await call('/points/spend', { method: 'POST', body: { kind: 'announcement_pin', days: 1, announcementId: nearby.id, placeId: amsterdam, radiusKm: 2000 }, status: 400 });
    await realmConnector.execute(`UPDATE announcements SET expires_at = NOW() + INTERVAL '2 days' WHERE id = $1`, [nearby.id]);
    const expiring = await call('/points/spend', { method: 'POST', body: { kind: 'announcement_boost', days: 7, announcementId: nearby.id }, status: 409 });
    assert.equal(expiring.error.code, 'ANNOUNCEMENT_EXPIRES_FIRST');
    const wallet = await call('/points');
    assert.equal(wallet.promotions.length, 5);
    assert.equal(wallet.rules.spend.pinMaxRadiusKm, monetization.points.pinMaxRadiusKm);
    const pinCost = (monetization.points.pinDayBaseCost + 3 * monetization.points.pinDayCostPer10Km);
    assert.equal(wallet.promotions.find(item => item.kind === 'announcement_pin').pointsSpent, pinCost);
  });

  await t.test('discovery shows labelled promoted results first, capped per page, with pins matched by area', async () => {
    const search = query => call(`/announcements/search?${new URLSearchParams({ searchTerm: marker, pageSize: '2', ...query })}`, { actor: fan });
    const first = await search({ page: '1' });
    const second = await search({ page: '2' });
    const promoted = page => page.announcements.filter(item => item.promotion);
    assert.equal(promoted(first).length, 2);
    assert.equal(promoted(second).length, 1);
    assert.ok([...promoted(first), ...promoted(second)].every(item => item.promotion.kind === 'boosted'));
    assert.equal(new Set([...promoted(first), ...promoted(second)].map(item => item.id)).size, 3);
    assert.deepEqual(first.announcements.slice(0, 2).map(item => Boolean(item.promotion)), [true, true]);
    assert.ok(first.announcements.some(item => !item.promotion), 'organic results stay visible');
    assert.ok(first.announcements.length <= 4);
    const near = await search({ placeId: String(amsterdam), radiusKm: '10', pageSize: '12' });
    assert.equal(near.announcements[0].id, announcements[0].id);
    assert.equal(near.announcements[0].promotion.kind, 'pinned');
    assert.ok(near.announcements.some(item => !item.promotion && item.title.includes('organic Amsterdam')));
    const far = await search({ placeId: String(milan), radiusKm: '10', pageSize: '12' });
    assert.ok(!far.announcements.some(item => item.id === announcements[0].id));
    await call(`/announcements/search?searchTerm=${marker}`, { actor: null });
    const musicians = await call(`/profiles/search?${new URLSearchParams({ searchTerm: marker, pageSize: '12' })}`, { actor: fan });
    assert.equal(musicians.profiles[0].userId, users[owner]);
    assert.deepEqual(musicians.profiles[0].promotion, { kind: 'boosted' });
    assert.equal(musicians.profiles.filter(item => item.userId === users[owner]).length, 1);
  });

  let card;
  await t.test('administrators manage sponsored cards that appear labelled in targeted discovery with aggregate stats', async () => {
    const png = (await sharp({ create: { width: 40, height: 30, channels: 3, background: '#335577' } }).png().toBuffer()).toString('base64');
    const image = await call('/media', { actor: admin, method: 'POST', status: 201, body: { data: png, mimeType: 'image/png', purpose: 'sponsored' } });
    const genre = (await realmConnector.execute("SELECT id FROM genres WHERE name = 'Jazz'")).rows[0].id;
    const other = (await realmConnector.execute("SELECT id FROM genres WHERE name = 'Rock'")).rows[0].id;
    const body = {
      sponsorName: 'Synthetic Strings Co', title: `${marker} sponsored strings`, body: 'Fictional strings for synthetic tests.',
      linkUrl: 'https://example.test/strings', linkLabel: 'See strings', imageUrl: image.url, imageAlt: 'A blue synthetic swatch',
      genreIds: [genre], priority: 100, placements: ['feed', 'musicians'],
    };
    await call('/admin/sponsored-cards', { actor: owner, method: 'POST', body, status: 403 });
    await call('/admin/sponsored-cards', { actor: admin, method: 'POST', body: { ...body, imageAlt: '' }, status: 400 });
    await call('/admin/sponsored-cards', { actor: admin, method: 'POST', body: { ...body, linkUrl: 'javascript:alert(1)' }, status: 400 });
    card = await call('/admin/sponsored-cards', { actor: admin, method: 'POST', body, status: 201 });
    cards.push(card.id);
    await realmConnector.execute('INSERT INTO announcement_genres (announcement_id, genre_id) SELECT id, $2 FROM announcements WHERE title LIKE $1',
      [`${marker}%`, genre]);
    const feed = await call(`/announcements/search?${new URLSearchParams({ searchTerm: marker, genreId: genre, pageSize: '12' })}`, { actor: fan });
    const placed = feed.sponsored.find(item => item.card.id === card.id);
    assert.ok(placed, 'targeted card is placed');
    assert.ok(placed.position >= 1 && placed.position <= feed.announcements.length);
    assert.equal(placed.card.linkUrl, 'https://example.test/strings');
    assert.equal(placed.card.sponsorName, 'Synthetic Strings Co');
    const untargeted = await call(`/announcements/search?${new URLSearchParams({ searchTerm: marker, genreId: other })}`, { actor: fan });
    assert.ok(!untargeted.sponsored.some(item => item.card.id === card.id));
    assert.equal((await call(`/media/${image.id}`, { actor: null })).statusCode, 200);
    assert.equal((await call(`/sponsored/${card.id}/click`, { actor: null, method: 'POST' })).linkUrl, 'https://example.test/strings');
    const { rows: [stats] } = await realmConnector.execute('SELECT impressions, clicks FROM sponsored_card_stats WHERE card_id = $1', [card.id]);
    assert.deepEqual(stats, { impressions: 1, clicks: 1 });
    const listed = await call('/admin/sponsored-cards?page=1&pageSize=20', { actor: admin });
    assert.deepEqual(listed.cards.find(item => item.id === card.id).stats, { impressions: 1, clicks: 1, videoCompletions: 0 });

    await call('/monetization/settings', { actor: fan, method: 'PUT', body: { hideSponsored: true }, status: 403 });
    assert.deepEqual(await call('/monetization/settings', { method: 'PUT', body: { hideSponsored: true } }), { hideSponsored: true, eligible: true });
    const hidden = await call(`/announcements/search?${new URLSearchParams({ searchTerm: marker, genreId: genre })}`, { actor: owner });
    assert.deepEqual(hidden.sponsored, []);

    await call(`/admin/sponsored-cards/${card.id}`, { actor: admin, method: 'PATCH', body: { active: false } });
    await call(`/media/${image.id}`, { actor: null, status: 404 });
    await call(`/sponsored/${card.id}/click`, { actor: null, method: 'POST', status: 404 });
    card = await call(`/admin/sponsored-cards/${card.id}`, { actor: admin, method: 'PATCH', body: { active: true, endsAt: null } });
    assert.equal(card.live, true);
    assert.equal((await realmConnector.execute(
      `SELECT COUNT(*)::int AS count FROM admin_audit WHERE actor_id = $1 AND action LIKE 'sponsored_card_%'`, [users[admin]])).rows[0].count, 3);
  });

  await t.test('rewarded videos need a server-issued token, minimum watch time and respect the daily cap', async () => {
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), randomBytes(2048)]);
    await call(`/admin/sponsored-cards/${card.id}/video`, {
      actor: admin, method: 'POST', status: 400, body: { data: randomBytes(64).toString('base64'), mimeType: 'video/mp4' },
    });
    card = await call(`/admin/sponsored-cards/${card.id}/video`, {
      actor: admin, method: 'POST', status: 201, body: { data: mp4.toString('base64'), mimeType: 'video/mp4' },
    });
    assert.ok(card.videoMediaUrl);
    const whole = await call(`/sponsored/${card.id}/video`, { actor: null });
    assert.equal(whole.headers['content-type'], 'video/mp4');
    assert.equal(Number(whole.headers['content-length']), mp4.length);
    const part = await call(`/sponsored/${card.id}/video`, { actor: null, headers: { range: 'bytes=0-99' }, status: 206 });
    assert.equal(part.headers['content-range'], `bytes 0-99/${mp4.length}`);
    assert.equal(part.rawPayload.length, 100);
    await call(`/sponsored/${card.id}/video`, { actor: null, headers: { range: `bytes=${mp4.length + 5}-` }, status: 416 });

    const library = await call('/rewards/videos', { actor: fan });
    const video = library.videos.find(item => item.id === card.id);
    assert.equal(video.videoUrl, `/realm/sponsored/${card.id}/video`);
    assert.equal(video.minimumSeconds, 15);
    const watch = async () => {
      const view = await call(`/rewards/videos/${card.id}/views`, { actor: fan, method: 'POST', status: 201 });
      assert.equal(view.minimumSeconds, 15);
      const early = await call('/rewards/views/complete', { actor: fan, method: 'POST', body: { token: view.token }, status: 409 });
      assert.equal(early.error.code, 'WATCH_TIME_NOT_REACHED');
      await realmConnector.execute(`UPDATE rewarded_video_views SET started_at = NOW() - INTERVAL '20 seconds' WHERE user_id = $1 AND status = 'started'`, [users[fan]]);
      return view.token;
    };
    const abandoned = await watch();
    const token = await watch();
    await call('/rewards/views/complete', { actor: fan, method: 'POST', body: { token: abandoned }, status: 409 });
    const reward = await call('/rewards/views/complete', { actor: fan, method: 'POST', body: { token } });
    assert.deepEqual([reward.points, reward.balance, reward.today], [monetization.points.rewardedVideo, monetization.points.rewardedVideo, { completed: 1, cap: 2 }]);
    await call('/rewards/views/complete', { actor: fan, method: 'POST', body: { token }, status: 409 });
    await call('/rewards/views/complete', { actor: owner, method: 'POST', body: { token: await watch() }, status: 409 });
    await realmConnector.execute(`UPDATE rewarded_video_views SET started_at = NOW() - INTERVAL '20 seconds' WHERE user_id = $1 AND status = 'started'`, [users[fan]]);
    const { rows: [pending] } = await realmConnector.execute(`SELECT id FROM rewarded_video_views WHERE user_id = $1 AND status = 'started'`, [users[fan]]);
    assert.ok(pending);
    await realmConnector.execute(`UPDATE rewarded_video_views SET status = 'rewarded', completed_at = NOW(), points = 1 WHERE id = $1`, [pending.id]);
    await call(`/rewards/videos/${card.id}/views`, { actor: fan, method: 'POST', status: 429 });
    const { rows: [stats] } = await realmConnector.execute('SELECT video_completions FROM sponsored_card_stats WHERE card_id = $1', [card.id]);
    assert.equal(stats.video_completions, 1);
  });

  await t.test('invite codes reward both sides after email verification, with claims and a monthly cap', async () => {
    const invite = await call('/referrals');
    assert.match(invite.code, /^[A-Z2-9]{10}$/);
    assert.equal(invite.link, `http://localhost:3000/#register?invite=${invite.code}`);
    assert.equal((await call('/referrals')).code, invite.code);
    const email = `${marker}-invitee@example.test`;
    const registered = await call('/auth/register', {
      actor: null, method: 'POST', status: 201,
      body: { email, password: 'Synthetic-Passw0rd!', acceptedTermsVersion: realmConfig.legal.termsVersion, inviteCode: invite.code.toLowerCase() },
    });
    users.push(registered.userId);
    assert.equal(registered.inviteRecorded, true);
    assert.equal((await call('/referrals')).counts.pending, 1);
    const verification = randomBytes(24).toString('hex');
    await realmConnector.execute(`UPDATE users SET verification_token_hash = $2, verification_token_expires = NOW() + INTERVAL '1 hour' WHERE id = $1`,
      [registered.userId, cipherEngine.hashToken(verification)]);
    await call(`/auth/verify-email?token=${verification}`, { actor: null });
    const after = await call('/referrals');
    assert.deepEqual(after.counts, { pending: 0, rewarded: 1, capped: 0 });
    const inviteeBalance = (await realmConnector.execute('SELECT balance FROM points_balances WHERE user_id = $1', [registered.userId])).rows[0].balance;
    assert.equal(inviteeBalance, monetization.points.referralInvitee);
    assert.equal((await notifications(owner, 'points_earned')).some(row => row.params.reason === 'referral_inviter'), true);

    const stale = await call('/auth/register', {
      actor: null, method: 'POST', status: 201,
      body: { email: `${marker}-stale@example.test`, password: 'Synthetic-Passw0rd!', acceptedTermsVersion: realmConfig.legal.termsVersion, inviteCode: 'NOTAREALCODE' },
    });
    users.push(stale.userId);
    assert.equal(stale.inviteRecorded, false);

    await call('/referrals/claim', { actor: fan, method: 'POST', body: { code: (await call('/referrals', { actor: fan })).code }, status: 400 });
    await call('/referrals/claim', { actor: fan, method: 'POST', body: { code: 'ZZZZZZZZZZ' }, status: 404 });
    await call('/referrals/claim', { actor: veteran, method: 'POST', body: { code: invite.code }, status: 409 });
    const before = await balance(owner);
    const claimed = await call('/referrals/claim', { actor: fan, method: 'POST', body: { code: invite.code }, status: 201 });
    assert.equal(claimed.status, 'capped', 'the inviter already reached this month\'s cap of one');
    assert.equal(await balance(owner), before);
    assert.equal(await balance(fan), monetization.points.rewardedVideo + monetization.points.referralInvitee);
    await call('/referrals/claim', { actor: fan, method: 'POST', body: { code: invite.code }, status: 409 });
    await call('/referrals/claim', { actor: owner, method: 'POST', body: { code: claimed.overview.code }, status: 400 });
  });

  await t.test('app ratings are rewarded once per account by the maintenance job', async () => {
    await realmConnector.execute(`INSERT INTO app_ratings (user_id, app_version, stars) VALUES ($1, '1.0.0', 5), ($1, '1.1.0', 4)`, [users[veteran]]);
    await jobs.rewardRatings();
    await jobs.rewardRatings();
    assert.equal(await balance(veteran), monetization.points.appRating);
    const { rows } = await realmConnector.execute(
      'SELECT rewarded_at IS NOT NULL AS rewarded, reward_reference FROM app_ratings WHERE user_id = $1 ORDER BY app_version', [users[veteran]]);
    assert.deepEqual(rows.map(row => row.rewarded), [true, true]);
    assert.equal(rows.filter(row => row.reward_reference).length, 1);
  });

  await t.test('offer broadcasts respect notification opt-outs and are audited', async () => {
    await call('/preferences/notifications', { actor: veteran, method: 'PUT', body: { kinds: { offers: { inApp: false, push: false, email: false } } } });
    await call('/admin/offers', { actor: owner, method: 'POST', body: { headline: 'Not allowed', message: 'Synthetic', audience: 'all' }, status: 403 });
    await call('/admin/offers', { actor: admin, method: 'POST', body: { headline: 'Big sale', message: 'Synthetic', audience: 'all', link: 'https://x.test' }, status: 400 });
    const sent = await call('/admin/offers', {
      actor: admin, method: 'POST', status: 201,
      body: { headline: `${marker} summer strings`, message: 'Synthetic strings are half price this week.', audience: 'all', link: '#wallet' },
    });
    assert.ok(sent.recipients >= 3);
    assert.deepEqual((await notifications(fan, 'offers')).map(row => [row.params.headline, row.link]), [[`${marker} summer strings`, '#wallet']]);
    assert.equal((await notifications(veteran, 'offers')).length, 0);
    const premiumOnly = await call('/admin/offers', {
      actor: admin, method: 'POST', status: 201, body: { headline: `${marker} for paid plans`, message: 'Synthetic perk.', audience: 'paid' },
    });
    assert.equal((await notifications(owner, 'offers')).length, 2);
    assert.equal((await notifications(fan, 'offers')).length, 1);
    assert.ok(premiumOnly.recipients >= 1);
    const overview = await call('/admin/monetization', { actor: admin });
    assert.equal(overview.payments.enabled, true);
    assert.ok(overview.points.earned.event_grant >= 5000);
    assert.ok(overview.promotions.profile_boost >= 1);
    assert.ok(overview.offers.some(item => item.id === sent.id));
    assert.equal(overview.grants[0].note, 'Synthetic festival');
    await call('/admin/monetization', { actor: fan, status: 403 });
  });

  await t.test('exports include monetization data and deleted accounts lose their Stripe customer', async () => {
    const exported = await call('/account/export');
    assert.ok(exported.pointsLedger.length >= 3);
    assert.equal(exported.pointsBalance.balance, await balance(owner));
    assert.equal(exported.inviteCode.code.length, 10);
    assert.equal(exported.billingSubscriptions[0].status, 'canceled');
    assert.equal(exported.sponsoredPreferences.hideSponsored, true);
    const { rows: [customer] } = await realmConnector.execute('SELECT customer_id FROM billing_customers WHERE user_id = $1', [users[owner]]);
    await accountRepository.deleteAccount(users[owner]);
    assert.equal((await realmConnector.execute('SELECT user_id FROM billing_customers WHERE customer_id = $1', [customer.customer_id])).rows[0].user_id, null);
    await jobs.deleteOrphanedCustomers();
    assert.ok(client.calls.deletedCustomers.includes(customer.customer_id));
    assert.equal((await realmConnector.execute('SELECT 1 FROM billing_customers WHERE customer_id = $1', [customer.customer_id])).rowCount, 0);
    assert.equal((await realmConnector.execute('SELECT 1 FROM points_ledger WHERE user_id = $1', [users[owner]])).rowCount, 0);
  });
});
