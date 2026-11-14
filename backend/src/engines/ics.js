// iCalendar (RFC 5545) output for calendar entries: TEXT escaping, UTF-8
// aware line folding at 75 octets, and CRLF line endings.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function escapeText(value) {
  return String(value ?? '')
    .replace(CONTROL, '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Splits a content line into 75-octet lines without breaking UTF-8 sequences;
// continuation lines start with one space, which counts toward the limit.
export function foldLine(line) {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const lines = [];
  let current = '';
  let size = 0;
  let limit = 75;
  for (const character of line) {
    const length = Buffer.byteLength(character, 'utf8');
    if (size + length > limit) {
      lines.push(current);
      current = '';
      size = 0;
      limit = 74;
    }
    current += character;
    size += length;
  }
  lines.push(current);
  return lines.join('\r\n ');
}

export function formatUtc(value) {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

const KIND_LABELS = { rehearsal: 'Rehearsal', gig: 'Gig', recording: 'Recording', meeting: 'Meeting', other: 'Other' };

function eventLines(entry, { origin, domain }) {
  const location = [entry.place?.label, entry.address].filter(Boolean).join(' - ');
  const description = [
    entry.notes,
    entry.organization ? `Band: ${entry.organization.name}` : null,
    `Type: ${KIND_LABELS[entry.kind] ?? entry.kind}`,
    `Time zone: ${entry.timeZone}`,
    origin ? `Details: ${origin}/#calendar-entry?id=${entry.id}` : null,
  ].filter(Boolean).join('\n');
  const lines = [
    'BEGIN:VEVENT',
    `UID:${entry.id}@${domain}`,
    `DTSTAMP:${formatUtc(entry.updatedAt)}`,
    `CREATED:${formatUtc(entry.createdAt)}`,
    `LAST-MODIFIED:${formatUtc(entry.updatedAt)}`,
    `SEQUENCE:${entry.sequence}`,
    `DTSTART:${formatUtc(entry.startsAt)}`,
    `DTEND:${formatUtc(entry.endsAt)}`,
    `SUMMARY:${escapeText(entry.title)}`,
    `DESCRIPTION:${escapeText(description)}`,
  ];
  if (location) lines.push(`LOCATION:${escapeText(location)}`);
  if (entry.place && Number.isFinite(entry.place.latitude) && Number.isFinite(entry.place.longitude)) {
    lines.push(`GEO:${entry.place.latitude.toFixed(6)};${entry.place.longitude.toFixed(6)}`);
  }
  lines.push(`CATEGORIES:${escapeText(KIND_LABELS[entry.kind] ?? entry.kind)}`);
  lines.push(`STATUS:${entry.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`);
  if (origin) lines.push(`URL:${origin}/#calendar-entry?id=${entry.id}`);
  lines.push('TRANSP:OPAQUE', 'END:VEVENT');
  return lines;
}

// Builds a VCALENDAR document. `origin` is the web app origin used for links;
// `name` is the calendar display name for subscriptions.
export function buildCalendar(entries, { name = 'Every.music', origin = '', domain = 'every.music' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Every.music//Band calendar 1.0//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    ...entries.flatMap(entry => eventLines(entry, { origin: origin.replace(/\/$/, ''), domain })),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
