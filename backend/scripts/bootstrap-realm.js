import 'dotenv/config';
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (!process.env.REALM_CONNECTION) {
  throw new Error('REALM_CONNECTION must explicitly target a new isolated development database before bootstrap');
}

const pool = new Pool({
  connectionString: process.env.REALM_CONNECTION,
});

async function bootstrapRealm() {
  console.log('🚀 Starting realm bootstrap...\n');

  try {
    const schemaPath = join(__dirname, '../database/schema.sql');
    const schemaSQL = readFileSync(schemaPath, 'utf-8');

    console.log('📋 Executing schema creation...');
    await pool.query(schemaSQL);
    console.log('✓ Schema created successfully\n');

    const instrumentsPath = join(__dirname, '../database/seeds/instruments.sql');
    const instrumentsSQL = readFileSync(instrumentsPath, 'utf-8');
    console.log('🎸 Seeding instruments...');
    await pool.query(instrumentsSQL);
    console.log('✓ Instruments seeded\n');

    const genresPath = join(__dirname, '../database/seeds/genres.sql');
    const genresSQL = readFileSync(genresPath, 'utf-8');
    console.log('🎵 Seeding genres...');
    await pool.query(genresSQL);
    console.log('✓ Genres seeded\n');

    const instrumentCount = await pool.query('SELECT COUNT(*) FROM instruments');
    const genreCount = await pool.query('SELECT COUNT(*) FROM genres');

    console.log('📊 Bootstrap Summary:');
    console.log(`   - Instruments: ${instrumentCount.rows[0].count}`);
    console.log(`   - Genres: ${genreCount.rows[0].count}`);
    console.log('\n✅ Realm bootstrap completed successfully!');

  } catch (err) {
    console.error('❌ Bootstrap failed:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

bootstrapRealm().catch(err => {
  console.error(err);
  process.exit(1);
});
