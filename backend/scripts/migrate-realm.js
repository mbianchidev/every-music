import 'dotenv/config';
import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realmConfig, validateRealmConfig } from '../config/realm.js';

const { Pool } = pg;
const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), '../database/migrations');

export async function runMigrations({ logger = console } = {}) {
  validateRealmConfig();

  const pool = new Pool({ connectionString: realmConfig.realm.connectionString });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrationNames = (await readdir(migrationsDirectory))
      .filter((name) => name.endsWith('.sql'))
      .sort();

    for (const name of migrationNames) {
      const existing = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE name = $1',
        [name],
      );

      if (existing.rowCount > 0) {
        continue;
      }

      const sql = await readFile(join(migrationsDirectory, name), 'utf8');
      const connection = await pool.connect();
      let released = false;

      try {
        await connection.query('BEGIN');
        await connection.query(sql);
        await connection.query(
          'INSERT INTO schema_migrations (name) VALUES ($1)',
          [name],
        );
        await connection.query('COMMIT');
        logger.info(`Applied migration ${name}`);
      } catch (error) {
        await connection.query('ROLLBACK');
        connection.release(error);
        released = true;
        throw error;
      } finally {
        if (!released) {
          connection.release();
        }
      }
    }
  } finally {
    await pool.end();
  }
}

const isEntrypoint = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  runMigrations().catch((error) => {
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  });
}
