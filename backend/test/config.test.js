import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmConfig, validateRealmConfig } from '../config/realm.js';

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
