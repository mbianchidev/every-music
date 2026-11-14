import { requestError } from './request-error.js';

const DAY = 24 * 60 * 60 * 1000;

function endOfUtcDay(date) {
  const end = new Date(date);
  end.setUTCHours(23, 59, 59, 999);
  return end;
}

// Accepts a calendar date (expires at the end of that UTC day) or an ISO
// timestamp. `null` or '' clears the date; undefined leaves it unchanged.
export function parseExpiry(value) {
  if (value === undefined) return { valid: true, value: undefined };
  if (value === null || value === '') return { valid: true, value: null };
  if (typeof value !== 'string' || value.length > 40) return { valid: false, message: 'Expiration date must be a date' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T23:59:59.999Z`);
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
      ? { valid: false, message: 'Expiration date must be a valid date' }
      : { valid: true, value: date };
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return { valid: false, message: 'Expiration date must be a date or an ISO 8601 timestamp' };
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? { valid: false, message: 'Expiration date must be a valid date' } : { valid: true, value: date };
}

export function defaultExpiry(limitDays, now = new Date()) {
  return limitDays === null ? null : endOfUtcDay(new Date(now.getTime() + limitDays * DAY));
}

// One extra day absorbs the difference between the user's calendar date and UTC.
export function latestExpiry(limitDays, now = new Date()) {
  return limitDays === null ? null : endOfUtcDay(new Date(now.getTime() + (limitDays + 1) * DAY));
}

// Decides the stored expiration for a create (existing === undefined) or an
// update. Returns undefined to leave an existing value unchanged.
export function resolveExpiry({ requested, existing, limitDays, publishing = false, now = new Date() }) {
  if (requested === null) {
    if (limitDays !== null) {
      throw requestError(403, 'EXPIRY_REQUIRED', `Your plan requires an expiration date within ${limitDays} days.`);
    }
    return null;
  }
  if (requested instanceof Date) {
    if (requested <= now) throw requestError(400, 'EXPIRY_IN_PAST', 'Choose an expiration date in the future.');
    if (limitDays !== null && requested > latestExpiry(limitDays, now)) {
      throw requestError(403, 'EXPIRY_BEYOND_PLAN', `Your plan allows announcements to run for at most ${limitDays} days.`);
    }
    return requested;
  }
  if (existing === undefined) return defaultExpiry(limitDays, now);
  if (publishing && existing === null && limitDays !== null) return defaultExpiry(limitDays, now);
  return undefined;
}

export function isActive({ isPublished, isDeleted = false, expiresAt }, now = new Date()) {
  return Boolean(isPublished) && !isDeleted && (expiresAt === null || expiresAt === undefined || new Date(expiresAt) > now);
}
