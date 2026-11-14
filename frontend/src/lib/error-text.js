import { DEFAULT_LOCALE, getLocale, hasTranslation, translate } from './i18n.js';

// Server messages for these codes name the exact field or limit. English
// readers keep that text; other languages get the localized summary, with the
// validation detail appended so the problem stays identifiable.
const SPECIFIC_IN_ENGLISH = new Set(['VALIDATION_ERROR', 'PLAN_LIMIT_REACHED']);
const GENERIC_CODES = new Set(['REQUEST_FAILED', 'INTERNAL_ERROR']);
const GENERIC_VALIDATION = new Set(['Request validation failed', 'Invalid input data']);

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

// Turns a failed request (ApiError from lib/conduit.js) or any thrown error
// into the text screens show. Known codes are localized; unknown codes keep the
// server's own message, and nothing is ever reduced to an empty string.
export function errorText(error, locale = getLocale()) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  const server = typeof error.message === 'string' ? error.message.trim() : '';
  const code = typeof error.code === 'string' ? error.code : '';
  const key = `errors.codes.${code}`;
  if (code && hasTranslation(key)) {
    const message = translate(locale, key);
    if (!SPECIFIC_IN_ENGLISH.has(code) || !server || GENERIC_VALIDATION.has(server)) return message;
    if (locale === DEFAULT_LOCALE) return server;
    return code === 'VALIDATION_ERROR' ? translate(locale, 'errors.withDetail', { message, detail: server }) : message;
  }
  if ((!code || GENERIC_CODES.has(code)) && statusKey(error.status) && (!server || code === 'INTERNAL_ERROR' || locale !== DEFAULT_LOCALE)) {
    return translate(locale, statusKey(error.status));
  }
  return server || translate(locale, 'errors.unknown');
}
