import test from 'node:test';
import assert from 'node:assert/strict';
import { CipherEngine } from '../src/engines/cipher-engine.js';

const config = {
  cipher: {
    primaryKey: 'primary-key-that-is-longer-than-thirty-two-characters',
    refreshKey: 'refresh-key-that-is-longer-than-thirty-two-characters',
    issuer: 'every.music.test',
    audience: 'every.music.test.clients',
    accessTokenMinutes: 30,
    refreshTokenDays: 30,
  },
};

test('creates independently signed access and refresh tokens', () => {
  const engine = new CipherEngine(config);
  const accessToken = engine.createAccessToken('user-1', 'player@example.com');
  const refresh = engine.createRefreshToken('user-1');

  assert.equal(engine.verifyAccessToken(accessToken).sub, 'user-1');
  assert.equal(engine.verifyRefreshToken(refresh.token).sub, 'user-1');
  assert.equal(engine.verifyAccessToken(refresh.token), null);
  assert.equal(engine.verifyRefreshToken(accessToken), null);
});

test('rejects tampered tokens', () => {
  const engine = new CipherEngine(config);
  const token = engine.createAccessToken('user-1', 'player@example.com');
  const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;

  assert.equal(engine.verifyAccessToken(tampered), null);
});

test('hashes opaque tokens before persistence', () => {
  const engine = new CipherEngine(config);
  const token = engine.generateToken();
  const hash = engine.hashToken(token);

  assert.equal(hash.length, 64);
  assert.notEqual(hash, token);
  assert.equal(engine.hashToken(token), hash);
});

test('recreates the same rotated token during the lost-response grace window', () => {
  const engine = new CipherEngine(config);
  const options = {
    issuedAt: 1_800_000_000,
    expiresAt: 1_802_592_000,
    jti: 'fixed-rotation-identifier',
  };

  const first = engine.createRefreshToken('user-1', options);
  const retry = engine.createRefreshToken('user-1', options);

  assert.equal(retry.token, first.token);
  assert.equal(retry.tokenHash, first.tokenHash);
});

test('uses a cryptographically secure fixed-width numeric code', () => {
  const engine = new CipherEngine(config);
  assert.match(engine.generateNumericCode(6), /^\d{6}$/);
});
