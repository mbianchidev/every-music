import { t } from './i18n.js';

// Contact matching sends only SHA-256 hashes of normalized email addresses.
// The normalization must match the server's (NFC, trimmed, lowercase).
export const MAX_CONTACTS = 500;
const EMAIL_PATTERN = /[^\s,;:<>"'()[\]]+@[^\s,;:<>"'()[\]]+\.[^\s,;:<>"'()[\]]+/g;

export const normalizeEmail = value => String(value ?? '').normalize('NFC').trim().toLowerCase();

export function extractEmails(text) {
  return [...new Set((String(text ?? '').match(EMAIL_PATTERN) || []).map(normalizeEmail))];
}

export async function hashEmails(emails, subtle = globalThis.crypto?.subtle) {
  if (!subtle) throw new Error(t('accountPrivacy.hashUnavailable'));
  const encoder = new TextEncoder();
  return Promise.all(emails.map(async (email) => {
    const digest = await subtle.digest('SHA-256', encoder.encode(normalizeEmail(email)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }));
}

export function contactPickerAvailable(navigatorObject = globalThis.navigator) {
  return typeof navigatorObject?.contacts?.select === 'function';
}

export async function pickContactEmails(navigatorObject = globalThis.navigator) {
  const contacts = await navigatorObject.contacts.select(['email'], { multiple: true });
  return [...new Set(contacts.flatMap(contact => contact.email ?? []).map(normalizeEmail).filter(email => email.includes('@')))];
}
