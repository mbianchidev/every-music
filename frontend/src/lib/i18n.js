import { useEffect, useState } from 'react';

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'it', label: 'Italiano' },
];
export const DEFAULT_LOCALE = 'en';
const STORAGE_KEY = 'everymusic.locale';
const catalogs = Object.fromEntries(SUPPORTED_LOCALES.map(({ code }) => [code, {}]));
const listeners = new Set();
const reported = new Set();

export const isSupportedLocale = code => SUPPORTED_LOCALES.some(locale => locale.code === code);

// Namespaces live in src/locales/<locale>/<namespace>.js and are discovered by
// Vite at build time. Node tests have no import.meta.glob; they register
// catalogs explicitly with registerCatalog().
let discovered = {};
try {
  discovered = import.meta.glob('../locales/*/*.js', { eager: true, import: 'default' });
} catch {
  discovered = {};
}
for (const [path, messages] of Object.entries(discovered)) {
  const match = /\/locales\/([a-z]{2})\/([\w-]+)\.js$/.exec(path);
  if (match) registerCatalog(match[1], match[2], messages);
}

export function registerCatalog(locale, namespace, messages) {
  if (!isSupportedLocale(locale)) throw new Error(`Unsupported locale: ${locale}`);
  catalogs[locale][namespace] = messages;
}

function storage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

export function detectLocale(stored = storage()?.getItem(STORAGE_KEY), languages = globalThis.navigator?.languages ?? []) {
  if (isSupportedLocale(stored)) return stored;
  for (const language of languages) {
    const code = String(language).toLowerCase().split('-')[0];
    if (isSupportedLocale(code)) return code;
  }
  return DEFAULT_LOCALE;
}

let current = detectLocale();
if (globalThis.document) document.documentElement.lang = current;

export const getLocale = () => current;

// `remember: false` applies an account's language without replacing this
// device's own choice, so another account signing in later does not inherit it.
export function setLocale(code, { remember = true } = {}) {
  if (!isSupportedLocale(code)) throw new Error(`Unsupported locale: ${code}`);
  if (remember) {
    try { storage()?.setItem(STORAGE_KEY, code); } catch (error) { console.warn('Could not save the language preference', error); }
  }
  if (globalThis.document) document.documentElement.lang = code;
  if (code === current) return;
  current = code;
  for (const listener of listeners) listener(code);
}

export function onLocaleChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function lookup(locale, key) {
  const [namespace, ...path] = key.split('.');
  let value = catalogs[locale]?.[namespace];
  for (const part of path) value = value?.[part];
  return value;
}

function plural(locale, message, count) {
  if (typeof message !== 'object' || message === null) return message;
  const category = new Intl.PluralRules(locale).select(Number(count ?? 0));
  return message[category] ?? message.other;
}

export function hasTranslation(key, locale = DEFAULT_LOCALE) {
  const message = lookup(locale, key);
  return typeof message === 'string' || (typeof message === 'object' && message !== null && typeof message.other === 'string');
}

// Keys are "<namespace>.<path>". Missing translations fall back to English,
// then to the key itself so gaps stay visible instead of rendering blank text.
export function translate(locale, key, params = {}) {
  let message = plural(locale, lookup(locale, key), params.count);
  if (typeof message !== 'string') message = plural(DEFAULT_LOCALE, lookup(DEFAULT_LOCALE, key), params.count);
  if (typeof message !== 'string') {
    if (!reported.has(key)) { reported.add(key); console.warn(`Missing translation: ${key}`); }
    return key;
  }
  return message.replace(/\{(\w+)\}/g, (placeholder, name) => {
    if (!Object.hasOwn(params, name)) return placeholder;
    const value = params[name];
    return name === 'count' && typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat(locale).format(value) : String(value);
  });
}

export const t = (key, params) => translate(current, key, params);

export const formatDate = (value, options = { dateStyle: 'medium' }, locale = current) =>
  new Intl.DateTimeFormat(locale, options).format(value instanceof Date ? value : new Date(value));

export const formatNumber = (value, options = {}, locale = current) => new Intl.NumberFormat(locale, options).format(value);

export function useI18n() {
  const [locale, setCurrent] = useState(current);
  useEffect(() => onLocaleChange(setCurrent), []);
  return {
    locale,
    setLocale,
    t: (key, params) => translate(locale, key, params),
    formatDate: (value, options) => formatDate(value, options, locale),
    formatNumber: (value, options) => formatNumber(value, options, locale),
  };
}
