import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { PLACE_SEED_COLUMNS } from '../src/engines/place-names.js';

export const PLACE_SEED = new URL('../database/seeds/places.tsv.gz', import.meta.url);
export const PLACE_DATASET = 'geonames-cities15000';

export function parsePlaceSeed(content) {
  const [header, ...lines] = content.split('\n').filter(Boolean);
  if (header !== PLACE_SEED_COLUMNS.join('\t')) throw new Error('The place seed has unexpected columns; regenerate it with scripts/generate-places.mjs');
  return lines.map((line) => {
    const columns = line.split('\t');
    if (columns.length !== PLACE_SEED_COLUMNS.length) throw new Error(`Malformed place seed row: ${line.slice(0, 40)}`);
    return columns;
  });
}

const upsert = `
  INSERT INTO places (id, name, country_code, country_name, region_code, region_name, latitude, longitude, population, search_names)
  SELECT id, name, country_code, country_name, NULLIF(region_code, ''), NULLIF(region_name, ''), latitude, longitude, population, search_names
  FROM unnest($1::int[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::float8[], $8::float8[], $9::int[], $10::text[])
    AS seed(id, name, country_code, country_name, region_code, region_name, latitude, longitude, population, search_names)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, country_code = EXCLUDED.country_code, country_name = EXCLUDED.country_name,
    region_code = EXCLUDED.region_code, region_name = EXCLUDED.region_name, latitude = EXCLUDED.latitude,
    longitude = EXCLUDED.longitude, population = EXCLUDED.population, search_names = EXCLUDED.search_names
  WHERE (places.name, places.country_code, places.country_name, places.region_code, places.region_name,
    places.latitude, places.longitude, places.population, places.search_names)
    IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.country_code, EXCLUDED.country_name, EXCLUDED.region_code,
    EXCLUDED.region_name, EXCLUDED.latitude, EXCLUDED.longitude, EXCLUDED.population, EXCLUDED.search_names)`;

// Idempotent: rows are upserted by GeoNames ID and never deleted, so place
// references stay valid; an unchanged seed checksum skips the load entirely.
export async function loadPlaces(pool, { logger = console, seed = PLACE_SEED, batchSize = 5000 } = {}) {
  const content = gunzipSync(await readFile(seed)).toString('utf8');
  const checksum = createHash('sha256').update(content).digest('hex');
  const loaded = await pool.query('SELECT checksum FROM place_datasets WHERE name = $1', [PLACE_DATASET]);
  if (loaded.rows[0]?.checksum === checksum) return { loaded: false, rows: 0 };
  const rows = parsePlaceSeed(content);
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query("SELECT pg_advisory_xact_lock(hashtext('everymusic.places'))");
    const again = await connection.query('SELECT checksum FROM place_datasets WHERE name = $1', [PLACE_DATASET]);
    if (again.rows[0]?.checksum === checksum) {
      await connection.query('COMMIT');
      connection.release();
      return { loaded: false, rows: 0 };
    }
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      await connection.query(upsert, PLACE_SEED_COLUMNS.map((_, column) => batch.map(row => row[column])));
    }
    await connection.query(`
      INSERT INTO place_datasets (name, checksum, row_count) VALUES ($1, $2, $3)
      ON CONFLICT (name) DO UPDATE SET checksum = EXCLUDED.checksum, row_count = EXCLUDED.row_count, loaded_at = NOW()`,
    [PLACE_DATASET, checksum, rows.length]);
    await connection.query('COMMIT');
    await connection.query('ANALYZE places');
    connection.release();
  } catch (error) {
    await connection.query('ROLLBACK').catch(() => {});
    connection.release(error);
    throw error;
  }
  logger.info(`Loaded ${rows.length} GeoNames places`);
  return { loaded: true, rows: rows.length };
}
