import test from 'node:test';
import assert from 'node:assert/strict';
import { registerCatalog } from '../src/lib/i18n.js';
import { draftToBody, emptyDraft, formatPrice, fromMinorUnits, listingToDraft, toMinorUnits } from '../src/lib/marketplace.js';
import en from '../src/locales/en/marketplace.js';
import it from '../src/locales/it/marketplace.js';
import nl from '../src/locales/nl/marketplace.js';

registerCatalog('en', 'marketplace', en);
registerCatalog('it', 'marketplace', it);

test('converts typed amounts to minor units using each currency exponent', () => {
  assert.equal(toMinorUnits('450', 'EUR'), 45000);
  assert.equal(toMinorUnits(' 39,9 ', 'EUR'), 3990);
  assert.equal(toMinorUnits('1200', 'JPY'), 1200);
  assert.equal(toMinorUnits('1.234', 'BHD'), 1234);
  assert.equal(toMinorUnits('', 'EUR'), null);
  assert.ok(Number.isNaN(toMinorUnits('12.345', 'EUR')));
  assert.ok(Number.isNaN(toMinorUnits('12.5', 'JPY')));
  assert.ok(Number.isNaN(toMinorUnits('-3', 'EUR')));
  assert.equal(fromMinorUnits(3990, 'EUR'), '39.90');
  assert.equal(fromMinorUnits(1200, 'JPY'), '1200');
});

test('formats free, contact, negotiable, and per-unit prices per locale', () => {
  const base = { priceMode: 'fixed', priceMinor: 4000, currency: 'EUR', rateUnit: null };
  assert.equal(formatPrice({ ...base, priceMode: 'free', priceMinor: null }, 'en'), 'Free');
  assert.equal(formatPrice({ ...base, priceMode: 'contact', priceMinor: null }, 'it'), it.price.contact);
  assert.equal(formatPrice({ ...base, priceMode: 'negotiable', priceMinor: null }, 'en'), 'Negotiable');
  assert.equal(formatPrice({ ...base, rateUnit: 'hour' }, 'en'), '€40.00 per hour');
  assert.equal(formatPrice({ ...base, priceMode: 'negotiable' }, 'en'), '€40.00, negotiable');
  assert.match(formatPrice({ ...base, rateUnit: 'session' }, 'it'), /40,00/);
});

test('editor drafts round-trip and report the first invalid field', () => {
  const draft = { ...emptyDraft('lesson'), category: 'vocal_coaching', title: 'Vocal lessons', description: 'Weekly synthetic lessons.', amount: '35', remote: true, shipping: true };
  assert.deepEqual(draftToBody(draft), { error: 'rateUnit' });
  const { body } = draftToBody({ ...draft, rateUnit: 'hour', latitude: '52,37', longitude: '4.9' });
  assert.deepEqual([body.priceMinor, body.currency, body.rateUnit, body.remote, body.shipping, body.condition, body.latitude],
    [3500, 'EUR', 'hour', true, false, null, 52.37]);
  assert.deepEqual(draftToBody({ ...draft, rateUnit: 'hour', latitude: '52' }), { error: 'coordinates' });
  assert.deepEqual(draftToBody({ ...emptyDraft('sell'), category: 'dj', title: 'Mixer', description: 'A synthetic DJ mixer.', amount: '10' }), { error: 'condition' });
  const contact = draftToBody({ ...draft, priceMode: 'contact', amount: '35', rateUnit: 'hour' }).body;
  assert.deepEqual([contact.priceMinor, contact.currency, contact.rateUnit], [null, null, null]);
  const listing = {
    ...body, subcategory: null, instruments: [{ id: 'a' }], genres: [], photos: ['/realm/media/x'], locationText: null,
  };
  assert.equal(listingToDraft(listing).amount, '35.00');
  assert.deepEqual(listingToDraft(listing).instrumentIds, ['a']);
});

test('Dutch and Italian catalogs translate every English key', () => {
  const keys = (value, prefix = '') => (typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([key, child]) => keys(child, `${prefix}${key}.`)) : [prefix.slice(0, -1)]);
  for (const [name, catalog] of [['nl', nl], ['it', it]]) assert.deepEqual(keys(catalog), keys(en), name);
});
