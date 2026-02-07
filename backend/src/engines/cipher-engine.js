import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import crypto from 'crypto';
import { realmConfig } from '../../config/realm.js';

export class CipherEngine {
  constructor() {
    this.saltRounds = 12;
    this.algorithm = 'aes-256-cbc';
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
    const max = Math.pow(10, digits) - 1;
    const min = Math.pow(10, digits - 1);
    return Math.floor(Math.random() * (max - min + 1) + min).toString();
  }

  createPayloadToken(payload) {
    const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', realmConfig.cipher.primaryKey)
      .update(`${header}.${body}`)
      .digest('base64url');
    
    return `${header}.${body}.${signature}`;
  }

  verifyPayloadToken(token) {
    try {
      const segments = token.split('.');
      if (segments.length !== 3) {
        return null;
      }

      const [header, body, signature] = segments;
      const expectedSignature = crypto
        .createHmac('sha256', realmConfig.cipher.primaryKey)
        .update(`${header}.${body}`)
        .digest('base64url');

      if (signature !== expectedSignature) {
        return null;
      }

      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      
      if (payload.exp && Date.now() >= payload.exp) {
        return null;
      }

      return payload;
    } catch {
      return null;
    }
  }

  createAccessToken(userId, email) {
    const now = Date.now();
    const expiresAt = now + (realmConfig.cipher.tokenLifespan * 60 * 60 * 1000);
    
    return this.createPayloadToken({
      sub: userId,
      email: email,
      iat: now,
      exp: expiresAt,
      typ: 'access',
    });
  }

  createRefreshToken(userId) {
    const now = Date.now();
    const expiresAt = now + (realmConfig.cipher.refreshLifespan * 60 * 60 * 1000);
    
    return {
      token: this.createPayloadToken({
        sub: userId,
        iat: now,
        exp: expiresAt,
        typ: 'refresh',
      }),
      expiresAt: new Date(expiresAt),
    };
  }

  extractUserId(token) {
    const payload = this.verifyPayloadToken(token);
    return payload ? payload.sub : null;
  }
}

export const cipherEngine = new CipherEngine();
