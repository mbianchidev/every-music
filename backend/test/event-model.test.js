import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIcs, effectiveStatus, escapeIcsText, eventInputErrors, foldIcsLine, googleCalendarUrl, isHttpsUrl, isTimeZone,
  offsetMinutes, reminderOffsetsError, safeFileName, ticketsSoldPercent, utcToZoned, zonedToUtc,
} from '../src/engines/event-model.js';

const base = {
  title: 'Synthetic Night', timezone: 'Europe/Rome', startsAt: '2026-12-01T20:00', lineup: [{ role: 'headliner', name: 'Band' }],
};

test('wall-clock times convert through IANA time zones, including daylight saving changes', () => {
  assert.equal(zonedToUtc('2026-12-01T20:00', 'Europe/Rome').toISOString(), '2026-12-01T19:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-01T20:00', 'Europe/Rome').toISOString(), '2026-07-01T18:00:00.000Z');
  assert.equal(zonedToUtc('2026-07-01T20:00', 'America/New_York').toISOString(), '2026-07-02T00:00:00.000Z');
  assert.equal(zonedToUtc('2026-01-15T09:30', 'Asia/Kolkata').toISOString(), '2026-01-15T04:00:00.000Z');
  assert.equal(zonedToUtc('2026-03-29T02:30', 'Europe/Rome').toISOString(), '2026-03-29T01:30:00.000Z');
  assert.equal(zonedToUtc('2026-02-30T20:00', 'Europe/Rome'), null);
  assert.equal(zonedToUtc('2026-12-01 20:00', 'Europe/Rome'), null);
  assert.equal(zonedToUtc('2026-12-01T20:00', 'Mars/Olympus'), null);
  assert.equal(utcToZoned('2026-12-01T19:00:00Z', 'Europe/Rome'), '2026-12-01T20:00');
  assert.equal(utcToZoned('2026-07-02T00:00:00Z', 'America/New_York'), '2026-07-01T20:00');
  assert.equal(offsetMinutes('2026-07-01T00:00:00Z', 'Europe/Rome'), 120);
  assert.equal(isTimeZone('Europe/Amsterdam'), true);
  assert.equal(isTimeZone('Europe/Amsterdam; DROP'), false);
});

test('status, ticket percentages and https links follow the event rules', () => {
  const now = new Date('2026-12-02T12:00:00Z');
  assert.equal(effectiveStatus({ status: 'scheduled', startsAt: '2026-12-01T19:00:00Z' }, now), 'completed');
  assert.equal(effectiveStatus({ status: 'scheduled', startsAt: '2026-12-02T10:00:00Z' }, now), 'scheduled');
  assert.equal(effectiveStatus({ status: 'scheduled', startsAt: '2026-12-01T19:00:00Z', endsAt: '2026-12-03T00:00:00Z' }, now), 'scheduled');
  assert.equal(effectiveStatus({ status: 'cancelled', startsAt: '2026-11-01T19:00:00Z' }, now), 'cancelled');
  assert.equal(effectiveStatus({ status: 'postponed', startsAt: '2026-11-01T19:00:00Z' }, now), 'completed');
  assert.equal(ticketsSoldPercent(300, 299), 99);
  assert.equal(ticketsSoldPercent(300, 300), 100);
  assert.equal(ticketsSoldPercent(null, 0), null);
  assert.equal(isHttpsUrl('https://tickets.example.test/show'), true);
  assert.equal(isHttpsUrl('http://tickets.example.test/show'), false);
  assert.equal(isHttpsUrl('javascript:alert(1)'), false);
  assert.equal(isHttpsUrl('https://user:secret@tickets.example.test'), false);
});

test('cross-field validation reports every problem on the merged event', () => {
  assert.deepEqual(eventInputErrors(base), []);
  const errors = eventInputErrors({
    ...base, endsAt: '2026-12-01T19:00', doorsOpenAt: '2026-12-01T21:00', capacity: 100, ticketsSold: 101,
    latitude: 45, ticketLinks: [{ label: 'Shop', url: 'http://insecure.example.test' }], images: ['https://elsewhere.example.test/x.png'],
    lineup: [{ role: 'headliner', name: 'A', bandId: '00000000-0000-4000-8000-000000000000' }, { role: 'opener', name: 'B', setStartsAt: '2026-12-01T22:00', setEndsAt: '2026-12-01T21:00' }],
  });
  for (const expected of ['end after it starts', 'Doors must open', 'exceed the capacity', 'provided together', 'https://', 'Upload event images',
    'exactly one band', 'end its set']) {
    assert.ok(errors.some(error => error.includes(expected)), `${expected} in ${errors.join(' | ')}`);
  }
  assert.ok(eventInputErrors({ ...base, ticketsSold: 5 }).some(error => error.includes('capacity')));
  assert.ok(eventInputErrors({ ...base, timezone: 'Nowhere/Land' }).some(error => error.includes('time zone')));
  assert.equal(reminderOffsetsError([60, 1440]), null);
  assert.match(reminderOffsetsError([60, 60]), /once/);
  assert.match(reminderOffsetsError([1]), /5 minutes/);
  assert.match(reminderOffsetsError([5, 10, 15, 20, 25, 30]), /at most/);
});

test('calendar exports escape text, fold long lines and keep the event time zone', () => {
  assert.equal(escapeIcsText('Doors; bar, merch\\stage\nline'), 'Doors\\; bar\\, merch\\\\stage\\nline');
  const long = `DESCRIPTION:${'é'.repeat(80)}`;
  const folded = foldIcsLine(long);
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75, line);
  assert.equal(folded.split('\r\n').map((line, index) => (index ? line.slice(1) : line)).join(''), long);
  const event = {
    id: '11111111-2222-4333-8444-555555555555', title: 'Synthetic, Night; Live', description: 'Line one\nLine two',
    startsAt: '2026-12-01T19:00:00Z', endsAt: '2026-12-01T22:30:00Z', timezone: 'Europe/Rome', status: 'postponed', revision: 3,
    venue: { name: 'Synthetic Club' }, address: 'Via Example 1', place: { label: 'Milan, Lombardy, Italy' },
    coordinates: { latitude: 45.4642, longitude: 9.19 },
  };
  const ics = buildIcs(event, { origin: 'https://app.example.test', now: new Date('2026-11-14T10:00:00Z') });
  assert.ok(ics.endsWith('\r\n'));
  assert.match(ics, /\r\nTZID:Europe\/Rome\r\n/);
  assert.match(ics, /TZOFFSETTO:\+0100/);
  assert.match(ics, /DTSTART;TZID=Europe\/Rome:20261201T200000/);
  assert.match(ics, /DTEND;TZID=Europe\/Rome:20261201T233000/);
  assert.match(ics, /SUMMARY:Synthetic\\, Night\\; Live/);
  assert.match(ics, /DESCRIPTION:Line one\\nLine two/);
  assert.match(ics, /STATUS:TENTATIVE/);
  assert.match(ics, /SEQUENCE:3/);
  assert.match(ics, /GEO:45\.464200;9\.190000/);
  assert.match(ics, /DTSTAMP:20261114T100000Z/);
  const utc = buildIcs({ ...event, timezone: 'Europe/Rome', startsAt: '2026-10-24T22:00:00Z', endsAt: '2026-10-25T03:00:00Z', status: 'cancelled' });
  assert.match(utc, /DTSTART:20261024T220000Z/);
  assert.doesNotMatch(utc, /VTIMEZONE/);
  assert.match(utc, /STATUS:CANCELLED/);
  const google = new URL(googleCalendarUrl(event, { origin: 'https://app.example.test' }));
  assert.equal(google.origin, 'https://calendar.google.com');
  assert.equal(google.searchParams.get('dates'), '20261201T190000Z/20261201T223000Z');
  assert.equal(google.searchParams.get('ctz'), 'Europe/Rome');
  assert.match(google.searchParams.get('details'), /#event\?id=11111111/);
  assert.equal(safeFileName('Synthetic Night: Live!'), 'synthetic-night-live.ics');
});
