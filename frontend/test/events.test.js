import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarFileName, draftToBody, emptyDraft, eventToDraft, lineupByRole, organizerNames, reminderAvailable } from '../src/lib/events.js';
import enEvents from '../src/locales/en/events.js';
import nlEvents from '../src/locales/nl/events.js';
import itEvents from '../src/locales/it/events.js';
import enVerification from '../src/locales/en/organizationVerification.js';
import nlVerification from '../src/locales/nl/organizationVerification.js';
import itVerification from '../src/locales/it/organizationVerification.js';

const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => (
  typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`]
)).sort();
const read = (source, key) => key.split('.').reduce((value, part) => value[part], source);
const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();

test('event and page verification translations cover every English key with matching placeholders', () => {
  for (const [english, others] of [[enEvents, { nlEvents, itEvents }], [enVerification, { nlVerification, itVerification }]]) {
    for (const [name, catalog] of Object.entries(others)) {
      assert.deepEqual(keys(catalog), keys(english), `${name} keys`);
      for (const key of keys(english)) assert.deepEqual(placeholders(read(catalog, key)), placeholders(read(english, key)), `${name} ${key}`);
    }
  }
});

const event = {
  id: 'e1', title: 'Synthetic Night', type: 'festival', description: null, timezone: 'Europe/Rome', startsAt: '2026-12-01T19:00:00.000Z',
  local: { startsAt: '2026-12-01T20:00', endsAt: null, doorsOpenAt: '2026-12-01T19:00' },
  venue: { id: 'v1', name: 'Synthetic Hall' }, place: null, address: 'Via Example 1', explicitCoordinates: null,
  capacity: 300, ticketsSold: 120, organizers: [], owner: { userId: 'u1', name: 'Solo Artist' },
  lineup: [
    { id: 'l1', role: 'opener', name: 'Opening Act', band: null, artist: null, local: { setStartsAt: null, setEndsAt: null } },
    { id: 'l2', role: 'headliner', name: 'Band', band: { id: 'b1' }, artist: null, local: { setStartsAt: '2026-12-01T22:00', setEndsAt: null } },
  ],
  ticketLinks: [{ label: 'Shop', url: 'https://tickets.example.test' }], genres: [{ id: 'g1', name: 'Rock' }], images: [], visibility: 'published',
};

test('editor drafts round-trip events into API bodies', () => {
  const draft = eventToDraft(event);
  const { body, error } = draftToBody(draft);
  assert.equal(error, undefined);
  assert.equal(body.startsAt, '2026-12-01T20:00');
  assert.equal(body.endsAt, null);
  assert.equal(body.venueId, 'v1');
  assert.equal(body.capacity, 300);
  assert.equal(body.ticketsSold, 120);
  assert.deepEqual(body.lineup.map(entry => [entry.role, entry.bandId, entry.name]), [['opener', null, 'Opening Act'], ['headliner', 'b1', null]]);
  assert.equal(body.lineup[1].setStartsAt, '2026-12-01T22:00');
  assert.equal(draftToBody({ ...draft, title: 'ab' }).error, 'title');
  assert.equal(draftToBody({ ...draft, endsAt: '2026-12-01T19:00' }).error, 'end');
  assert.equal(draftToBody({ ...draft, doorsOpenAt: '2026-12-01T21:00' }).error, 'doors');
  assert.equal(draftToBody({ ...draft, ticketsSold: '301' }).error, 'oversold');
  assert.equal(draftToBody({ ...draft, capacity: '', ticketsSold: '5' }).error, 'capacityRequired');
  assert.equal(draftToBody({ ...draft, latitude: '45' }).error, 'coordinates');
  assert.equal(draftToBody({ ...draft, ticketLinks: [{ label: 'Shop', url: 'http://tickets.example.test' }] }).error, 'ticketLinks');
  assert.equal(draftToBody({ ...draft, lineup: [{ role: 'support', name: ' ', bandId: null, artistId: null }] }).error, 'lineupName');
  assert.equal(draftToBody({ ...emptyDraft('UTC'), title: 'Untimed' }).error, 'start');
});

test('event helpers group the lineup, name organizers and gate reminders', () => {
  assert.deepEqual(lineupByRole(event.lineup).map(group => group.role), ['headliner', 'opener']);
  assert.deepEqual(organizerNames(event), ['Solo Artist']);
  assert.deepEqual(organizerNames({ ...event, organizers: [{ name: 'Promoter' }] }), ['Promoter']);
  assert.equal(reminderAvailable(event, 60, Date.parse('2026-12-01T17:00:00Z')), true);
  assert.equal(reminderAvailable(event, 1440, Date.parse('2026-12-01T17:00:00Z')), false);
  assert.equal(calendarFileName('Synthetic Night: Live!'), 'synthetic-night-live.ics');
});
