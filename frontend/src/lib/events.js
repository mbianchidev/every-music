export const EVENT_TYPES = ['concert', 'festival', 'other'];
export const LINEUP_ROLES = ['headliner', 'opener', 'support', 'other'];
export const COMMUNICATION_KINDS = ['door_open', 'lineup_change', 'refund', 'general'];
export const REMINDER_PRESETS = [15, 60, 180, 1440, 2880, 10080];
export const EVENT_SORTS = ['date', 'band', 'organizer', 'location'];
export const LIMITS = { organizers: 5, lineup: 50, genres: 10, images: 6, ticketLinks: 5, reminders: 5 };

const FALLBACK_ZONES = ['UTC', 'Europe/Amsterdam', 'Europe/Berlin', 'Europe/London', 'Europe/Madrid', 'Europe/Paris', 'Europe/Rome',
  'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'America/Sao_Paulo', 'Asia/Tokyo', 'Australia/Sydney'];

export function defaultTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function timeZones(current) {
  let zones = FALLBACK_ZONES;
  try {
    if (typeof Intl.supportedValuesOf === 'function') zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = FALLBACK_ZONES;
  }
  return [...new Set([current, 'UTC', ...zones].filter(Boolean))].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)));
}

// Date and time as shown at the event, with the zone abbreviation.
export function formatEventTime(value, timeZone, locale, options = { dateStyle: 'full', timeStyle: 'short' }) {
  if (!value) return '';
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(locale, options).format(new Date(value));
  }
}

export function zoneLabel(value, timeZone, locale) {
  try {
    const part = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: 'short' }).formatToParts(new Date(value))
      .find(item => item.type === 'timeZoneName');
    return part ? `${timeZone} (${part.value})` : timeZone;
  } catch {
    return timeZone;
  }
}

export const organizationHref = organization => `#organization?id=${encodeURIComponent(organization.slug || organization.id)}`;

export function performerHref(entry) {
  if (entry.band) return organizationHref(entry.band);
  if (entry.artist) return `#musician?id=${encodeURIComponent(entry.artist.userId)}`;
  return null;
}

export function lineupByRole(lineup) {
  return LINEUP_ROLES.map(role => ({ role, entries: lineup.filter(entry => entry.role === role) })).filter(group => group.entries.length);
}

export function organizerNames(event) {
  if (event.organizers.length) return event.organizers.map(item => item.name);
  return event.owner ? [event.owner.name] : [];
}

export function locationLabel(event) {
  return [event.venue?.name, event.address, event.place?.label].filter(Boolean).join(', ');
}

export function emptyDraft(timezone = defaultTimeZone()) {
  return {
    title: '', type: 'concert', description: '', timezone, startsAt: '', endsAt: '', doorsOpenAt: '',
    venue: null, place: null, address: '', latitude: '', longitude: '', capacity: '', ticketsSold: '0',
    organizerIds: [], lineup: [], ticketLinks: [], genreIds: [], images: [], visibility: 'draft',
  };
}

export function eventToDraft(event) {
  return {
    title: event.title, type: event.type, description: event.description || '', timezone: event.timezone,
    startsAt: event.local.startsAt || '', endsAt: event.local.endsAt || '', doorsOpenAt: event.local.doorsOpenAt || '',
    venue: event.venue ? { id: event.venue.id, label: event.venue.name } : null,
    place: event.place, address: event.address || '',
    latitude: event.explicitCoordinates ? String(event.explicitCoordinates.latitude) : '',
    longitude: event.explicitCoordinates ? String(event.explicitCoordinates.longitude) : '',
    capacity: event.capacity ? String(event.capacity) : '', ticketsSold: String(event.ticketsSold ?? 0),
    organizerIds: event.organizers.map(item => item.id),
    lineup: event.lineup.map(entry => ({
      key: entry.id, role: entry.role, bandId: entry.band?.id ?? null, artistId: entry.artist?.userId ?? null,
      name: entry.band || entry.artist ? '' : entry.name, label: entry.name,
      setStartsAt: entry.local.setStartsAt || '', setEndsAt: entry.local.setEndsAt || '',
    })),
    ticketLinks: event.ticketLinks.map(link => ({ ...link })), genreIds: event.genres.map(genre => genre.id), images: [...event.images],
    visibility: event.visibility,
  };
}

const blank = value => (typeof value === 'string' && value.trim() === '' ? null : value);

function integer(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : Number.NaN;
}

function coordinate(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

function isHttps(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// API body for the editor, or `{ error }` naming the first problem (a key in
// events.editor.errors) so it can be shown next to the form.
export function draftToBody(draft) {
  if (draft.title.trim().length < 3) return { error: 'title' };
  if (!draft.startsAt) return { error: 'start' };
  if (draft.endsAt && draft.endsAt <= draft.startsAt) return { error: 'end' };
  if (draft.doorsOpenAt && draft.doorsOpenAt > draft.startsAt) return { error: 'doors' };
  const capacity = integer(draft.capacity);
  const ticketsSold = integer(draft.ticketsSold) ?? 0;
  if (Number.isNaN(capacity) || capacity === 0 || Number.isNaN(ticketsSold)) return { error: 'numbers' };
  if (ticketsSold > 0 && capacity === null) return { error: 'capacityRequired' };
  if (capacity !== null && ticketsSold > capacity) return { error: 'oversold' };
  const latitude = coordinate(draft.latitude);
  const longitude = coordinate(draft.longitude);
  if (Number.isNaN(latitude) || Number.isNaN(longitude) || (latitude === null) !== (longitude === null)) return { error: 'coordinates' };
  const ticketLinks = draft.ticketLinks.filter(link => link.label.trim() || link.url.trim());
  if (ticketLinks.some(link => !link.label.trim() || !isHttps(link.url.trim()))) return { error: 'ticketLinks' };
  if (draft.lineup.some(entry => !entry.bandId && !entry.artistId && !entry.name.trim())) return { error: 'lineupName' };
  if (draft.lineup.some(entry => entry.setStartsAt && entry.setEndsAt && entry.setEndsAt <= entry.setStartsAt)) return { error: 'setTimes' };
  return {
    body: {
      title: draft.title.trim(), type: draft.type, description: blank(draft.description)?.trim() ?? null, timezone: draft.timezone,
      startsAt: draft.startsAt, endsAt: draft.endsAt || null, doorsOpenAt: draft.doorsOpenAt || null,
      venueId: draft.venue?.id ?? null, placeId: draft.place?.id ?? null, address: blank(draft.address)?.trim() ?? null,
      latitude, longitude, capacity, ticketsSold,
      organizerIds: draft.organizerIds, genreIds: draft.genreIds, images: draft.images,
      ticketLinks: ticketLinks.map(link => ({ label: link.label.trim(), url: link.url.trim() })),
      lineup: draft.lineup.map(entry => ({
        role: entry.role, bandId: entry.bandId || null, artistId: entry.artistId || null,
        name: entry.bandId || entry.artistId ? null : entry.name.trim(),
        setStartsAt: entry.setStartsAt || null, setEndsAt: entry.setEndsAt || null,
      })),
      visibility: draft.visibility,
    },
  };
}

export function calendarFileName(title) {
  const base = String(title ?? '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').toLowerCase().slice(0, 60);
  return `${base || 'event'}.ics`;
}

export function reminderAvailable(event, minutes, now = Date.now()) {
  return new Date(event.startsAt).getTime() - minutes * 60000 > now;
}
