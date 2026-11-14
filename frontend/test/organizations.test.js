import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import en from '../src/locales/en/organizations.js';
import nl from '../src/locales/nl/organizations.js';
import it from '../src/locales/it/organizations.js';
import { mapLinks, optionalNumber, organizationBody } from '../src/lib/organizations.js';

function keys(value, prefix = '') {
  return Object.entries(value).flatMap(([key, item]) => (typeof item === 'object' && !('other' in item)
    ? keys(item, `${prefix}${key}.`) : [`${prefix}${key}`]));
}

async function sources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => (entry.isDirectory()
    ? sources(join(directory, entry.name)) : /\.(jsx?|mjs)$/.test(entry.name) ? [join(directory, entry.name)] : [])));
  return files.flat();
}

test('organization catalogs have the same keys in every locale and cover static keys used by the UI', async () => {
  const expected = keys(en).sort();
  assert.deepEqual(keys(nl).sort(), expected);
  assert.deepEqual(keys(it).sort(), expected);
  const root = fileURLToPath(new URL('../src/', import.meta.url));
  const used = new Set();
  for (const file of await sources(root)) {
    // `organizations.changed` is a live-update event name, not a message key.
    for (const match of (await readFile(file, 'utf8')).matchAll(/['`]organizations\.(?!changed['`])([\w.]+)['`]/g)) used.add(match[1]);
  }
  const missing = [...used].filter(key => !expected.includes(key) && !expected.some(item => item.startsWith(`${key}.`)));
  assert.deepEqual(missing, []);
  for (const catalog of [en, nl, it]) assert.equal(JSON.stringify(catalog).includes('\u2014'), false);
});

test('map links use OpenStreetMap and need both coordinates', () => {
  assert.deepEqual(mapLinks({ latitude: 52.37, longitude: 4.9 }), {
    map: 'https://www.openstreetmap.org/?mlat=52.370000&mlon=4.900000#map=16/52.370000/4.900000',
    directions: 'https://www.openstreetmap.org/directions?route=%3B52.370000%2C4.900000',
  });
  assert.equal(mapLinks({ latitude: 52.37 }), null);
  assert.equal(mapLinks(null), null);
});

test('editor bodies send only fields that apply to the kind and flag invalid numbers', () => {
  const draft = {
    kind: 'band', managed: true, name: ' Synthetic ', slug: ' Synth-Band ', title: '', bio: ' ', pictureUrl: null, city: 'Milan', region: '', country: '',
    latitude: '', longitude: '', contactEmail: '', contactPhone: '', workWithUs: 'ignored', venueType: 'club', capacity: '20', activeSince: '',
    activeUntil: '', parkingInfo: 'ignored', directions: '', formedYear: '2019', youtubeChannelId: '', openTo: { tours: true },
    genreIds: [], links: [{ linkType: 'website', url: ' https://example.test ' }, { linkType: 'other', url: ' ' }],
  };
  const { body, invalid } = organizationBody(draft, true);
  assert.deepEqual(invalid, []);
  assert.equal(body.name, 'Synthetic');
  assert.equal(body.slug, 'synth-band');
  assert.equal(body.bio, null);
  assert.equal(body.formedYear, 2019);
  assert.deepEqual(body.links, [{ linkType: 'website', url: 'https://example.test' }]);
  assert.equal('capacity' in body, false);
  assert.equal('workWithUs' in body, false);
  assert.equal('managed' in body, false);
  assert.equal(body.kind, 'band');
  const venue = organizationBody({ ...draft, kind: 'venue', managed: false, capacity: 'many' }, false);
  assert.deepEqual(venue.invalid, ['capacity']);
  assert.equal('kind' in venue.body, false);
  assert.equal('formedYear' in venue.body, false);
  assert.equal(venue.body.parkingInfo, 'ignored');
  assert.equal(optionalNumber(''), null);
  assert.equal(optionalNumber('4.5'), 4.5);
});
