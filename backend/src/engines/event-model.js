// Shared vocabulary and pure rules for events (concerts and festivals):
// wall-clock times in an IANA time zone, effective status, ticket percentages,
// cross-field validation, and calendar exports (ICS and Google Calendar).

export const EVENT_TYPES = ['concert', 'festival', 'other'];
export const EVENT_STATUSES = ['scheduled', 'postponed', 'cancelled'];
export const EFFECTIVE_STATUSES = [...EVENT_STATUSES, 'completed'];
export const VISIBILITIES = ['draft', 'published'];
export const LINEUP_ROLES = ['headliner', 'opener', 'support', 'other'];
export const ATTENDANCE_STATUSES = ['going', 'interested'];
export const COMMUNICATION_KINDS = ['door_open', 'cancellation', 'refund', 'lineup_change', 'postponement', 'general'];
export const SORTS = ['date', 'band', 'organizer', 'location'];
export const ORGANIZER_KINDS = ['organizer', 'booking_agency', 'label', 'band', 'venue'];
export const LIMITS = { organizers: 5, lineup: 50, genres: 10, images: 6, ticketLinks: 5, reminders: 5 };
export const REMINDER_RANGE = { minimum: 5, maximum: 20160 };
// Events without an end time count as finished this long after they start.
export const DEFAULT_DURATION_HOURS = 4;
export const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const HOUR_MS = 60 * 60 * 1000;

const formatters = new Map();

function formatter(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  return formatters.get(timeZone);
}

export function isTimeZone(value) {
  if (typeof value !== 'string' || !value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

// Wall-clock milliseconds (as if UTC) shown in `timeZone` at `instant`.
function wallClock(instant, timeZone) {
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(new Date(instant)).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
}

// Offset of `timeZone` from UTC at `instant`, in minutes (east positive).
export function offsetMinutes(instant, timeZone) {
  const time = new Date(instant).getTime();
  return Math.round((wallClock(time, timeZone) - Math.floor(time / 1000) * 1000) / 60000);
}

// Converts "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone` to a UTC Date.
// Returns null for malformed or impossible dates. Times skipped by a daylight
// saving change resolve to the instant after the gap.
export function zonedToUtc(local, timeZone) {
  const match = LOCAL_DATE_TIME.exec(local ?? '');
  if (!match || !isTimeZone(timeZone)) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  if (Number.isNaN(wall) || new Date(wall).toISOString().slice(0, 16) !== local) return null;
  let utc = wall - offsetMinutes(wall, timeZone) * 60000;
  const corrected = wall - offsetMinutes(utc, timeZone) * 60000;
  if (corrected !== utc) utc = Math.max(utc, corrected);
  return new Date(utc);
}

// Inverse of zonedToUtc: the "YYYY-MM-DDTHH:mm" wall-clock time in `timeZone`.
export function utcToZoned(instant, timeZone) {
  if (instant === null || instant === undefined) return null;
  return new Date(wallClock(new Date(instant).getTime(), timeZone)).toISOString().slice(0, 16);
}

export function effectiveEnd(startsAt, endsAt) {
  return endsAt ? new Date(endsAt) : new Date(new Date(startsAt).getTime() + DEFAULT_DURATION_HOURS * HOUR_MS);
}

// Stored status plus "completed", derived once a non-cancelled event ends.
export function effectiveStatus({ status, startsAt, endsAt }, now = new Date()) {
  if (status === 'cancelled') return 'cancelled';
  return effectiveEnd(startsAt, endsAt) <= now ? 'completed' : status;
}

// Percentage of capacity sold, rounded down so 100 means sold out.
export function ticketsSoldPercent(capacity, sold) {
  if (!Number.isInteger(capacity) || capacity <= 0) return null;
  return Math.min(100, Math.floor((Math.max(0, sold ?? 0) * 100) / capacity));
}

export function isHttpsUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}

const MEDIA_URL = /^\/realm\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isManagedMediaUrl = value => typeof value === 'string' && MEDIA_URL.test(value);

// Cross-field rules on a complete (merged) event in API shape. Types and
// lengths are already checked by the route schema.
export function eventInputErrors(input) {
  const errors = [];
  if (!isTimeZone(input.timezone)) errors.push('Choose a valid time zone, for example Europe/Rome');
  else {
    const start = zonedToUtc(input.startsAt, input.timezone);
    if (!start) errors.push('Enter a valid start date and time');
    const end = input.endsAt ? zonedToUtc(input.endsAt, input.timezone) : null;
    if (input.endsAt && !end) errors.push('Enter a valid end date and time');
    if (start && end && end <= start) errors.push('The event must end after it starts');
    const doors = input.doorsOpenAt ? zonedToUtc(input.doorsOpenAt, input.timezone) : null;
    if (input.doorsOpenAt && !doors) errors.push('Enter a valid doors-open time');
    if (start && doors && doors > start) errors.push('Doors must open before the event starts');
    for (const [index, entry] of (input.lineup ?? []).entries()) {
      const setStart = entry.setStartsAt ? zonedToUtc(entry.setStartsAt, input.timezone) : null;
      const setEnd = entry.setEndsAt ? zonedToUtc(entry.setEndsAt, input.timezone) : null;
      if ((entry.setStartsAt && !setStart) || (entry.setEndsAt && !setEnd)) errors.push(`Lineup entry ${index + 1} has an invalid set time`);
      else if (setStart && setEnd && setEnd <= setStart) errors.push(`Lineup entry ${index + 1} must end its set after it starts`);
    }
  }
  for (const [index, entry] of (input.lineup ?? []).entries()) {
    const references = [entry.bandId, entry.artistId, entry.name?.trim() || null].filter(value => value !== null && value !== undefined);
    if (references.length !== 1) errors.push(`Lineup entry ${index + 1} needs exactly one band, artist, or name`);
  }
  if ((input.latitude === null || input.latitude === undefined) !== (input.longitude === null || input.longitude === undefined)) {
    errors.push('Latitude and longitude must be provided together');
  }
  if (input.ticketsSold && (input.capacity === null || input.capacity === undefined)) errors.push('Set the capacity before tickets sold');
  if (Number.isInteger(input.capacity) && Number.isInteger(input.ticketsSold) && input.ticketsSold > input.capacity) {
    errors.push('Tickets sold cannot exceed the capacity');
  }
  for (const link of input.ticketLinks ?? []) {
    if (!isHttpsUrl(link.url)) errors.push('Ticket links must be https:// addresses');
  }
  for (const url of input.images ?? []) if (!isManagedMediaUrl(url)) errors.push('Upload event images with this account');
  if (new Set((input.images ?? []).map(url => url.toLowerCase())).size !== (input.images ?? []).length) errors.push('Each image can be added once');
  if (!String(input.title ?? '').trim() || String(input.title).trim().length < 3) errors.push('The title needs at least three characters');
  return [...new Set(errors)];
}

export function reminderOffsetsError(offsets) {
  if (offsets.length > LIMITS.reminders) return `Choose at most ${LIMITS.reminders} reminders`;
  if (new Set(offsets).size !== offsets.length) return 'Each reminder time can be chosen once';
  if (offsets.some(value => !Number.isInteger(value) || value < REMINDER_RANGE.minimum || value > REMINDER_RANGE.maximum)) {
    return 'Reminders can be set from 5 minutes to 14 days before the event';
  }
  return null;
}

// RFC 5545 TEXT escaping: backslash, semicolon, comma, and line breaks.
export function escapeIcsText(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Folds a content line at 75 octets without splitting UTF-8 characters.
export function foldIcsLine(line) {
  const output = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character);
    const limit = output.length ? 74 : 75;
    if (bytes + size > limit) {
      output.push(current);
      current = '';
      bytes = 0;
    }
    current += character;
    bytes += size;
  }
  output.push(current);
  return output.join('\r\n ');
}

const pad = value => String(value).padStart(2, '0');
const utcStamp = instant => new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const localStamp = (instant, timeZone) => `${utcToZoned(instant, timeZone).replace(/[-:]/g, '')}00`;
const offsetText = minutes => `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}${pad(Math.abs(minutes) % 60)}`;

export function eventLocationText(event) {
  return [event.venue?.name, event.address, event.place?.label].filter(Boolean).join(', ');
}

export function eventPageUrl(origin, id) {
  return `${String(origin || '').replace(/\/$/, '')}/#event?id=${id}`;
}

// One VEVENT for an event. Times use the event's TZID with a single-offset
// VTIMEZONE when the start and end share an offset, otherwise UTC.
export function buildIcs(event, { origin = '', now = new Date() } = {}) {
  const start = new Date(event.startsAt);
  const end = effectiveEnd(event.startsAt, event.endsAt);
  const zone = event.timezone;
  const zoned = isTimeZone(zone) && zone !== 'UTC' && zone !== 'Etc/UTC'
    && offsetMinutes(start, zone) === offsetMinutes(end, zone);
  const url = eventPageUrl(origin, event.id);
  const description = [event.description, url].filter(Boolean).join('\n\n');
  const status = { cancelled: 'CANCELLED', postponed: 'TENTATIVE' }[event.status] || 'CONFIRMED';
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Every.music//Events//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
  ];
  if (zoned) {
    const offset = offsetText(offsetMinutes(start, zone));
    lines.push('BEGIN:VTIMEZONE', `TZID:${zone}`, 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
      `TZOFFSETFROM:${offset}`, `TZOFFSETTO:${offset}`, 'END:STANDARD', 'END:VTIMEZONE');
  }
  lines.push('BEGIN:VEVENT', `UID:${event.id}@every.music`, `DTSTAMP:${utcStamp(now)}`, `SEQUENCE:${Number(event.revision) || 0}`);
  if (zoned) lines.push(`DTSTART;TZID=${zone}:${localStamp(start, zone)}`, `DTEND;TZID=${zone}:${localStamp(end, zone)}`);
  else lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
  if (description) lines.push(`DESCRIPTION:${escapeIcsText(description)}`);
  const location = eventLocationText(event);
  if (location) lines.push(`LOCATION:${escapeIcsText(location)}`);
  if (Number.isFinite(event.coordinates?.latitude) && Number.isFinite(event.coordinates?.longitude)) {
    lines.push(`GEO:${event.coordinates.latitude.toFixed(6)};${event.coordinates.longitude.toFixed(6)}`);
  }
  if (origin) lines.push(`URL:${url}`);
  lines.push(`STATUS:${status}`, 'END:VEVENT', 'END:VCALENDAR');
  return `${lines.map(foldIcsLine).join('\r\n')}\r\n`;
}

// Google Calendar "add event" template link (no account data is sent).
export function googleCalendarUrl(event, { origin = '' } = {}) {
  const start = new Date(event.startsAt);
  const end = effectiveEnd(event.startsAt, event.endsAt);
  const details = [String(event.description ?? '').slice(0, 1500), eventPageUrl(origin, event.id)].filter(Boolean).join('\n\n');
  const query = new URLSearchParams({
    action: 'TEMPLATE', text: event.title, dates: `${utcStamp(start)}/${utcStamp(end)}`, details,
  });
  const location = eventLocationText(event);
  if (location) query.set('location', location);
  if (isTimeZone(event.timezone)) query.set('ctz', event.timezone);
  return `https://calendar.google.com/calendar/render?${query}`;
}

export function safeFileName(title) {
  const base = String(title ?? '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60);
  return `${base || 'event'}.ics`;
}
