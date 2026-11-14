import { realmConnector } from './realm-connector.js';
import { foldPlaceName } from '../engines/place-names.js';
import { distanceSql } from '../engines/geo.js';

const columns = 'id, name, country_code, country_name, region_code, region_name, latitude, longitude';

export function placeView(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    region: row.region_name || null,
    regionCode: row.region_code || null,
    country: row.country_name,
    countryCode: row.country_code,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    label: [row.name, row.region_name, row.country_name].filter(Boolean).join(', '),
  };
}

// Builds a place view from columns prefixed with `place_` in a joined row.
export function joinedPlace(row) {
  return row.place_id ? placeView({
    id: row.place_id, name: row.place_name, region_name: row.place_region_name, region_code: row.place_region_code,
    country_name: row.place_country_name, country_code: row.place_country_code,
    latitude: row.place_latitude, longitude: row.place_longitude,
  }) : null;
}

export const placeJoinColumns = alias => `
  ${alias}.id AS place_id, ${alias}.name AS place_name, ${alias}.region_name AS place_region_name,
  ${alias}.region_code AS place_region_code, ${alias}.country_name AS place_country_name,
  ${alias}.country_code AS place_country_code, ${alias}.latitude AS place_latitude, ${alias}.longitude AS place_longitude`;

class PlaceRepository {
  // Prefix search across the primary name and Latin-script exonyms
  // ("Milano", "Den Haag"); the most populous matches come first.
  async search(query, { limit = 8, country } = {}, executor = realmConnector) {
    const folded = foldPlaceName(query);
    if (folded.length < 2) return [];
    const { rows } = await executor.execute(`
      SELECT ${columns} FROM places
      WHERE search_names LIKE $1 AND ($4::text IS NULL OR country_code = $4)
      ORDER BY (search_names LIKE $2) DESC, (search_names LIKE $3) DESC, population DESC, id
      LIMIT $5`, [`%|${folded}%`, `|${folded}|%`, `|${folded}%`, country ?? null, limit]);
    return rows.map(placeView);
  }

  async find(id, executor = realmConnector) {
    if (!Number.isInteger(id) || id < 1 || id > 2147483647) return null;
    const { rows } = await executor.execute(`SELECT ${columns} FROM places WHERE id = $1`, [id]);
    return placeView(rows[0]);
  }

  async nearest({ latitude, longitude }, executor = realmConnector) {
    for (const degrees of [0.5, 2, 6]) {
      const { rows } = await executor.execute(`
        SELECT ${columns} FROM places
        WHERE latitude BETWEEN $1::float8 - $3 AND $1::float8 + $3
          AND longitude BETWEEN $2::float8 - $4 AND $2::float8 + $4
        ORDER BY ${distanceSql('latitude', 'longitude', '$1::float8', '$2::float8')}, population DESC
        LIMIT 1`, [latitude, longitude, degrees, Math.min(180, degrees / Math.max(0.05, Math.cos((latitude * Math.PI) / 180)))]);
      if (rows.length) return placeView(rows[0]);
    }
    return null;
  }

  async countries(executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT country_code AS code, MIN(country_name) AS name FROM places
      GROUP BY country_code ORDER BY MIN(country_name), country_code`);
    return rows;
  }

  async regions(country, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT region_code AS code, MIN(region_name) AS name FROM places
      WHERE country_code = $1 AND region_code IS NOT NULL AND region_name IS NOT NULL
      GROUP BY region_code ORDER BY MIN(region_name), region_code`, [country]);
    return rows;
  }
}

export const placeRepository = new PlaceRepository();
