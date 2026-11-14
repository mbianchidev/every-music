// Converts between wall-clock times in an IANA time zone and UTC instants
// using the runtime's ICU data, without a date library.
const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const ZONE = /^[A-Za-z][A-Za-z0-9_+/-]{0,63}$/;
const DAY = 24 * 60 * 60 * 1000;
const formatters = new Map();

function formatter(zone) {
  let value = formatters.get(zone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    if (formatters.size >= 500) formatters.clear();
    formatters.set(zone, value);
  }
  return value;
}

export function isTimeZone(zone) {
  if (typeof zone !== 'string' || !ZONE.test(zone)) return false;
  try {
    formatter(zone);
    return true;
  } catch {
    return false;
  }
}

// The wall-clock reading in `zone` at `epochMs`, expressed as if it were UTC.
function wallClock(epochMs, zone) {
  const parts = {};
  for (const part of formatter(zone).formatToParts(new Date(epochMs))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour === 24 ? 0 : parts.hour, parts.minute, parts.second);
}

// Returns the UTC Date for a local "YYYY-MM-DDTHH:mm" in `zone`, or null when
// the input is malformed or the time does not exist (a daylight saving gap).
// Ambiguous times during a backward change resolve to the earlier instant.
export function localToUtc(local, zone) {
  const match = typeof local === 'string' ? LOCAL.exec(local) : null;
  if (!match || !isTimeZone(zone)) return null;
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  if (year < 1970 || year > 2200 || hour > 23 || minute > 59) return null;
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  const check = new Date(wanted);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const candidates = new Set([wanted - DAY, wanted, wanted + DAY].map(probe => wanted - (wallClock(probe, zone) - probe)));
  const exact = [...candidates].filter(candidate => wallClock(candidate, zone) === wanted).sort((a, b) => a - b);
  return exact.length ? new Date(exact[0]) : null;
}

// Formats an instant as a local "YYYY-MM-DDTHH:mm" in `zone`.
export function utcToLocal(value, zone) {
  return new Date(wallClock(new Date(value).getTime(), zone)).toISOString().slice(0, 16);
}
