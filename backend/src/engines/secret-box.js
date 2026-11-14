import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { realmConfig } from '../../config/realm.js';
import { requestError } from './request-error.js';

// Seals two-factor secrets (TOTP seeds and SMS phone numbers) with AES-256-GCM
// and keys one-time code digests. The key is TWO_FACTOR_ENCRYPTION_KEY when set,
// otherwise it is derived from CIPHER_PRIMARY_KEY. Changing whichever source is
// in use makes existing sealed values unreadable; see docs/configuration.md.
export class SecretBox {
  constructor(config = realmConfig) {
    this.config = config;
    this.cache = null;
  }

  material() {
    const dedicated = this.config.accountTrust?.twoFactorKey;
    const source = dedicated || this.config.cipher.primaryKey;
    if (this.cache?.source === source) return this.cache;
    if (!source) throw new Error('A cipher key is required for two-factor secrets');
    const key = Buffer.from(hkdfSync('sha256', source, dedicated ? 'every.music dedicated' : 'every.music derived', 'every.music two-factor v1', 32));
    this.cache = { source, key, id: createHash('sha256').update(key).digest('hex').slice(0, 8) };
    return this.cache;
  }

  seal(plaintext) {
    const { key, id } = this.material();
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(id));
    const sealed = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
    return ['v1', id, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), sealed.toString('base64url')].join('.');
  }

  open(value) {
    const { key, id } = this.material();
    const [version, keyId, iv, tag, sealed] = String(value).split('.');
    if (version !== 'v1' || keyId !== id) {
      throw requestError(409, 'TWO_FACTOR_KEY_CHANGED', 'This two-step method can no longer be read after a server key change. Use a recovery code, then set it up again.');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAAD(Buffer.from(id));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(sealed, 'base64url')), decipher.final()]).toString('utf8');
    } catch {
      throw requestError(409, 'TWO_FACTOR_KEY_CHANGED', 'This two-step method can no longer be read after a server key change. Use a recovery code, then set it up again.');
    }
  }

  digest(scope, code) {
    return createHmac('sha256', this.material().key).update(`${scope}:${code}`).digest('hex');
  }

  matches(expected, scope, code) {
    if (typeof expected !== 'string' || expected.length !== 64) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(this.digest(scope, code)));
  }
}

export const secretBox = new SecretBox();
