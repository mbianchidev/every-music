import test from 'node:test';
import assert from 'node:assert/strict';
import { interleaveSponsored, pinRadii, safeExternalUrl, spendCost } from '../src/lib/monetization.js';
import english from '../src/locales/en/monetization.js';
import dutch from '../src/locales/nl/monetization.js';
import italian from '../src/locales/it/monetization.js';

const rules = {
  premiumDayCost: 20, profileBoostDayCost: 60, announcementBoostDayCost: 60, pinDayBaseCost: 80, pinDayCostPer10Km: 10,
  pinMinRadiusKm: 5, pinMaxRadiusKm: 200,
};

test('sponsored cards are placed before their server positions and never on empty pages', () => {
  const rows = ['a', 'b', 'c'].map(id => ({ id }));
  const card = id => ({ id });
  const keys = entries => entries.map(entry => (entry.type === 'sponsored' ? `s:${entry.card.id}` : entry.item.id));
  assert.deepEqual(keys(interleaveSponsored(rows, [{ position: 2, card: card('x') }])), ['a', 'b', 's:x', 'c']);
  assert.deepEqual(keys(interleaveSponsored(rows, [{ position: 3, card: card('x') }, { position: 1, card: card('y') }])), ['a', 's:y', 'b', 'c', 's:x']);
  assert.deepEqual(keys(interleaveSponsored(rows, undefined)), ['a', 'b', 'c']);
  assert.deepEqual(interleaveSponsored([], [{ position: 1, card: card('x') }]), []);
  const repeated = interleaveSponsored(rows, [{ position: 1, card: card('x') }, { position: 2, card: card('x') }]);
  assert.equal(new Set(repeated.map(entry => entry.key)).size, repeated.length, 'keys stay unique when a card repeats');
});

test('spend costs mirror the server rules', () => {
  assert.equal(spendCost(rules, { kind: 'premium_days', days: 7 }), 140);
  assert.equal(spendCost(rules, { kind: 'announcement_boost', days: 3 }), 180);
  assert.equal(spendCost(rules, { kind: 'announcement_pin', days: 1, radiusKm: 25 }), 110);
  assert.equal(spendCost(rules, { kind: 'announcement_pin', days: 2, radiusKm: 5 }), 180);
  assert.equal(spendCost(null, { kind: 'profile_boost', days: 1 }), null);
  assert.deepEqual(pinRadii(rules), [5, 10, 25, 50, 100, 200]);
});

test('only https links are opened from sponsored cards', () => {
  assert.equal(safeExternalUrl('https://example.test/strings'), 'https://example.test/strings');
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('http://example.test'), null);
  assert.equal(safeExternalUrl(undefined), null);
});

const shape = value => (value && typeof value === 'object'
  ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shape(item)]))
  : typeof value);
const placeholders = value => (typeof value === 'string'
  ? [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
  : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, placeholders(item)])));

test('every locale translates the same monetization keys and placeholders', () => {
  for (const catalog of [dutch, italian]) {
    assert.deepEqual(shape(catalog), shape(english));
    assert.deepEqual(placeholders(catalog), placeholders(english));
  }
});
