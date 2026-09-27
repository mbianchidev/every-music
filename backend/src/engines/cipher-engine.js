import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import crypto from 'node:crypto';
import { realmConfig } from '../../config/realm.js';

export class CipherEngine {
  constructor(config = realmConfig) {
    this.config = config;
    this.saltRounds = 12;
  }

  async hashPassword(plainText) {
    return bcrypt.hash(plainText, this.saltRounds);
  }

  async validatePassword(plainText, hashedText) {
    return bcrypt.compare(plainText, hashedText);
  }

  generateToken(length = 32) {
    return nanoid(length);
  }

  generateNumericCode(digits = 6) {
    const minimum = 10 ** (digits - 1);
    const maximum = 10 ** digits;
    return crypto.randomInt(minimum, maximum).toString();
  }

  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  createPayloadToken(payload, key) {
    const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', key)
      .update(`${header}.${body}`)
      .digest('base64url');

    return `${header}.${body}.${signature}`;
  }

  verifyPayloadToken(token, { key, type }) {
    try {
      const segments = token.split('.');
      if (segments.length !== 3) {
        return null;
      }

      const [headerSegment, bodySegment, signature] = segments;
      const header = JSON.parse(Buffer.from(headerSegment, 'base64url').toString());

      if (header.typ !== 'JWT' || header.alg !== 'HS256') {
        return null;
      }

      const expectedSignature = crypto
        .createHmac('sha256', key)
        .update(`${headerSegment}.${bodySegment}`)
        .digest('base64url');
      const signatureBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (signatureBuffer.length !== expectedBuffer.length
        || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(bodySegment, 'base64url').toString());
      const now = Math.floor(Date.now() / 1000);

      if (payload.typ !== type
        || payload.iss !== this.config.cipher.issuer
        || payload.aud !== this.config.cipher.audience
        || !Number.isInteger(payload.exp)
        || now >= payload.exp) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  createAccessToken(userId, email) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresAt = issuedAt + (this.config.cipher.accessTokenMinutes * 60);

    return this.createPayloadToken({
      sub: userId,
      email,
      iat: issuedAt,
      exp: expiresAt,
      jti: this.generateToken(16),
      typ: 'access',
      iss: this.config.cipher.issuer,
      aud: this.config.cipher.audience,
    }, this.config.cipher.primaryKey);
  }

  createRefreshToken(userId, {
    issuedAt = Math.floor(Date.now() / 1000),
    expiresAt = issuedAt + (this.config.cipher.refreshTokenDays * 24 * 60 * 60),
    jti = this.generateToken(24),
  } = {}) {
    const token = this.createPayloadToken({
      sub: userId,
      iat: issuedAt,
      exp: expiresAt,
      jti,
      typ: 'refresh',
      iss: this.config.cipher.issuer,
      aud: this.config.cipher.audience,
    }, this.config.cipher.refreshKey);

    return {
      token,
      tokenHash: this.hashToken(token),
      expiresAt: new Date(expiresAt * 1000),
      issuedAt,
      jti,
    };
  }

  verifyAccessToken(token) {
    return this.verifyPayloadToken(token, {
      key: this.config.cipher.primaryKey,
      type: 'access',
    });
  }

  verifyRefreshToken(token) {
    return this.verifyPayloadToken(token, {
      key: this.config.cipher.refreshKey,
      type: 'refresh',
    });
  }
}

export const cipherEngine = new CipherEngine();
