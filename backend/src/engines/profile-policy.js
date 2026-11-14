export const CONTACT_VISIBILITY = ['members', 'following', 'hidden'];
export const PROFILE_LINK_TYPES = ['spotify', 'youtube', 'soundcloud', 'bandcamp', 'instagram', 'website', 'other'];

// Contacts are never public: signed-in members, only people the owner
// follows, or nobody. Any block between the two accounts hides them.
export function canSeeContacts({ visibility, isOwner, viewerId, ownerFollowsViewer, blocked }) {
  if (isOwner) return true;
  if (!viewerId || blocked) return false;
  if (visibility === 'members') return true;
  if (visibility === 'following') return Boolean(ownerFollowsViewer);
  return false;
}

// Plan limits are the owner's: `null` is unlimited.
export function limitShown(items, limit) {
  const list = items || [];
  if (limit === null || limit === undefined || list.length <= limit) return { shown: list, hidden: 0 };
  return { shown: list.slice(0, limit), hidden: list.length - limit };
}

const patterns = {
  phone: /^\+?[0-9 ()-]{5,30}$/,
  telegramId: /^@?[A-Za-z0-9_]{5,32}$/,
  whatsapp: /^\+?[0-9 ()-]{5,30}$/,
  signal: /^(?:\+?[0-9 ()-]{5,30}|[A-Za-z0-9_.]{3,40})$/,
};

export const CONTACT_MESSAGES = {
  phone: 'Phone must contain only digits, spaces, +, - and parentheses',
  telegramId: 'Telegram must be a username of 5-32 letters, digits or underscores',
  whatsapp: 'WhatsApp must be a phone number',
  signal: 'Signal must be a phone number or username',
};

export function validateContact(key, value) {
  if (value === undefined || value === null || value === '') return { valid: true };
  if (typeof value !== 'string' || !patterns[key].test(value.trim())) return { valid: false, message: CONTACT_MESSAGES[key] };
  return { valid: true };
}

export function normalizeContact(value) {
  if (value === undefined) return undefined;
  const trimmed = typeof value === 'string' ? value.trim() : value;
  return trimmed === '' ? null : trimmed;
}
