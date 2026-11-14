// "Use my location" is a client-side opt-in. Coordinates are requested only
// when the user asks for nearby results and are never stored by the client.
const PREFERENCE_KEY = 'everymusic.use-location';

function storage(store) {
  try { return store ?? globalThis.localStorage ?? null; } catch { return null; }
}

export function locationEnabled(store) {
  try { return storage(store)?.getItem(PREFERENCE_KEY) === 'true'; } catch { return false; }
}

export function setLocationEnabled(enabled, store) {
  try {
    if (enabled) storage(store)?.setItem(PREFERENCE_KEY, 'true');
    else storage(store)?.removeItem(PREFERENCE_KEY);
    return true;
  } catch (error) {
    console.warn('Could not save the location preference', error);
    return false;
  }
}

export class LocationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

// Rounds to about one kilometre so requests never carry a precise position.
export const roundCoordinate = value => Math.round(value * 100) / 100;

export function currentPosition({ geolocation = globalThis.navigator?.geolocation, timeout = 10000 } = {}) {
  if (!geolocation?.getCurrentPosition) {
    return Promise.reject(new LocationError('unsupported', 'Location is not available in this browser.'));
  }
  return new Promise((resolve, reject) => {
    geolocation.getCurrentPosition(
      position => resolve({
        latitude: roundCoordinate(position.coords.latitude),
        longitude: roundCoordinate(position.coords.longitude),
      }),
      error => reject(new LocationError(error?.code === 1 ? 'denied' : 'unavailable', error?.message || 'Location unavailable')),
      { enableHighAccuracy: false, maximumAge: 600000, timeout },
    );
  });
}
