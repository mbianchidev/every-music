import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmConfig, validateRealmConfig } from '../config/realm.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const validEnvironment = {
  REALM_ENV: 'test',
  REALM_CONNECTION: 'postgresql://localhost/everymusic',
  CIPHER_PRIMARY_KEY: 'primary-key-that-is-longer-than-thirty-two-characters',
  CIPHER_REFRESH_KEY: 'refresh-key-that-is-longer-than-thirty-two-characters',
  PORTAL_ORIGINS: 'http://localhost:3000,tauri://localhost',
};

test('creates typed configuration and trims origin lists', () => {
  const config = createRealmConfig(validEnvironment);

  assert.equal(config.nexus.port, 8080);
  assert.equal(config.cipher.accessTokenMinutes, 30);
  assert.deepEqual(config.boundaries.portalOrigins, [
    'http://localhost:3000',
    'tauri://localhost',
  ]);
  assert.equal(validateRealmConfig(config), true);
});

test('builds a safely encoded connection string from discrete database settings', () => {
  const config = createRealmConfig({
    ...validEnvironment,
    REALM_CONNECTION: '',
    REALM_HOST: 'database',
    REALM_PORT: '5432',
    REALM_NAME: 'every music',
    REALM_USER: 'everymusic',
    REALM_PASSWORD: 'password/with:symbols',
  });

  assert.equal(
    config.realm.connectionString,
    'postgresql://everymusic:password%2Fwith%3Asymbols@database:5432/every%20music',
  );
});

test('rejects identical signing keys', () => {
  const config = createRealmConfig({
    ...validEnvironment,
    CIPHER_REFRESH_KEY: validEnvironment.CIPHER_PRIMARY_KEY,
  });

  assert.throws(
    () => validateRealmConfig(config),
    /must be different/,
  );
});

test('requires mail delivery configuration in production', () => {
  const config = createRealmConfig({
    ...validEnvironment,
    REALM_ENV: 'production',
  });

  assert.throws(
    () => validateRealmConfig(config),
    /Production email delivery requires/,
  );
});

test('destructive setup and smoke commands never fall back to a default database', async t => {
  let connections = 0;
  const server = createServer(socket => { connections += 1; socket.destroy(); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const { port } = server.address();
  for (const script of ['bootstrap-realm.js', 'smoke.js']) {
    await assert.rejects(promisify(execFile)(process.execPath, [`scripts/${script}`], {
      cwd: fileURLToPath(new URL('../', import.meta.url)),
      timeout: 5000,
      env: {
        ...process.env, REALM_CONNECTION: '', PGHOST: '127.0.0.1', PGPORT: String(port),
        PGUSER: 'synthetic', PGPASSWORD: 'synthetic', PGDATABASE: 'synthetic', SMOKE_BASE_URL: `http://127.0.0.1:${port}`,
      },
    }), error => error.code === 1 && /REALM_CONNECTION/.test(error.stderr));
  }
  assert.equal(connections, 0);
});
