import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { realmConfig } from '../config/realm.js';
import { runMigrations } from '../scripts/migrate-realm.js';
import { communityRepository } from '../src/repositories/community-repository.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString || !process.env.MIGRATION_BASE_REF) {
  throw new Error('Migration tests require REALM_ENV=test, an isolated REALM_CONNECTION with CREATEDB, and MIGRATION_BASE_REF');
}

test('fresh installs and upgrades converge, preserve legacy data, and allow migration replay', async t => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const base = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${process.env.MIGRATION_BASE_REF}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
  assert.match(base, /^[0-9a-f]{40,64}$/);
  const previous = execFileSync('git', ['--no-pager', 'show', `${base}:backend/database/schema.sql`], { cwd: root, encoding: 'utf8' });
  const current = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../database/migrations/003_community.sql', import.meta.url), 'utf8');
  const encryptionMigration = await readFile(new URL('../database/migrations/004_admin_and_encryption.sql', import.meta.url), 'utf8');
  const admin = new pg.Pool({ connectionString: realmConfig.realm.connectionString, max: 1 });
  const created = [];
  const pools = [];
  t.after(async () => {
    await Promise.all(pools.map(pool => pool.end()));
    for (const name of created) await admin.query(`DROP DATABASE "${name}"`);
    await admin.end();
  });
  const logger = { info() {}, warn: console.warn };
  const schema = async pool => {
    const columns = await pool.query(`
      SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length
      FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`);
    const indexes = await pool.query(`
      SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname`);
    const constraints = await pool.query(`
      SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
      ORDER BY c.relname, con.conname`);
    return { columns: columns.rows, indexes: indexes.rows, constraints: constraints.rows };
  };
  const results = [];
  for (const [label, sql] of [['fresh', current], ['upgrade', previous]]) {
    const name = `everymusic_${label}_${randomUUID().replaceAll('-', '')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    created.push(name);
    const connection = new URL(realmConfig.realm.connectionString);
    connection.pathname = `/${name}`;
    const connectionString = connection.href;
    const pool = new pg.Pool({ connectionString, max: 1 });
    pools.push(pool);
    await pool.query(sql);
    await pool.query(migration);
    const { rows: users } = await pool.query(
      "INSERT INTO users (email, email_verified) VALUES ('migration@example.test', TRUE) RETURNING id",
    );
    const userId = users[0].id;
    const peerId = (await pool.query("INSERT INTO users (email, email_verified) VALUES ('migration-peer@example.test', TRUE) RETURNING id")).rows[0].id;
    const { rows: profiles } = await pool.query('INSERT INTO profiles (user_id, artist_name) VALUES ($1, $2) RETURNING id', [userId, 'Synthetic legacy musician']);
    await pool.query('INSERT INTO projects (profile_id, name) VALUES ($1, $2)', [profiles[0].id, 'Synthetic legacy project']);
    const conversation = (await pool.query('INSERT INTO conversations (first_user_id, second_user_id) VALUES ($1, $2) RETURNING id', [userId, peerId].sort())).rows[0].id;
    const liveMessage = (await pool.query('INSERT INTO messages (conversation_id, sender_id, client_id, body) VALUES ($1, $2, $3, $4) RETURNING id',
      [conversation, userId, randomUUID(), 'Synthetic legacy history retained without relabelling it encrypted.'])).rows[0].id;
    const alreadyEncryptedSchema = (await pool.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'messages' AND column_name = 'encryption_version'")).rowCount > 0;
    const deletedMessage = (await pool.query('INSERT INTO messages (conversation_id, sender_id, client_id, body, is_deleted) VALUES ($1, $2, $3, $4, TRUE) RETURNING id',
      [conversation, userId, randomUUID(), alreadyEncryptedSchema ? null : 'Message removed'])).rows[0].id;
    await runMigrations({ connectionString, logger });
    await runMigrations({ connectionString, logger });
    await pool.query(migration);
    await pool.query(migration);
    await pool.query(encryptionMigration);
    await pool.query(encryptionMigration);
    assert.equal((await pool.query('SELECT artist_name FROM profiles WHERE user_id = $1', [userId])).rows[0].artist_name, 'Synthetic legacy musician');
    assert.deepEqual((await pool.query('SELECT name, collaborators FROM projects')).rows, [
      { name: 'Synthetic legacy project', collaborators: [] },
    ]);
    assert.equal((await communityRepository.preferences(userId, { execute: pool.query.bind(pool) })).analytics, false);
    assert.equal((await communityRepository.preferences(userId, { execute: pool.query.bind(pool) })).platformAnalytics, false);
    assert.equal((await pool.query('SELECT role FROM users WHERE id = $1', [userId])).rows[0].role, 'member');
    assert.deepEqual((await pool.query('SELECT body, encryption_version, ciphertext FROM messages WHERE id = $1', [liveMessage])).rows[0], {
      body: 'Synthetic legacy history retained without relabelling it encrypted.', encryption_version: 0, ciphertext: null,
    });
    assert.equal((await pool.query('SELECT body FROM messages WHERE id = $1', [deletedMessage])).rows[0].body, null);
    results.push(await schema(pool));
  }
  assert.deepEqual(results[1], results[0]);
});
