import { translate } from './i18n.js';

export const MARKETPLACE_TABS = ['gear', 'lessons', 'services', 'endorsements'];
export const TAB_TYPES = {
  gear: ['sell', 'wanted'],
  lessons: ['lesson'],
  services: ['service_offer', 'service_wanted'],
  endorsements: ['endorsement'],
};
export const RATED_TYPES = ['lesson', 'service_offer', 'service_wanted'];
export const GEAR_TYPES = TAB_TYPES.gear;
export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'CAD', 'AUD', 'JPY'];

export const tabForType = type => MARKETPLACE_TABS.find(tab => TAB_TYPES[tab].includes(type)) || 'gear';

export function currencyDigits(currency) {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
  } catch {
    return 2;
  }
}

// Converts a typed amount ("450", "39.99", "39,99") into integer minor units.
// Returns null for an empty value and NaN when the text is not a valid amount.
export function toMinorUnits(value, currency) {
  const text = String(value ?? '').trim().replace(/\s/g, '');
  if (!text) return null;
  const digits = currencyDigits(currency);
  const match = /^(\d{1,12})(?:[.,](\d*))?$/.exec(text);
  if (!match || (match[2] ?? '').length > digits) return NaN;
  const fraction = (match[2] ?? '').padEnd(digits, '0');
  const minor = Number(match[1]) * 10 ** digits + Number(fraction || 0);
  return Number.isSafeInteger(minor) ? minor : NaN;
}

export function fromMinorUnits(minor, currency) {
  if (minor === null || minor === undefined) return '';
  const digits = currencyDigits(currency);
  return digits ? (minor / 10 ** digits).toFixed(digits) : String(minor);
}

export function formatMoney(minor, currency, locale) {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 10 ** digits);
}

export function formatPrice(listing, locale) {
  const t = (key, params) => translate(locale, `marketplace.${key}`, params);
  if (listing.priceMode === 'free') return t('price.free');
  if (listing.priceMode === 'contact') return t('price.contact');
  if (listing.priceMinor === null || listing.priceMinor === undefined) return t('price.negotiable');
  let amount = formatMoney(listing.priceMinor, listing.currency, locale);
  if (listing.rateUnit) amount = t(`price.per.${listing.rateUnit}`, { amount });
  return listing.priceMode === 'negotiable' ? t('price.negotiableAmount', { amount }) : amount;
}

export function categoryLabel(listing, locale) {
  const category = translate(locale, `marketplace.categories.${listing.category}`);
  return listing.subcategory ? `${category} / ${translate(locale, `marketplace.subcategories.${listing.subcategory}`)}` : category;
}

export const emptyDraft = (type = 'sell', currency = 'EUR') => ({
  type, category: '', subcategory: '', title: '', description: '', condition: '', priceMode: type === 'endorsement' ? 'contact' : 'fixed',
  amount: '', currency, rateUnit: '', locationText: '', latitude: '', longitude: '', remote: false, shipping: false,
  photos: [], instrumentIds: [], genreIds: [],
});

export function listingToDraft(listing) {
  return {
    type: listing.type, category: listing.category, subcategory: listing.subcategory || '', title: listing.title,
    description: listing.description, condition: listing.condition || '', priceMode: listing.priceMode,
    amount: fromMinorUnits(listing.priceMinor, listing.currency || 'EUR'), currency: listing.currency || 'EUR',
    rateUnit: listing.rateUnit || '', locationText: listing.locationText || '',
    latitude: listing.latitude ?? '', longitude: listing.longitude ?? '', remote: listing.remote, shipping: listing.shipping,
    photos: listing.photos, instrumentIds: listing.instruments.map(item => item.id), genreIds: listing.genres.map(item => item.id),
  };
}

const coordinate = value => (String(value).trim() === '' ? null : Number(String(value).replace(',', '.')));

// Builds the API body from an editor draft. Returns { body } or { error } with
// the locale key of the first problem so the form can show it.
export function draftToBody(draft) {
  const gear = GEAR_TYPES.includes(draft.type);
  const rated = RATED_TYPES.includes(draft.type);
  const priced = ['fixed', 'negotiable'].includes(draft.priceMode);
  const title = draft.title.trim();
  const description = draft.description.trim();
  if (title.length < 3 || title.length > 120) return { error: 'title' };
  if (description.length < 10 || description.length > 5000) return { error: 'description' };
  if (!draft.category) return { error: 'category' };
  if (draft.type === 'sell' && !draft.condition) return { error: 'condition' };
  const priceMinor = priced ? toMinorUnits(draft.amount, draft.currency) : null;
  if (Number.isNaN(priceMinor) || (draft.priceMode === 'fixed' && priceMinor === null)) return { error: 'amount' };
  if (rated && priceMinor !== null && !draft.rateUnit) return { error: 'rateUnit' };
  const latitude = coordinate(draft.latitude);
  const longitude = coordinate(draft.longitude);
  if ((latitude === null) !== (longitude === null) || Number.isNaN(latitude) || Number.isNaN(longitude)) return { error: 'coordinates' };
  return {
    body: {
      type: draft.type, category: draft.category, subcategory: draft.subcategory || null, title, description,
      condition: gear && draft.condition ? draft.condition : null, priceMode: draft.priceMode, priceMinor,
      currency: priceMinor === null ? null : draft.currency, rateUnit: rated && priceMinor !== null ? draft.rateUnit : null,
      locationText: draft.locationText.trim() || null, latitude, longitude,
      remote: !gear && draft.remote, shipping: gear && draft.shipping,
      photos: draft.photos, instrumentIds: draft.instrumentIds, genreIds: draft.genreIds,
    },
  };
}
