const decimal = /^-?\d{1,3}(?:\.\d{1,10})?$/;

export const MAX_RADIUS_KM = 1000;
export const DISTANCE_SORT = 'distance';

function present(value) {
  return value !== undefined && value !== null && value !== '';
}

// Parses the location part of a discovery query (strings from a URL query or
// JSON values from a saved search). A center is either a GeoNames place ID or
// browser coordinates; it is used for the request only and never stored here.
export function parseLocationFilters(input = {}) {
  const errors = [];
  const value = {};
  const text = key => (present(input[key]) ? String(input[key]) : undefined);
  const placeId = text('placeId');
  const latitude = text('latitude');
  const longitude = text('longitude');
  const radiusKm = text('radiusKm');
  const country = text('country');
  const region = text('region');

  if (placeId !== undefined) {
    if (!/^\d{1,10}$/.test(placeId) || Number(placeId) > 2147483647) errors.push('Place ID must be a GeoNames ID');
    else value.placeId = Number(placeId);
  }
  if ((latitude === undefined) !== (longitude === undefined)) {
    errors.push('Latitude and longitude must be provided together');
  } else if (latitude !== undefined) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!decimal.test(latitude) || !decimal.test(longitude) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      errors.push('Latitude must be between -90 and 90 and longitude between -180 and 180');
    } else if (value.placeId !== undefined) {
      errors.push('Choose either a place or coordinates, not both');
    } else {
      value.latitude = lat;
      value.longitude = lon;
    }
  }
  if (radiusKm !== undefined) {
    if (!/^\d{1,4}$/.test(radiusKm) || Number(radiusKm) < 1 || Number(radiusKm) > MAX_RADIUS_KM) {
      errors.push(`Distance must be between 1 and ${MAX_RADIUS_KM} km`);
    } else if (value.placeId === undefined && value.latitude === undefined && placeId === undefined && latitude === undefined) {
      errors.push('Choose a place or use your location before filtering by distance');
    } else {
      value.radiusKm = Number(radiusKm);
    }
  }
  if (country !== undefined) {
    if (!/^[A-Za-z]{2}$/.test(country)) errors.push('Country must be a two-letter ISO code');
    else value.country = country.toUpperCase();
  }
  if (region !== undefined) {
    if (!/^[A-Za-z0-9]{1,20}$/.test(region)) errors.push('Region must be a GeoNames region code');
    else if (country === undefined) errors.push('Choose a country before choosing a region');
    else value.region = region.toUpperCase();
  }
  return { valid: errors.length === 0, errors, value };
}

export function hasCenter(location) {
  return location.placeId !== undefined || location.latitude !== undefined;
}
