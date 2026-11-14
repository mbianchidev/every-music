import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKETPLACE_CATEGORIES, MARKETPLACE_TABS, catalogView, normalizeListing, tabForType } from '../src/engines/marketplace-catalog.js';
import { searchFilters } from '../src/conductors/marketplace-conductor.js';
import { escapeLike } from '../src/repositories/marketplace-repository.js';
import { createRealmConfig, validateRealmConfig } from '../config/realm.js';

const guitar = {
  type: 'sell', category: 'guitars', subcategory: 'electric_guitar', title: '  Synthetic guitar  ',
  description: 'A synthetic used guitar listing.', condition: 'used', priceMode: 'fixed', priceMinor: 45000, currency: 'EUR',
};
const rejects = (input, pattern) => assert.throws(() => normalizeListing(input), error => error.code === 'INVALID_LISTING' && pattern.test(error.message));

test('normalizes a sale listing and keeps category keys unique across tabs', () => {
  const listing = normalizeListing({ ...guitar, locationText: '  ', shipping: true });
  assert.equal(listing.title, 'Synthetic guitar');
  assert.equal(listing.locationText, null);
  assert.equal(listing.shipping, true);
  assert.equal(listing.remote, false);
  const keys = Object.values(MARKETPLACE_CATEGORIES).flatMap(categories => Object.keys(categories));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(tabForType('service_wanted'), 'services');
  assert.deepEqual(catalogView({ listingDays: 60 }).tabs.map(tab => tab.id), Object.keys(MARKETPLACE_TABS));
});

test('enforces category, condition, and shipping rules per listing type', () => {
  rejects({ ...guitar, category: 'sound_engineer' }, /category/);
  rejects({ ...guitar, subcategory: 'trumpet' }, /subcategory/);
  rejects({ ...guitar, condition: null }, /condition/);
  rejects({ ...guitar, type: 'lesson', category: 'vocal_coaching', subcategory: null }, /Condition/);
  rejects({
    ...guitar, type: 'service_offer', category: 'driver', subcategory: null, condition: null, shipping: true, rateUnit: 'day',
  }, /Shipping/);
  assert.equal(normalizeListing({ ...guitar, type: 'wanted', condition: null }).condition, null);
});

test('validates price modes, ISO 4217 currencies, and rate units', () => {
  rejects({ ...guitar, priceMinor: null }, /fixed-price/);
  rejects({ ...guitar, currency: 'XYZ' }, /ISO 4217/);
  rejects({ ...guitar, currency: null }, /amount and a currency/);
  rejects({ ...guitar, priceMinor: 1.5 }, /whole number/);
  rejects({ ...guitar, priceMode: 'free' }, /cannot include an amount/);
  assert.deepEqual(
    [normalizeListing({ ...guitar, priceMode: 'contact', priceMinor: null, currency: null }).priceMinor,
      normalizeListing({ ...guitar, priceMode: 'negotiable', priceMinor: null, currency: null }).currency],
    [null, null],
  );
  const lesson = { ...guitar, type: 'lesson', category: 'instrument_lessons', subcategory: 'guitar', condition: null, priceMinor: 4000 };
  rejects(lesson, /per hour/);
  rejects({ ...guitar, rateUnit: 'hour' }, /lessons and services/);
  rejects({ ...lesson, priceMode: 'contact', priceMinor: null, currency: null, rateUnit: 'hour' }, /needs an amount/);
  assert.equal(normalizeListing({ ...lesson, rateUnit: 'session', remote: true }).rateUnit, 'session');
});

test('validates coordinates as a pair', () => {
  rejects({ ...guitar, latitude: 52.37 }, /both latitude/);
  rejects({ ...guitar, latitude: 91, longitude: 4.9 }, /out of range/);
  assert.equal(normalizeListing({ ...guitar, latitude: 52.37, longitude: 4.9 }).longitude, 4.9);
});

test('search filters require a currency for price ranges and a matching tab', () => {
  assert.throws(() => searchFilters({ priceMin: '100' }), /currency/);
  assert.throws(() => searchFilters({ currency: 'EUR', priceMin: '500', priceMax: '100' }), /minimum/);
  assert.throws(() => searchFilters({ tab: 'lessons', type: 'sell' }), /tab/);
  assert.throws(() => searchFilters({ currency: 'ABC' }), /ISO 4217/);
  const filters = searchFilters({ tab: 'gear', currency: 'EUR', priceMin: '0', priceMax: '1000', remote: 'true', q: '  amp ' });
  assert.deepEqual([filters.priceMin, filters.priceMax, filters.remote, filters.shipping, filters.q], [0, 1000, true, false, 'amp']);
  assert.equal(escapeLike('100%_off\\'), '100\\%\\_off\\\\');
});

test('marketplace expiry settings are configurable and validated', () => {
  const base = {
    REALM_ENV: 'test', REALM_CONNECTION: 'postgresql://localhost/everymusic',
    CIPHER_PRIMARY_KEY: 'primary-key-that-is-longer-than-thirty-two-characters',
    CIPHER_REFRESH_KEY: 'refresh-key-that-is-longer-than-thirty-two-characters',
  };
  assert.deepEqual(createRealmConfig(base).marketplace, { listingDays: 60, expiryReminderDays: 3 });
  assert.throws(() => createRealmConfig({ ...base, MARKETPLACE_LISTING_DAYS: '0' }), /MARKETPLACE_LISTING_DAYS/);
  assert.throws(() => validateRealmConfig(createRealmConfig({
    ...base, MARKETPLACE_LISTING_DAYS: '3', MARKETPLACE_EXPIRY_REMINDER_DAYS: '3',
  })), /lower than/);
});
