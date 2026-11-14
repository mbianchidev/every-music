import { requestError } from './request-error.js';

// Marketplace taxonomy. Keys are stable API values; clients render labels from
// their locale catalogs (marketplace.categories.* and marketplace.subcategories.*).
export const LISTING_TYPES = ['sell', 'wanted', 'lesson', 'service_offer', 'service_wanted', 'endorsement'];
export const MARKETPLACE_TABS = {
  gear: ['sell', 'wanted'],
  lessons: ['lesson'],
  services: ['service_offer', 'service_wanted'],
  endorsements: ['endorsement'],
};
export const CONDITIONS = ['new', 'used', 'refurbished'];
export const PRICE_MODES = ['fixed', 'negotiable', 'free', 'contact'];
export const RATE_UNITS = ['hour', 'session', 'day', 'project'];
export const LISTING_STATUSES = ['active', 'reserved', 'sold', 'closed'];
export const OPEN_STATUSES = ['active', 'reserved'];
export const SORTS = ['newest', 'price_asc', 'price_desc', 'title'];
export const MAX_LISTING_PHOTOS = 8;
export const MAX_LISTING_TAGS = 10;
export const MAX_OPEN_LISTINGS = 50;
export const MAX_SAVED_LISTINGS = 500;
export const MAX_PRICE_MINOR = 100000000000;

const endorsementAreas = ['instruments', 'amplification', 'audio', 'accessories', 'apparel', 'other_products'];

export const MARKETPLACE_CATEGORIES = {
  gear: {
    guitars: ['electric_guitar', 'acoustic_guitar', 'classical_guitar', 'bass_guitar', 'ukulele', 'other_guitar'],
    keyboards: ['piano', 'digital_piano', 'synthesizer', 'organ', 'midi_controller'],
    drums_percussion: ['acoustic_drums', 'electronic_drums', 'cymbals', 'hand_percussion'],
    wind: ['saxophone', 'trumpet', 'trombone', 'flute', 'clarinet', 'harmonica'],
    orchestral_strings: ['violin', 'viola', 'cello', 'double_bass', 'harp'],
    amplifiers: ['guitar_amp', 'bass_amp', 'keyboard_amp', 'cabinet'],
    effects: ['pedal', 'multi_effects', 'rack_effects'],
    studio: ['audio_interface', 'microphone', 'studio_monitors', 'headphones', 'mixer', 'outboard'],
    live_sound: ['pa_system', 'stage_monitors', 'stage_lighting', 'stands'],
    dj: ['turntable', 'dj_controller', 'dj_mixer'],
    accessories: ['cases', 'cables', 'strings_reeds', 'spare_parts'],
    other_gear: [],
  },
  lessons: {
    instrument_lessons: ['guitar', 'bass', 'drums', 'keys', 'strings', 'wind', 'other_instrument'],
    vocal_coaching: [],
    music_theory: [],
    songwriting: [],
    production_mixing: [],
    performance_coaching: [],
    other_lessons: [],
  },
  services: {
    sound_engineer: [],
    driver: [],
    security: [],
    tour_manager: [],
    light_technician: [],
    booking_agency: [],
    graphic_designer: [],
    video_maker: [],
    social_media_manager: [],
    vocal_coach: [],
    drums_coach: [],
    guitar_coach: [],
    other_service: [],
  },
  endorsements: {
    endorsement: endorsementAreas,
    sponsorship: endorsementAreas,
  },
};

const currencies = new Set(Intl.supportedValuesOf('currency'));
const RATED_TYPES = ['lesson', 'service_offer', 'service_wanted'];
const CONDITION_TYPES = ['sell', 'wanted'];

export function tabForType(type) {
  return Object.keys(MARKETPLACE_TABS).find(tab => MARKETPLACE_TABS[tab].includes(type));
}

export function isCurrency(code) {
  return typeof code === 'string' && currencies.has(code);
}

export function catalogView({ listingDays }) {
  return {
    types: LISTING_TYPES,
    tabs: Object.entries(MARKETPLACE_TABS).map(([id, types]) => ({
      id, types,
      categories: Object.entries(MARKETPLACE_CATEGORIES[id]).map(([key, subcategories]) => ({ id: key, subcategories })),
    })),
    conditions: CONDITIONS,
    priceModes: PRICE_MODES,
    rateUnits: RATE_UNITS,
    statuses: LISTING_STATUSES,
    sorts: SORTS,
    currencies: [...currencies],
    maxPhotos: MAX_LISTING_PHOTOS,
    maxTags: MAX_LISTING_TAGS,
    listingDays,
  };
}

function invalid(message) {
  return requestError(400, 'INVALID_LISTING', message);
}

const trimmed = value => (typeof value === 'string' ? value.trim() : value);
const blankToNull = value => (typeof value === 'string' && !value.trim() ? null : trimmed(value) ?? null);

// Validates a complete listing (a new one, or an existing one merged with a
// partial edit) and returns the normalized persisted fields.
export function normalizeListing(input) {
  const type = input.type;
  if (!LISTING_TYPES.includes(type)) throw invalid('Choose a listing type');
  const tab = tabForType(type);
  const category = input.category;
  if (!Object.hasOwn(MARKETPLACE_CATEGORIES[tab], category ?? '')) throw invalid('Choose a category that matches the listing type');
  const subcategory = blankToNull(input.subcategory);
  const allowed = MARKETPLACE_CATEGORIES[tab][category];
  if (subcategory !== null && !allowed.includes(subcategory)) throw invalid('Choose a subcategory from the selected category');

  const title = trimmed(input.title) ?? '';
  if (title.length < 3 || title.length > 120) throw invalid('Use 3-120 characters for the title');
  const description = trimmed(input.description) ?? '';
  if (description.length < 10 || description.length > 5000) throw invalid('Use 10-5,000 characters for the description');

  const condition = input.condition ?? null;
  if (condition !== null && (!CONDITION_TYPES.includes(type) || !CONDITIONS.includes(condition))) {
    throw invalid('Condition applies only to gear for sale or wanted');
  }
  if (type === 'sell' && condition === null) throw invalid('Choose the condition of the item for sale');

  const priceMode = input.priceMode;
  if (!PRICE_MODES.includes(priceMode)) throw invalid('Choose how the price is set');
  let priceMinor = input.priceMinor ?? null;
  let currency = blankToNull(input.currency);
  if (['free', 'contact'].includes(priceMode)) {
    if (priceMinor !== null || currency !== null) throw invalid('Free and contact-for-price listings cannot include an amount');
  } else {
    if (priceMode === 'fixed' && priceMinor === null) throw invalid('Enter a price for a fixed-price listing');
    if (priceMinor !== null && (!Number.isSafeInteger(priceMinor) || priceMinor < 0 || priceMinor > MAX_PRICE_MINOR)) {
      throw invalid('Enter a price as a whole number of minor currency units');
    }
    if ((priceMinor === null) !== (currency === null)) throw invalid('Enter both an amount and a currency, or neither');
    if (currency !== null && !isCurrency(currency)) throw invalid('Choose a valid ISO 4217 currency code');
  }

  const rateUnit = input.rateUnit ?? null;
  if (rateUnit !== null && (!RATED_TYPES.includes(type) || !RATE_UNITS.includes(rateUnit))) {
    throw invalid('Rate units apply only to lessons and services');
  }
  if (rateUnit !== null && priceMinor === null) throw invalid('A rate unit needs an amount');
  if (RATED_TYPES.includes(type) && priceMinor !== null && rateUnit === null) {
    throw invalid('Choose whether the amount is per hour, session, day, or project');
  }

  const locationText = blankToNull(input.locationText);
  if (locationText !== null && locationText.length > 160) throw invalid('Use at most 160 characters for the location');
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;
  if ((latitude === null) !== (longitude === null)) throw invalid('Provide both latitude and longitude, or neither');
  if (latitude !== null && (typeof latitude !== 'number' || latitude < -90 || latitude > 90
    || typeof longitude !== 'number' || longitude < -180 || longitude > 180)) {
    throw invalid('Coordinates are out of range');
  }

  const remote = input.remote === true;
  const shipping = input.shipping === true;
  if (shipping && !CONDITION_TYPES.includes(type)) throw invalid('Shipping applies only to gear');

  return {
    type, category, subcategory, title, description, condition, priceMode, priceMinor, currency, rateUnit,
    locationText, latitude, longitude, remote, shipping,
  };
}

export function listingStatus(status) {
  if (!LISTING_STATUSES.includes(status)) throw invalid('Choose active, reserved, sold, or closed');
  return status;
}
