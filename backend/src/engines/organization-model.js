// Shared vocabulary and pure rules for organization pages (bands, venues,
// organizers, booking agencies and labels). Repositories and conductors import
// these so permission checks and validation stay identical everywhere.

export const ORGANIZATION_KINDS = ['band', 'venue', 'organizer', 'booking_agency', 'label'];
// Business pages need the `businessPages` plan limit; bands are always free and
// community-maintained (unmanaged) venues are exempt until someone claims them.
export const BUSINESS_KINDS = ['venue', 'organizer', 'booking_agency', 'label'];
export const MEMBER_ROLES = ['leader', 'admin', 'member'];
export const MEMBER_PERMISSIONS = ['manage_profile', 'manage_members', 'post_announcements', 'manage_calendar'];
export const LINK_TYPES = ['spotify', 'youtube', 'soundcloud', 'bandcamp', 'instagram', 'website', 'other'];
export const VENUE_TYPES = ['disco', 'venue', 'social_center', 'stadium', 'club', 'theater', 'other'];
export const RELEASE_TYPES = ['single', 'ep', 'lp', 'album'];
export const PHOTO_CATEGORIES = ['inside', 'outside', 'gallery'];
export const OPEN_TO = ['tours', 'live', 'supportActs', 'endorsements'];
export const RELATION_KINDS = { booking_agency: 'roster', label: 'label' };
export const LIMITS = { photos: 30, links: 12, genres: 10, similar: 10, releaseLinks: 6, ledOrganizations: 25 };
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// Static paths under /organizations that a slug must not shadow.
export const RESERVED_SLUGS = ['mine', 'invitations', 'updates', 'relation-requests', 'new', 'search'];
export const YOUTUBE_CHANNEL_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

// Leaders and admins hold every permission; members hold only the explicit
// list chosen by a leader or admin.
export function effectivePermissions(role, permissions = []) {
  if (role === 'leader' || role === 'admin') return [...MEMBER_PERMISSIONS];
  return MEMBER_PERMISSIONS.filter(permission => permissions.includes(permission));
}

export function hasPermission(membership, permission) {
  if (!membership) return false;
  if (!permission) return true;
  return effectivePermissions(membership.role, membership.permissions).includes(permission);
}

export function openStreetMapLinks(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const lat = latitude.toFixed(6);
  const lon = longitude.toFixed(6);
  return {
    map: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`,
    directions: `https://www.openstreetmap.org/directions?route=%3B${lat}%2C${lon}`,
  };
}

export function distanceKm(from, to) {
  if (![from?.latitude, from?.longitude, to?.latitude, to?.longitude].every(Number.isFinite)) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const deltaLat = radians(to.latitude - from.latitude);
  const deltaLon = radians(to.longitude - from.longitude);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Similar-band suggestions: shared members weigh most, then shared genres,
// then proximity (same city, or coordinates within 50/200 km). Spotify's
// related-artists data is not used because it requires API credentials.
export function similarityScore({ sharedGenres = 0, sharedMembers = 0, distance = null, sameCity = false }) {
  const reasons = [];
  let score = 0;
  if (sharedMembers > 0) { score += sharedMembers * 3; reasons.push({ reason: 'shared_members', count: sharedMembers }); }
  if (sharedGenres > 0) { score += sharedGenres * 2; reasons.push({ reason: 'shared_genres', count: sharedGenres }); }
  if (sameCity || (distance !== null && distance <= 50)) { score += 2; reasons.push({ reason: 'nearby' }); }
  else if (distance !== null && distance <= 200) { score += 1; reasons.push({ reason: 'region' }); }
  return { score, reasons };
}

function isWebUrl(value) {
  if (typeof value !== 'string' || !value || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validateLinks(links, types = LINK_TYPES, maximum = LIMITS.links) {
  if (links === undefined) return null;
  if (!Array.isArray(links) || links.length > maximum) return `Add at most ${maximum} links`;
  for (const link of links) {
    if (!link || typeof link !== 'object' || !types.includes(link.linkType) || !isWebUrl(link.url)) {
      return 'Each link needs a supported type and an http(s) URL';
    }
  }
  return null;
}

export function isManagedMediaUrl(value) {
  return typeof value === 'string'
    && /^\/realm\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isImageReference(value) {
  return isManagedMediaUrl(value) || isWebUrl(value);
}

export { isWebUrl };

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const VENUE_FIELDS = ['venueType', 'capacity', 'parkingInfo', 'directions'];
const BAND_FIELDS = ['formedYear', 'youtubeChannelId', 'openTo'];

// Cross-field rules that JSON schemas cannot express. Types and lengths are
// checked by the route schema before this runs.
export function organizationInputErrors(kind, input) {
  const errors = [];
  const present = key => input[key] !== undefined && input[key] !== null;
  if (kind !== 'venue') {
    for (const key of VENUE_FIELDS) if (present(key)) errors.push(`${key} applies only to venues`);
  }
  if (kind !== 'band') {
    for (const key of BAND_FIELDS) if (present(key)) errors.push(`${key} applies only to bands`);
  }
  if (input.name !== undefined && !String(input.name).trim()) errors.push('Name is required');
  if (present('slug') && (input.slug.length < 3 || !SLUG_PATTERN.test(input.slug) || RESERVED_SLUGS.includes(input.slug)
    || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(input.slug))) {
    errors.push('Slug must be 3-80 lowercase letters, digits, and single hyphens');
  }
  if (present('pictureUrl') && !isManagedMediaUrl(input.pictureUrl)) errors.push('Upload the picture as an organization image');
  if ((input.latitude === undefined) !== (input.longitude === undefined)
    || (input.latitude === null) !== (input.longitude === null)) errors.push('Latitude and longitude must be provided together');
  if (present('activeSince') && present('activeUntil') && input.activeUntil < input.activeSince) {
    errors.push('Years of activity must end after they start');
  }
  if (present('contactEmail')) {
    const [local, domain, extra] = String(input.contactEmail).split('@');
    if (extra !== undefined || !local || !domain || !domain.includes('.') || /\s/.test(input.contactEmail)) errors.push('Contact email is invalid');
  }
  const linkError = validateLinks(input.links);
  if (linkError) errors.push(linkError);
  return errors;
}

