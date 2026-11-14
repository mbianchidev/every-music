export const DISTANCES = [10, 25, 50, 100, 250, 500];

export const discoveryDefaults = {
  isCoverBand: '', openToProjects: '', placeId: '', placeLabel: '', radiusKm: '', country: '', region: '',
};

const shared = ['searchTerm', 'city', 'instrumentId', 'genreId', 'createdWithin'];

function present(value) {
  return value !== '' && value !== undefined && value !== null;
}

export function hasCenter(filters, nearMe) {
  return Boolean(nearMe) || present(filters.placeId);
}

// Builds the API query for /announcements/search or /profiles/search. Browser
// coordinates (`nearMe`) are sent for this request only and never kept in the URL.
export function searchQuery(filters, { profiles = false, nearMe = null, page = 1, pageSize = 12 } = {}) {
  const query = new URLSearchParams();
  const keys = [...shared, ...(profiles ? ['openToProjects'] : ['isRemote', 'isCoverBand']), 'country', 'region'];
  for (const key of keys) if (present(filters[key])) query.set(key, filters[key]);
  if (nearMe) {
    query.set('latitude', String(nearMe.latitude));
    query.set('longitude', String(nearMe.longitude));
  } else if (present(filters.placeId)) {
    query.set('placeId', filters.placeId);
  }
  const center = hasCenter(filters, nearMe);
  if (center && present(filters.radiusKm)) query.set('radiusKm', filters.radiusKm);
  const sort = filters.sort === 'distance' && !center ? 'newest' : filters.sort;
  if (present(sort)) query.set('sort', sort);
  query.set('page', String(page));
  query.set('pageSize', String(pageSize));
  return query.toString();
}

const booleanValue = value => (value === 'true' ? true : value === 'false' ? false : undefined);

// Body for POST /saved-searches. The server turns "near me" into the nearest city.
export function savedSearchFilters(filters, nearMe = null) {
  const body = {};
  for (const key of ['searchTerm', 'city', 'instrumentId', 'genreId', 'country', 'region']) {
    if (present(filters[key])) body[key] = String(filters[key]).trim();
  }
  for (const key of ['isRemote', 'isCoverBand']) {
    const value = booleanValue(filters[key]);
    if (value !== undefined) body[key] = value;
  }
  if (nearMe) Object.assign(body, { latitude: nearMe.latitude, longitude: nearMe.longitude });
  else if (present(filters.placeId)) body.placeId = Number(filters.placeId);
  if ((nearMe || present(filters.placeId)) && present(filters.radiusKm)) body.radiusKm = Number(filters.radiusKm);
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== ''));
}

// Feed hash for opening a saved search again.
export function savedSearchLink(saved) {
  const filters = saved.filters || {};
  const query = new URLSearchParams();
  for (const key of ['searchTerm', 'city', 'instrumentId', 'genreId', 'country', 'region', 'placeId', 'placeLabel', 'radiusKm']) {
    if (present(filters[key])) query.set(key, String(filters[key]));
  }
  for (const key of ['isRemote', 'isCoverBand']) if (typeof filters[key] === 'boolean') query.set(key, String(filters[key]));
  return `#feed?${query.toString()}`;
}

// Human summary of saved filters, e.g. for default names and list rows.
export function describeFilters(filters, { instruments = [], genres = [] } = {}, t) {
  const parts = [];
  if (filters.searchTerm) parts.push(`"${filters.searchTerm}"`);
  const instrument = instruments.find(item => item.id === filters.instrumentId);
  if (instrument) parts.push(instrument.name);
  const genre = genres.find(item => item.id === filters.genreId);
  if (genre) parts.push(genre.name);
  if (filters.isCoverBand === true || filters.isCoverBand === 'true') parts.push(t('discoveryExtras.summary.coverBand'));
  if (filters.isCoverBand === false || filters.isCoverBand === 'false') parts.push(t('discoveryExtras.summary.originals'));
  if (filters.isRemote === true || filters.isRemote === 'true') parts.push(t('discoveryExtras.summary.remote'));
  if (filters.city) parts.push(filters.city);
  if (filters.placeLabel) {
    parts.push(filters.radiusKm
      ? t('discoveryExtras.summary.within', { distance: filters.radiusKm, place: filters.placeLabel })
      : t('discoveryExtras.summary.near', { place: filters.placeLabel }));
  }
  if (filters.country && !filters.placeLabel) parts.push(filters.region ? `${filters.region}, ${filters.country}` : filters.country);
  return parts.join(' · ');
}
