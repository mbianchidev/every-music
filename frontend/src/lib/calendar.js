import conduit from './conduit.js';
import { saveFile } from './download.js';

export const CALENDAR_KINDS = ['rehearsal', 'gig', 'recording', 'meeting', 'other'];
export const CALENDAR_RESPONSES = ['yes', 'maybe', 'no'];
export const REMINDER_OFFSETS = [0, 15, 30, 60, 120, 1440, 2880, 10080];
export const MAX_REMINDERS = 3;

export function localTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}

export function timeZones(current) {
  let zones = [];
  try { zones = Intl.supportedValuesOf('timeZone'); } catch { zones = []; }
  return [...new Set(['UTC', ...zones, ...(current ? [current] : [])])].sort();
}

const compactUtc = value => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const placeText = entry => [entry.address, entry.place?.label].filter(Boolean).join(', ');

// Map search links for an entry's place and address. No embedded maps and no
// API keys: the links open OpenStreetMap or Google Maps in a new tab.
export function mapLinks(entry) {
  const text = placeText(entry);
  const coordinates = entry.place && Number.isFinite(entry.place.latitude) && Number.isFinite(entry.place.longitude)
    ? [entry.place.latitude.toFixed(6), entry.place.longitude.toFixed(6)] : null;
  if (!text && !coordinates) return null;
  const query = entry.address ? text : coordinates?.join(',') ?? text;
  return {
    openStreetMap: entry.address || !coordinates
      ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(text)}`
      : `https://www.openstreetmap.org/?mlat=${coordinates[0]}&mlon=${coordinates[1]}#map=15/${coordinates[0]}/${coordinates[1]}`,
    googleMaps: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`,
  };
}

// "Add to Google Calendar" template link for one entry.
export function googleCalendarLink(entry, origin = globalThis.location?.origin ?? '') {
  const details = [entry.notes, origin ? `${origin}/#calendar-entry?id=${entry.id}` : null].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE', text: entry.title, dates: `${compactUtc(entry.startsAt)}/${compactUtc(entry.endsAt)}`, ctz: entry.timeZone,
  });
  if (details) params.set('details', details);
  if (placeText(entry)) params.set('location', placeText(entry));
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Absolute subscription URLs for a private feed token.
export function feedLinks(token, baseUrl = conduit.baseUrl, page = globalThis.location?.href ?? 'http://localhost/') {
  const https = new URL(`${baseUrl}/calendar/feeds/${token}.ics`, page).href;
  const webcal = https.replace(/^https?:/, 'webcal:');
  return { https, webcal, google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}` };
}

export function formatEntryTime(entry, locale, timeZone = entry.timeZone) {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone });
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short', timeZone });
  const sameDay = date.format(new Date(entry.startsAt)) === date.format(new Date(entry.endsAt));
  const start = `${date.format(new Date(entry.startsAt))} ${time.format(new Date(entry.startsAt))}`;
  const end = sameDay ? time.format(new Date(entry.endsAt)) : `${date.format(new Date(entry.endsAt))} ${time.format(new Date(entry.endsAt))}`;
  return `${start} - ${end}`;
}

export function blankEntry(organizationId = null) {
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  start.setHours(19);
  const pad = value => String(value).padStart(2, '0');
  const local = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return {
    organizationId, kind: 'rehearsal', title: '', startLocal: local(start), endLocal: local(new Date(start.getTime() + 2 * 60 * 60 * 1000)),
    timeZone: localTimeZone(), place: null, placeText: '', address: '', notes: '', invitees: [], reminderOffsets: [60],
  };
}

export function entryDraft(entry) {
  return {
    organizationId: entry.organization?.id ?? null, kind: entry.kind, title: entry.title, startLocal: entry.startLocal,
    endLocal: entry.endLocal, timeZone: entry.timeZone, place: entry.place ? { id: entry.place.id, label: entry.place.label } : null,
    placeText: '', address: entry.address ?? '', notes: entry.notes ?? '', invitees: [], reminderOffsets: entry.viewer?.reminders ?? [],
  };
}

export function entryBody(draft, { creating = false } = {}) {
  const body = {
    kind: draft.kind, title: draft.title.trim(), startLocal: draft.startLocal.slice(0, 16), endLocal: draft.endLocal.slice(0, 16), timeZone: draft.timeZone,
    placeId: draft.place?.id ?? null, address: draft.address.trim() || null, notes: draft.notes.trim() || null,
  };
  if (creating) {
    if (draft.organizationId) body.organizationId = draft.organizationId;
    body.inviteeIds = draft.invitees.map(person => person.id);
    body.reminderOffsets = draft.reminderOffsets;
  }
  return body;
}

export async function downloadEntryIcs(entry, transport = conduit) {
  const response = await transport.transmit(`/calendar/entries/${entry.id}/ics`, { auth: true, stream: true });
  saveFile(`every-music-${entry.id}.ics`, await response.text(), 'text/calendar');
}
