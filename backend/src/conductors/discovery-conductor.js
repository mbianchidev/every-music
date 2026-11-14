import { placeRepository } from '../repositories/place-repository.js';
import { requestError } from '../engines/request-error.js';
import { hasCenter, parseLocationFilters } from '../engines/discovery-filters.js';

// Resolves the location part of discovery filters to a center. Places are
// looked up by ID; raw coordinates are used for this request only.
export async function resolveLocation(query) {
  const parsed = parseLocationFilters(query);
  if (!parsed.valid) throw Object.assign(requestError(400, 'VALIDATION_ERROR', parsed.errors.join('. ')), { details: parsed.errors });
  const location = parsed.value;
  if (location.placeId !== undefined) {
    const place = await placeRepository.find(location.placeId);
    if (!place) throw requestError(400, 'PLACE_NOT_FOUND', 'Choose a city from the suggestions');
    return { ...location, center: { latitude: place.latitude, longitude: place.longitude }, place };
  }
  if (location.latitude !== undefined) {
    return { ...location, center: { latitude: location.latitude, longitude: location.longitude } };
  }
  return location;
}

// A selected place supplies the city, region, country and coordinates.
// Clearing it keeps any free-text city sent with the same request.
export async function placeFields(input, executor) {
  if (input.placeId === undefined) return {};
  if (input.placeId === null) {
    return {
      placeId: null, latitude: null, longitude: null, city: input.city ?? null,
      state: input.state ?? null, country: input.country ?? null,
    };
  }
  const place = await placeRepository.find(input.placeId, executor);
  if (!place) throw requestError(400, 'PLACE_NOT_FOUND', 'Choose a city from the suggestions');
  return {
    placeId: place.id, city: place.name, state: place.region, country: place.country,
    latitude: place.latitude, longitude: place.longitude,
  };
}

export function validatePlaceId(value) {
  return value === undefined || value === null || (Number.isInteger(value) && value > 0 && value <= 2147483647)
    ? { valid: true } : { valid: false, message: 'Place must be a city from the suggestions' };
}

const plainKeys = ['searchTerm', 'city', 'instrumentId', 'genreId', 'isRemote', 'isCoverBand'];

// Saved searches never keep raw coordinates: "near me" becomes the nearest
// known city, and the stored center is that city's centroid.
export async function normalizeSavedFilters(input) {
  const filters = {};
  for (const key of plainKeys) {
    const value = typeof input[key] === 'string' ? input[key].trim() : input[key];
    if (value !== undefined && value !== null && value !== '') filters[key] = key.endsWith('Id') ? value.toLowerCase() : value;
  }
  const location = await resolveLocation(input);
  let place = location.place;
  if (!place && location.center) {
    place = await placeRepository.nearest(location.center);
    if (!place) throw requestError(400, 'PLACE_NOT_FOUND', 'No known city is close to your location; choose a city instead');
  }
  if (place) Object.assign(filters, { placeId: place.id, placeLabel: place.label, latitude: place.latitude, longitude: place.longitude });
  if (location.radiusKm) filters.radiusKm = location.radiusKm;
  if (location.country) filters.country = location.country;
  if (location.region) filters.region = location.region;
  if (!Object.keys(filters).length) throw requestError(400, 'EMPTY_SEARCH', 'Choose at least one filter or search term before saving');
  return filters;
}

export { hasCenter };
