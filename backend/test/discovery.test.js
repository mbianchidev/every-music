import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync, deflateRawSync } from 'node:zlib';
import { boundingBox, haversineKm, proximity, binder } from '../src/engines/geo.js';
import { parseLocationFilters } from '../src/engines/discovery-filters.js';
import { defaultExpiry, isActive, latestExpiry, parseExpiry, resolveExpiry } from '../src/engines/listing-policy.js';
import { canSeeContacts, limitShown, validateContact } from '../src/engines/profile-policy.js';
import { foldPlaceName, searchNames } from '../src/engines/place-names.js';
import { buildPlaces, unzipEntry } from '../scripts/generate-places.mjs';
import { parsePlaceSeed } from '../scripts/places-dataset.js';

const milan = { latitude: 45.46427, longitude: 9.18951 };
const rome = { latitude: 41.89193, longitude: 12.51133 };

test('haversine distances match known city pairs', () => {
  assert.ok(Math.abs(haversineKm(milan, rome) - 477) < 3);
  assert.equal(haversineKm(milan, milan), 0);
});

test('bounding boxes contain the radius and split at the antimeridian', () => {
  const box = boundingBox(milan, 50);
  assert.ok(box.minLatitude < milan.latitude - 0.44 && box.maxLatitude > milan.latitude + 0.44);
  assert.equal(box.longitudes.length, 1);
  const [west, east] = box.longitudes[0];
  assert.ok(haversineKm(milan, { latitude: milan.latitude, longitude: west }) >= 50);
  assert.ok(haversineKm(milan, { latitude: milan.latitude, longitude: east }) >= 50);

  const fiji = boundingBox({ latitude: -17.7, longitude: 179.9 }, 100);
  assert.equal(fiji.longitudes.length, 2);
  assert.ok(fiji.longitudes[0][0] < 180 && fiji.longitudes[1][1] < -179);

  assert.equal(boundingBox({ latitude: 89.5, longitude: 0 }, 100).longitudes, null);
});

test('proximity binds every value as a parameter', () => {
  const values = [];
  const { distance, conditions } = proximity({ latitudeColumn: 'a.latitude', longitudeColumn: 'a.longitude', center: milan, radiusKm: 25 }, binder(values));
  assert.match(distance, /\$1::float8/);
  assert.equal(conditions.length, 3);
  assert.equal(values.at(-1), 25);
  assert.ok(!conditions.join(' ').includes('45.46'));
});

test('location filters validate centers, radius, country and region', () => {
  assert.deepEqual(parseLocationFilters({ placeId: '3173435', radiusKm: '50' }).value, { placeId: 3173435, radiusKm: 50 });
  assert.deepEqual(parseLocationFilters({ latitude: '45.46', longitude: '9.19' }).value, { latitude: 45.46, longitude: 9.19 });
  assert.equal(parseLocationFilters({ radiusKm: '10' }).valid, false);
  assert.equal(parseLocationFilters({ latitude: '45' }).valid, false);
  assert.equal(parseLocationFilters({ placeId: '1', latitude: '1', longitude: '1' }).valid, false);
  assert.equal(parseLocationFilters({ placeId: '1', radiusKm: '5000' }).valid, false);
  assert.equal(parseLocationFilters({ region: '09' }).valid, false);
  assert.deepEqual(parseLocationFilters({ country: 'it', region: '09' }).value, { country: 'IT', region: '09' });
  assert.equal(parseLocationFilters({ placeId: '99999999999' }).valid, false);
});

test('expiry defaults and limits follow the plan', () => {
  const now = new Date('2026-11-14T10:00:00Z');
  assert.equal(parseExpiry('2026-12-01').value.toISOString(), '2026-12-01T23:59:59.999Z');
  assert.equal(parseExpiry('2026-02-30').valid, false);
  assert.equal(parseExpiry('tomorrow').valid, false);
  assert.equal(parseExpiry(null).value, null);
  assert.equal(defaultExpiry(30, now).toISOString(), '2026-12-14T23:59:59.999Z');
  assert.equal(defaultExpiry(null, now), null);
  assert.equal(resolveExpiry({ requested: undefined, limitDays: 30, now }).toISOString(), '2026-12-14T23:59:59.999Z');
  assert.equal(resolveExpiry({ requested: undefined, limitDays: null, now }), null);
  assert.equal(resolveExpiry({ requested: undefined, existing: null, limitDays: 30, now }), undefined);
  assert.ok(resolveExpiry({ requested: undefined, existing: null, limitDays: 30, publishing: true, now }));
  assert.equal(resolveExpiry({ requested: null, existing: new Date(), limitDays: null, now }), null);
  assert.throws(() => resolveExpiry({ requested: null, limitDays: 30, now }), { code: 'EXPIRY_REQUIRED', statusCode: 403 });
  assert.throws(() => resolveExpiry({ requested: new Date('2026-11-01T00:00:00Z'), limitDays: null, now }), { code: 'EXPIRY_IN_PAST' });
  assert.throws(() => resolveExpiry({ requested: new Date('2026-12-20T00:00:00Z'), limitDays: 30, now }), { code: 'EXPIRY_BEYOND_PLAN' });
  assert.ok(resolveExpiry({ requested: latestExpiry(30, now), limitDays: 30, now }));
  assert.ok(resolveExpiry({ requested: new Date('2030-01-01T00:00:00Z'), limitDays: null, now }));
  assert.equal(isActive({ isPublished: true, expiresAt: null }), true);
  assert.equal(isActive({ isPublished: true, expiresAt: '2000-01-01' }), false);
  assert.equal(isActive({ isPublished: false, expiresAt: null }), false);
});

test('contacts respect visibility, blocks and ownership', () => {
  const base = { viewerId: 'viewer', isOwner: false, ownerFollowsViewer: false, blocked: false };
  assert.equal(canSeeContacts({ ...base, visibility: 'members' }), true);
  assert.equal(canSeeContacts({ ...base, visibility: 'members', viewerId: null }), false);
  assert.equal(canSeeContacts({ ...base, visibility: 'members', blocked: true }), false);
  assert.equal(canSeeContacts({ ...base, visibility: 'following' }), false);
  assert.equal(canSeeContacts({ ...base, visibility: 'following', ownerFollowsViewer: true }), true);
  assert.equal(canSeeContacts({ ...base, visibility: 'hidden', ownerFollowsViewer: true }), false);
  assert.equal(canSeeContacts({ ...base, visibility: 'hidden', isOwner: true }), true);
  assert.deepEqual(limitShown([1, 2, 3, 4], 3), { shown: [1, 2, 3], hidden: 1 });
  assert.deepEqual(limitShown([1, 2], null), { shown: [1, 2], hidden: 0 });
  assert.equal(validateContact('telegramId', '@synthetic_band').valid, true);
  assert.equal(validateContact('telegramId', 'no').valid, false);
  assert.equal(validateContact('phone', '+31 (0)20-555 0100').valid, true);
  assert.equal(validateContact('whatsapp', 'call me').valid, false);
  assert.equal(validateContact('signal', 'synthetic.01').valid, true);
});

test('place names fold accents and keep capitalized Latin exonyms only', () => {
  assert.equal(foldPlaceName("Reggio nell'Emilia"), 'reggio nell emilia');
  assert.equal(foldPlaceName('São Paulo'), 'sao paulo');
  assert.equal(foldPlaceName('Düsseldorf'), 'dusseldorf');
  assert.deepEqual(searchNames('Milan', 'Milan', ['Milano', 'MIL', 'mi lan', 'Милан', 'Mailand']), ['milan', 'milano', 'mailand']);
});

test('the generator builds a sorted seed from GeoNames exports and the loader parses it', () => {
  const cities = [
    ['3173435', 'Milan', 'Milan', 'Milano,MIL', '45.46427', '9.18951', 'P', 'PPLA', 'IT', '', '09', '', '', '', '1371498', '', '', 'Europe/Rome', '2024-01-01'],
    ['2747373', 'The Hague', 'The Hague', 'Den Haag', '52.07667', '4.29861', 'P', 'PPLG', 'NL', '', '11', '', '', '', '474292', '', '', 'Europe/Amsterdam', '2024-01-01'],
  ].map(row => row.join('\t')).join('\n');
  const content = buildPlaces({
    cities,
    admin1: 'IT.09\tLombardy\tLombardy\t3174618\nNL.11\tSouth Holland\tSouth Holland\t2743698\n',
    countries: '#ISO\tISO3\nIT\tITA\t380\tIT\tItaly\nNL\tNLD\t528\tNL\tThe Netherlands\n',
  });
  const rows = parsePlaceSeed(content);
  assert.deepEqual(rows.map(row => row[0]), ['2747373', '3173435']);
  assert.deepEqual(rows[1], ['3173435', 'Milan', 'IT', 'Italy', '09', 'Lombardy', '45.46427', '9.18951', '1371498', '|milan|milano|']);
  assert.throws(() => parsePlaceSeed('wrong\theader\n'), /unexpected columns/);

  const data = Buffer.from(cities);
  const compressed = deflateRawSync(data);
  const name = Buffer.from('cities15000.txt');
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(compressed.length, 18);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(compressed.length, 20);
  central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(local.length + name.length + compressed.length, 16);
  const archive = Buffer.concat([local, name, compressed, central, name, end]);
  assert.equal(unzipEntry(archive, 'cities15000.txt').toString(), cities);
  assert.throws(() => unzipEntry(gzipSync('x'), 'cities15000.txt'), /Not a zip archive/);
});
