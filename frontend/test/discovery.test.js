import test from 'node:test';
import assert from 'node:assert/strict';
import { describeFilters, savedSearchFilters, savedSearchLink, searchQuery } from '../src/lib/discovery.js';
import { currentPosition, locationEnabled, setLocationEnabled } from '../src/lib/geolocation.js';

const namespaces = ['places', 'profileExtras', 'adExtras', 'discoveryExtras'];
const base = { searchTerm: '', city: '', instrumentId: '', genreId: '', isRemote: '', createdWithin: '', sort: 'newest',
  isCoverBand: '', openToProjects: '', placeId: '', placeLabel: '', radiusKm: '', country: '', region: '' };

test('search queries send a place or browser coordinates, never the place label', () => {
  const query = new URLSearchParams(searchQuery({ ...base, placeId: '3173435', placeLabel: 'Milan, Lombardy, Italy', radiusKm: '50', sort: 'distance', isCoverBand: 'true' }));
  assert.equal(query.get('placeId'), '3173435');
  assert.equal(query.get('radiusKm'), '50');
  assert.equal(query.get('sort'), 'distance');
  assert.equal(query.get('isCoverBand'), 'true');
  assert.equal(query.has('placeLabel'), false);
  const near = new URLSearchParams(searchQuery({ ...base, placeId: '1', radiusKm: '10' }, { nearMe: { latitude: 45.46, longitude: 9.19 } }));
  assert.deepEqual([near.get('latitude'), near.get('longitude'), near.has('placeId')], ['45.46', '9.19', false]);
});

test('distance options are dropped without a center and kinds keep their own filters', () => {
  const query = new URLSearchParams(searchQuery({ ...base, radiusKm: '50', sort: 'distance', openToProjects: 'true', isRemote: 'true' }, { profiles: true }));
  assert.equal(query.has('radiusKm'), false);
  assert.equal(query.get('sort'), 'newest');
  assert.equal(query.get('openToProjects'), 'true');
  assert.equal(query.has('isRemote'), false);
});

test('saved search bodies use typed values and keep only non-empty filters', () => {
  assert.deepEqual(savedSearchFilters({ ...base, searchTerm: ' drums ', isCoverBand: 'false', placeId: '42', radiusKm: '25', country: 'IT' }), {
    searchTerm: 'drums', country: 'IT', isCoverBand: false, placeId: 42, radiusKm: 25,
  });
  assert.deepEqual(savedSearchFilters({ ...base, radiusKm: '25' }, { latitude: 1.5, longitude: 2.5 }), { latitude: 1.5, longitude: 2.5, radiusKm: 25 });
  assert.deepEqual(savedSearchFilters(base), {});
  assert.equal(savedSearchLink({ filters: { placeId: 42, placeLabel: 'Milan', radiusKm: 25, isCoverBand: true } }),
    '#feed?placeId=42&placeLabel=Milan&radiusKm=25&isCoverBand=true');
});

test('filter summaries name catalog entries and distances', () => {
  const t = (key, params = {}) => `${key.split('.').pop()}${params.place ? `:${params.distance ?? ''}:${params.place}` : ''}`;
  assert.equal(describeFilters({ instrumentId: 'a', isCoverBand: true, placeLabel: 'Milan', radiusKm: 50 }, { instruments: [{ id: 'a', name: 'Drums' }] }, t),
    'Drums · coverBand · within:50:Milan');
});

test('the location preference is opt-in and positions are rounded', async () => {
  const values = new Map();
  const store = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  assert.equal(locationEnabled(store), false);
  assert.equal(setLocationEnabled(true, store), true);
  assert.equal(locationEnabled(store), true);
  setLocationEnabled(false, store);
  assert.equal(locationEnabled(store), false);
  const geolocation = { getCurrentPosition: (resolve) => resolve({ coords: { latitude: 45.464271, longitude: 9.189512 } }) };
  assert.deepEqual(await currentPosition({ geolocation }), { latitude: 45.46, longitude: 9.19 });
  await assert.rejects(currentPosition({ geolocation: { getCurrentPosition: (_, reject) => reject({ code: 1 }) } }), { code: 'denied' });
  await assert.rejects(currentPosition({ geolocation: null }), { code: 'unsupported' });
});

function shape(value, prefix = '') {
  if (typeof value === 'string') return [prefix];
  if (value && ['one', 'other'].every(key => typeof value[key] === 'string')) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => shape(child, prefix ? `${prefix}.${key}` : key));
}

test('Dutch and Italian translate every new English key without em dashes', async () => {
  for (const namespace of namespaces) {
    const [en, nl, it] = await Promise.all(['en', 'nl', 'it'].map(async locale => (await import(`../src/locales/${locale}/${namespace}.js`)).default));
    assert.deepEqual(shape(nl), shape(en), `nl/${namespace}`);
    assert.deepEqual(shape(it), shape(en), `it/${namespace}`);
    for (const catalog of [en, nl, it]) assert.equal(JSON.stringify(catalog).includes('\u2014'), false);
  }
});
