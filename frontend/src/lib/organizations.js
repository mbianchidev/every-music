export const ORGANIZATION_KINDS = ['band', 'venue', 'organizer', 'booking_agency', 'label'];
export const BUSINESS_KINDS = ['venue', 'organizer', 'booking_agency', 'label'];
export const MEMBER_PERMISSIONS = ['manage_profile', 'manage_members', 'post_announcements', 'manage_calendar'];
export const LINK_TYPES = ['website', 'spotify', 'youtube', 'soundcloud', 'bandcamp', 'instagram', 'other'];
export const VENUE_TYPES = ['venue', 'club', 'disco', 'social_center', 'theater', 'stadium', 'other'];
export const RELEASE_TYPES = ['single', 'ep', 'lp', 'album'];
export const PHOTO_CATEGORIES = ['inside', 'outside', 'gallery'];
export const OPEN_TO = ['tours', 'live', 'supportActs', 'endorsements'];

export const organizationHref = organization => `#organization?id=${encodeURIComponent(organization.slug || organization.id)}`;

export const can = (organization, permission) => Boolean(organization?.viewer?.permissions?.includes(permission));

export function mapLinks(coordinates) {
  if (!coordinates || !Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)) return null;
  const lat = coordinates.latitude.toFixed(6);
  const lon = coordinates.longitude.toFixed(6);
  return {
    map: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    directions: `https://www.openstreetmap.org/directions?route=%3B${lat}%2C${lon}`,
  };
}

export const placeLabel = location => [location?.city, location?.region, location?.country].filter(Boolean).join(', ');

// Converts an optional numeric form value: blank becomes null so the API
// clears the field, anything else must be a finite number.
export function optionalNumber(value) {
  if (value === '' || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
}

export const blankToNull = value => (typeof value === 'string' && value.trim() === '' ? null : typeof value === 'string' ? value.trim() : value);

// Builds the API body for the page editor, sending only fields that apply to
// the kind. `invalid` lists numeric fields that could not be parsed.
export function organizationBody(draft, creating) {
  const numbers = {};
  for (const key of ['latitude', 'longitude', 'capacity', 'activeSince', 'activeUntil', 'formedYear']) numbers[key] = optionalNumber(draft[key]);
  const invalid = Object.entries(numbers).filter(([, value]) => Number.isNaN(value)).map(([key]) => key);
  const body = {
    name: draft.name.trim(), slug: blankToNull(draft.slug)?.toLowerCase() ?? null, bio: blankToNull(draft.bio), pictureUrl: draft.pictureUrl,
    city: blankToNull(draft.city), region: blankToNull(draft.region), country: blankToNull(draft.country),
    latitude: numbers.latitude, longitude: numbers.longitude,
    contactEmail: blankToNull(draft.contactEmail), contactPhone: blankToNull(draft.contactPhone),
    genreIds: draft.genreIds, links: draft.links.filter(link => link.url.trim()).map(link => ({ linkType: link.linkType, url: link.url.trim() })),
  };
  if (draft.kind !== 'band') Object.assign(body, { workWithUs: blankToNull(draft.workWithUs), activeSince: numbers.activeSince, activeUntil: numbers.activeUntil });
  if (draft.kind === 'venue') {
    Object.assign(body, { venueType: draft.venueType || null, capacity: numbers.capacity, parkingInfo: blankToNull(draft.parkingInfo), directions: blankToNull(draft.directions) });
  }
  if (draft.kind === 'band') Object.assign(body, { formedYear: numbers.formedYear, youtubeChannelId: blankToNull(draft.youtubeChannelId), openTo: draft.openTo });
  if (creating) Object.assign(body, { kind: draft.kind, title: blankToNull(draft.title), ...(draft.kind === 'venue' ? { managed: draft.managed } : {}) });
  return { body, invalid };
}
