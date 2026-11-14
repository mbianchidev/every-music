import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// RFC 4226 HOTP and RFC 6238 TOTP with the authenticator-app defaults:
// HMAC-SHA1, 30-second steps, and six digits.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_PERIOD_SECONDS = 30;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of clean) {
    const index = ALPHABET.indexOf(character);
    if (index === -1) throw new Error('Invalid base32 secret');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(byteLength = 20) {
  return base32Encode(randomBytes(byteLength));
}

export function hotp(key, counter, digits = 6) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totpStep(now = Date.now(), period = TOTP_PERIOD_SECONDS) {
  return Math.floor(now / 1000 / period);
}

export function totpCode(secret, { now = Date.now(), step = totpStep(now), digits = 6 } = {}) {
  return hotp(base32Decode(secret), step, digits);
}

function same(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Returns the matched time step, or null. Steps at or before lastStep are
// rejected so an observed code cannot be replayed.
export function verifyTotp(secret, code, { now = Date.now(), window = 1, lastStep = null } = {}) {
  if (!/^\d{6}$/.test(code ?? '')) return null;
  const key = base32Decode(secret);
  const current = totpStep(now);
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset;
    if (lastStep !== null && step <= lastStep) continue;
    if (same(hotp(key, step), code)) return step;
  }
  return null;
}

export function otpauthUri({ secret, account, issuer = 'Every.music' }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${query}`;
}
