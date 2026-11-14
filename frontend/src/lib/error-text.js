import { DEFAULT_LOCALE, getLocale, hasTranslation, translate } from './i18n.js';

// Server messages are written in English and usually name the exact field,
// limit, or permission involved. These are the only ones that say nothing
// more than their code.
const GENERIC_SERVER_MESSAGES = new Set([
  'Request validation failed', 'Invalid input data', 'Too many requests, please slow down',
  'Authentication is required', 'An internal error occurred',
]);
const GENERIC_CODES = new Set(['REQUEST_FAILED', 'INTERNAL_ERROR']);

function statusKey(status) {
  if (status === 401) return 'errors.status.unauthorized';
  if (status === 403) return 'errors.status.forbidden';
  if (status === 404) return 'errors.status.notFound';
  if (status === 409) return 'errors.status.conflict';
  if (status === 413) return 'errors.status.tooLarge';
  if (status === 429) return 'errors.status.rateLimited';
  if (status >= 500) return 'errors.status.server';
  return null;
}

// Turns a thrown error into the text a screen shows. Failed requests
// (ApiError from lib/conduit.js, which always has a numeric status) keep the
// server's specific English message in English, and get the localized message
// for their code in other languages; the validation detail is appended because
// it identifies the field. Unknown codes keep the server's message. Client-side
// errors are created with t() already, so their message is kept as is.
// Nothing is ever reduced to an empty string.
export function errorText(error, locale = getLocale()) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const server = typeof error.message === 'string' ? error.message.trim() : '';
  if (typeof error.status !== 'number') return server || translate(locale, 'errors.unknown');
  const code = typeof error.code === 'string' ? error.code : '';
  const specific = Boolean(server) && !GENERIC_SERVER_MESSAGES.has(server) && !/^Request failed with status \d+$/.test(server);
  if (locale === DEFAULT_LOCALE && specific) return server;
  const key = `errors.codes.${code}`;
  if (code && hasTranslation(key)) {
    const message = translate(locale, key);
    return code === 'VALIDATION_ERROR' && specific ? translate(locale, 'errors.withDetail', { message, detail: server }) : message;
  }
  if ((!code || GENERIC_CODES.has(code)) && statusKey(error.status) && !specific) return translate(locale, statusKey(error.status));
  return server || translate(locale, 'errors.unknown');
}
