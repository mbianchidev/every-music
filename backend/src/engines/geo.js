// Portable distance search without PostGIS: an indexed bounding-box prefilter
// on latitude/longitude followed by an exact haversine check.
export const EARTH_RADIUS_KM = 6371.0088;
const KM_PER_DEGREE = (Math.PI * EARTH_RADIUS_KM) / 180;
const radians = degrees => (degrees * Math.PI) / 180;

export function haversineKm(from, to) {
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const a = Math.sin(latitude / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Returns latitude bounds plus one or two longitude ranges (two when the box
// crosses the antimeridian), or `longitudes: null` when every longitude can
// be within range (near the poles or for very large radii).
export function boundingBox({ latitude, longitude }, radiusKm) {
  const latitudeDelta = radiusKm / KM_PER_DEGREE;
  const minLatitude = Math.max(-90, latitude - latitudeDelta);
  const maxLatitude = Math.min(90, latitude + latitudeDelta);
  if (minLatitude <= -90 || maxLatitude >= 90) return { minLatitude, maxLatitude, longitudes: null };
  const widest = Math.max(Math.abs(minLatitude), Math.abs(maxLatitude));
  const longitudeDelta = latitudeDelta / Math.cos(radians(widest));
  if (longitudeDelta >= 180) return { minLatitude, maxLatitude, longitudes: null };
  const west = longitude - longitudeDelta;
  const east = longitude + longitudeDelta;
  if (west < -180) return { minLatitude, maxLatitude, longitudes: [[west + 360, 180], [-180, east]] };
  if (east > 180) return { minLatitude, maxLatitude, longitudes: [[west, 180], [-180, east - 360]] };
  return { minLatitude, maxLatitude, longitudes: [[west, east]] };
}

export function distanceSql(latitudeColumn, longitudeColumn, latitude, longitude) {
  return `(2 * ${EARTH_RADIUS_KM} * asin(least(1, sqrt(
    power(sin(radians(${latitudeColumn}::float8 - ${latitude}) / 2), 2)
    + cos(radians(${latitude})) * cos(radians(${latitudeColumn}::float8))
    * power(sin(radians(${longitudeColumn}::float8 - ${longitude}) / 2), 2)))))`;
}

// `add(value)` appends a bound parameter and returns its placeholder.
export function proximity({ latitudeColumn, longitudeColumn, center, radiusKm }, add) {
  const latitude = `${add(center.latitude)}::float8`;
  const longitude = `${add(center.longitude)}::float8`;
  const distance = distanceSql(latitudeColumn, longitudeColumn, latitude, longitude);
  const conditions = [];
  if (radiusKm) {
    const box = boundingBox(center, radiusKm);
    conditions.push(`${latitudeColumn} BETWEEN ${add(box.minLatitude)} AND ${add(box.maxLatitude)}`);
    if (box.longitudes) {
      conditions.push(`(${box.longitudes.map(([west, east]) => `${longitudeColumn} BETWEEN ${add(west)} AND ${add(east)}`).join(' OR ')})`);
    }
    conditions.push(`${distance} <= ${add(radiusKm)}::float8`);
  }
  return { distance, conditions };
}

export function binder(values) {
  return (value) => {
    values.push(value);
    return `$${values.length}`;
  };
}
