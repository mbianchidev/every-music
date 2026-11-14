import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonetizationConfig, parsePointsPacks, validateMonetizationConfig } from '../config/monetization.js';
import { promotedSlice, sponsoredPositions, sponsoredSlots, spendCost } from '../src/engines/monetization-rules.js';
import { invoiceSubscriptionId, subscriptionPeriodEnd, subscriptionPlan } from '../src/engines/payment-gateway.js';
import { rankPromoted } from '../src/engines/discovery-placements.js';
import { parseRange } from '../src/conductors/monetization-conductor.js';
import { generateReferralCode, REFERRAL_CODE } from '../src/repositories/referral-repository.js';

const points = createMonetizationConfig({}).monetization.points;
const validate = env => validateMonetizationConfig(createMonetizationConfig(env));

test('payments stay disabled until both Stripe secrets are set, and reject malformed settings', () => {
  assert.equal(validate({}), true);
  assert.throws(() => validate({ STRIPE_SECRET_KEY: 'sk_test_abcdefgh123' }), /together/);
  assert.equal(validate({ STRIPE_SECRET_KEY: 'sk_test_abcdefgh123', STRIPE_WEBHOOK_SECRET: 'whsec_abcdefgh123' }), true);
  assert.throws(() => validate({ STRIPE_SECRET_KEY: 'pk_test_abcdefgh123', STRIPE_WEBHOOK_SECRET: 'whsec_abcdefgh123' }), /secret or restricted key/);
  assert.throws(() => validate({ STRIPE_PREMIUM_PRICE_ID: 'prod_123' }), /price ID/);
  assert.throws(() => createMonetizationConfig({ POINTS_PROMOTION_DURATIONS_DAYS: '1,1' }), /distinct/);
  assert.deepEqual(createMonetizationConfig({ POINTS_PROMOTION_DURATIONS_DAYS: '7, 1' }).monetization.points.promotionDurations, [1, 7]);
});

test('points packs parse from id:points:price:amount entries', () => {
  assert.deepEqual(parsePointsPacks('starter:500:price_abc:499, fan:1200:price_def:999'), [
    { id: 'starter', points: 500, priceId: 'price_abc', amountMinor: 499 },
    { id: 'fan', points: 1200, priceId: 'price_def', amountMinor: 999 },
  ]);
  assert.deepEqual(parsePointsPacks(''), []);
  assert.throws(() => parsePointsPacks('starter:500:price_abc'), /id:points/);
  assert.throws(() => parsePointsPacks('a:1:price_a:1,a:2:price_b:2'), /unique/);
  assert.throws(() => parsePointsPacks('a:0:price_a:1'), /at least 1/);
});

test('spending costs scale with duration and pin radius', () => {
  assert.equal(spendCost(points, { kind: 'premium_days', days: 30 }), 30 * points.premiumDayCost);
  assert.equal(spendCost(points, { kind: 'profile_boost', days: 3 }), 3 * points.profileBoostDayCost);
  const pin = radiusKm => spendCost(points, { kind: 'announcement_pin', days: 1, radiusKm });
  assert.equal(pin(5), points.pinDayBaseCost + points.pinDayCostPer10Km);
  assert.equal(pin(10), pin(5));
  assert.equal(pin(11), points.pinDayBaseCost + 2 * points.pinDayCostPer10Km);
  assert.ok(pin(200) > pin(50));
  assert.throws(() => pin(4), error => error.code === 'INVALID_SPEND');
  assert.throws(() => pin(points.pinMaxRadiusKm + 1), /radius/);
  assert.throws(() => spendCost(points, { kind: 'profile_boost', days: 2 }), /durations/);
  assert.throws(() => spendCost(points, { kind: 'premium_days', days: 3 }), /durations/);
  assert.throws(() => spendCost(points, { kind: 'gift', days: 1 }), error => error.statusCode === 400);
});

test('promoted results are capped per page and ranked without duplicates', () => {
  const candidates = [{ id: 'a', kind: 'pinned' }, { id: 'b', kind: 'boosted' }, { id: 'a', kind: 'boosted' }, { id: 'c', kind: 'boosted' }];
  const matches = { pinned: new Map(), boosted: new Map([['a', { id: 'a' }], ['b', { id: 'b' }], ['c', { id: 'c' }]]) };
  const ranked = rankPromoted(candidates, matches);
  assert.deepEqual(ranked.map(row => [row.id, row.promotion.kind]), [['b', 'boosted'], ['a', 'boosted'], ['c', 'boosted']]);
  matches.pinned.set('a', { id: 'a' });
  assert.deepEqual(rankPromoted(candidates, matches).map(row => row.promotion.kind), ['pinned', 'boosted', 'boosted']);
  assert.deepEqual(promotedSlice([1, 2, 3], 1, 2), [1, 2]);
  assert.deepEqual(promotedSlice([1, 2, 3], 2, 2), [3]);
  assert.deepEqual(promotedSlice([1, 2, 3], 3, 2), []);
  assert.deepEqual(promotedSlice([1, 2, 3], 1, 0), []);
});

test('sponsored cards respect their per-page cap and sit between results', () => {
  const cards = [{ id: 'x', maxPerPage: 2 }, { id: 'y', maxPerPage: 1 }];
  assert.deepEqual(sponsoredSlots(cards, 3).map(card => card.id), ['x', 'y', 'x']);
  assert.deepEqual(sponsoredSlots([{ id: 'x', maxPerPage: 1 }], 3).map(card => card.id), ['x']);
  assert.deepEqual(sponsoredPositions(12, 1), [6]);
  assert.deepEqual(sponsoredPositions(12, 2), [4, 8]);
  assert.deepEqual(sponsoredPositions(1, 1), [1]);
  assert.deepEqual(sponsoredPositions(0, 2), []);
});

test('Stripe subscriptions map to plans and periods across API versions', () => {
  const stripe = { premiumPriceId: 'price_p', partnerPriceId: 'price_b' };
  assert.equal(subscriptionPlan({ items: { data: [{ price: { id: 'price_b' } }] }, metadata: { plan: 'premium' } }, stripe), 'partner');
  assert.equal(subscriptionPlan({ items: { data: [{ price: 'price_p' }] } }, stripe), 'premium');
  assert.equal(subscriptionPlan({ items: { data: [{ price: { id: 'price_x' } }] }, metadata: { plan: 'premium' } }, stripe), 'premium');
  assert.equal(subscriptionPlan({ items: { data: [] }, metadata: { plan: 'gold' } }, stripe), null);
  assert.equal(subscriptionPeriodEnd({ current_period_end: 1700000000 }).toISOString(), '2023-11-14T22:13:20.000Z');
  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 1700000000 }, { current_period_end: 1700000100 }] } }).getTime(), 1700000100000);
  assert.equal(subscriptionPeriodEnd({ items: { data: [] } }), null);
  assert.equal(invoiceSubscriptionId({ subscription: 'sub_1' }), 'sub_1');
  assert.equal(invoiceSubscriptionId({ parent: { subscription_details: { subscription: { id: 'sub_2' } } } }), 'sub_2');
  assert.equal(invoiceSubscriptionId({}), null);
});

test('video byte ranges and invite codes', () => {
  assert.equal(parseRange(undefined, 100), null);
  assert.deepEqual(parseRange('bytes=0-9', 100), { start: 0, end: 9 });
  assert.deepEqual(parseRange('bytes=90-', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=-10', 100), { start: 90, end: 99 });
  assert.deepEqual(parseRange('bytes=50-500', 100), { start: 50, end: 99 });
  assert.deepEqual(parseRange('bytes=100-', 100), { invalid: true });
  assert.deepEqual(parseRange('bytes=0-1,5-6', 100), { invalid: true });
  const codes = new Set(Array.from({ length: 50 }, () => generateReferralCode()));
  assert.equal(codes.size, 50);
  assert.ok([...codes].every(code => REFERRAL_CODE.test(code) && !/[01ILO]/.test(code)));
});
