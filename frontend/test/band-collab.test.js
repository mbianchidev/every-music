import test from 'node:test';
import assert from 'node:assert/strict';
import { blankEntry, changedFields, entryBody, feedLinks, formatEntryTime, googleCalendarLink, mapLinks, timeZones } from '../src/lib/calendar.js';
import { attachmentFits, attachmentTypeOf } from '../src/lib/band-chat.js';
import { ATTACHMENT_TYPES } from '../src/lib/attachment-types.js';

const entry = {
  id: '2b5f1f9e-3d3a-4c7a-9a52-0f6f1e1d2c3b', title: 'Rehearsal & sound check', notes: 'Bring cables',
  startsAt: '2026-07-10T17:30:00.000Z', endsAt: '2026-07-10T19:30:00.000Z', timeZone: 'Europe/Rome',
  address: 'Via Example 1', place: { id: 3173435, label: 'Milan, Lombardy, Italy', latitude: 45.46427, longitude: 9.18951 },
};

test('map links search by address or point at the place, without API keys', () => {
  const withAddress = mapLinks(entry);
  assert.equal(withAddress.openStreetMap, 'https://www.openstreetmap.org/search?query=Via%20Example%201%2C%20Milan%2C%20Lombardy%2C%20Italy');
  assert.equal(withAddress.googleMaps, 'https://www.google.com/maps/search/?api=1&query=Via%20Example%201%2C%20Milan%2C%20Lombardy%2C%20Italy');
  const placeOnly = mapLinks({ ...entry, address: null });
  assert.equal(placeOnly.openStreetMap, 'https://www.openstreetmap.org/?mlat=45.464270&mlon=9.189510#map=15/45.464270/9.189510');
  assert.equal(placeOnly.googleMaps, 'https://www.google.com/maps/search/?api=1&query=45.464270%2C9.189510');
  assert.equal(mapLinks({ ...entry, address: null, place: null }), null);
});

test('Google Calendar template links and private feed links', () => {
  const link = new URL(googleCalendarLink(entry, 'https://app.example.test'));
  assert.equal(link.origin + link.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(link.searchParams.get('action'), 'TEMPLATE');
  assert.equal(link.searchParams.get('text'), 'Rehearsal & sound check');
  assert.equal(link.searchParams.get('dates'), '20260710T173000Z/20260710T193000Z');
  assert.equal(link.searchParams.get('ctz'), 'Europe/Rome');
  assert.equal(link.searchParams.get('location'), 'Via Example 1, Milan, Lombardy, Italy');
  assert.match(link.searchParams.get('details'), /Bring cables\n\nhttps:\/\/app\.example\.test\/#calendar-entry\?id=2b5f1f9e/);
  const token = 'A'.repeat(43);
  const relative = feedLinks(token, '/realm', 'https://app.example.test/#settings');
  assert.equal(relative.https, `https://app.example.test/realm/calendar/feeds/${token}.ics`);
  assert.equal(relative.webcal, `webcal://app.example.test/realm/calendar/feeds/${token}.ics`);
  assert.equal(new URL(relative.google).searchParams.get('cid'), relative.webcal);
  assert.equal(feedLinks(token, 'https://api.example.test/realm', 'tauri://localhost/').https, `https://api.example.test/realm/calendar/feeds/${token}.ics`);
});

test('entry drafts become API bodies and times format in the entry time zone', () => {
  const draft = { ...blankEntry('band-1'), title: '  Gig  ', address: ' ', notes: 'Notes', startLocal: '2026-07-10T19:30:00', endLocal: '2026-07-10T21:30',
    place: { id: 7, label: 'Somewhere' }, invitees: [{ id: 'user-2', label: 'Guest' }], reminderOffsets: [15] };
  assert.deepEqual(entryBody(draft, { creating: true }), {
    kind: 'rehearsal', title: 'Gig', startLocal: '2026-07-10T19:30', endLocal: '2026-07-10T21:30', timeZone: draft.timeZone,
    placeId: 7, address: null, notes: 'Notes', organizationId: 'band-1', inviteeIds: ['user-2'], reminderOffsets: [15],
  });
  assert.equal('inviteeIds' in entryBody(draft), false);
  const original = entryBody(draft);
  assert.deepEqual(changedFields({ ...original, notes: 'Changed' }, original), { notes: 'Changed' });
  assert.deepEqual(changedFields({ ...original, endLocal: '2026-07-10T22:00' }, original),
    { startLocal: original.startLocal, endLocal: '2026-07-10T22:00', timeZone: original.timeZone });
  assert.deepEqual(changedFields(original, original), {});
  assert.match(formatEntryTime(entry, 'en-GB'), /^Friday,? 10 July 2026 19:30 - 21:30$/);
  assert.match(formatEntryTime(entry, 'en-GB', 'UTC'), /17:30 - 19:30$/);
  assert.ok(timeZones('Mars/Base').includes('Mars/Base'));
  assert.ok(timeZones().includes('UTC'));
});

test('attachments are limited to known audio and image types and the configured size', () => {
  assert.equal(attachmentTypeOf({ type: 'audio/mpeg', name: 'take.mp3' }, ATTACHMENT_TYPES), 'audio/mpeg');
  assert.equal(attachmentTypeOf({ type: '', name: 'Take.M4A' }, ATTACHMENT_TYPES), 'audio/mp4');
  assert.equal(attachmentTypeOf({ type: 'image/svg+xml', name: 'logo.svg' }, ATTACHMENT_TYPES), null);
  assert.equal(attachmentTypeOf({ type: 'application/pdf', name: 'rider.pdf' }, ATTACHMENT_TYPES), null);
  assert.equal(attachmentFits({ size: 1024 }, 1052), true);
  assert.equal(attachmentFits({ size: 1025 }, 1052), false);
});

test('band collaboration translations cover every English key with matching placeholders', async () => {
  const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => (
    typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`]
  )).sort();
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const namespace of ['calendar', 'bandChat', 'reviews']) {
    const [en, nl, it] = await Promise.all(['en', 'nl', 'it'].map(async locale => (await import(`../src/locales/${locale}/${namespace}.js`)).default));
    const english = keys(en);
    for (const [locale, catalog] of Object.entries({ nl, it })) {
      assert.deepEqual(keys(catalog), english, `${locale} ${namespace} keys`);
      for (const key of english) {
        const read = source => key.split('.').reduce((value, part) => value[part], source);
        assert.deepEqual(placeholders(read(catalog)), placeholders(read(en)), `${locale} ${namespace}.${key} placeholders`);
      }
    }
  }
});
