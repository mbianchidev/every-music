import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { realmConnector } from './realm-connector.js';
import { identityRepository } from './identity-repository.js';
import { publishEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { secretBox } from '../engines/secret-box.js';
import { cipherEngine } from '../engines/cipher-engine.js';
import { verifyTotp } from '../engines/totp.js';
import { requestError } from '../engines/request-error.js';

export const MAX_CODE_ATTEMPTS = 5;
export const MAX_RECENT_FAILURES = 10;
export const MAX_CODE_SENDS = 3;
const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_PATTERN = new RegExp(`^[${RECOVERY_ALPHABET}]{10}$`);

export const normalizeCode = code => String(code ?? '').replace(/[\s-]/g, '').toUpperCase();
export const isNumericCode = code => /^\d{6}$/.test(code);
export const isRecoveryCode = code => RECOVERY_PATTERN.test(code);
export const maskEmail = email => {
  const [local, domain] = String(email).split('@');
  return `${local.slice(0, 1)}***@${domain}`;
};
export const maskPhone = phone => `***${String(phone).slice(-2)}`;
const recoveryHash = code => createHash('sha256').update(`recovery:${code}`).digest('hex');

export function generateRecoveryCodes(count = 10) {
  // 256 is a multiple of 32, so masking each byte keeps the alphabet uniform.
  return Array.from({ length: count }, () => Array.from(randomBytes(10), byte => RECOVERY_ALPHABET[byte & 31]).join(''));
}

const fail = (status, code, message, extra = {}) => ({ error: [status, code, message], ...extra });
const attemptsLeft = attempts => `That code is not correct. ${MAX_CODE_ATTEMPTS - attempts} attempts left.`;

export function throwOutcome(outcome) {
  if (outcome?.error) throw requestError(...outcome.error);
  return outcome;
}

class TwoFactorRepository {
  async row(executor, userId, lock = false) {
    const { rows } = await executor.execute(`SELECT * FROM user_two_factor WHERE user_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [userId]);
    return rows[0] ?? null;
  }

  async enabled(executor, userId, lock = false) {
    const row = await this.row(executor, userId, lock);
    return row?.enabled_at ? row : null;
  }

  async status(userId, executor = realmConnector) {
    const row = await this.enabled(executor, userId);
    if (!row) return { enabled: false, method: null, enabledAt: null, phoneHint: null, recoveryCodesRemaining: 0, keyChanged: false };
    const { rows } = await executor.execute(
      'SELECT COUNT(*)::int AS count FROM two_factor_recovery_codes WHERE user_id = $1 AND used_at IS NULL', [userId],
    );
    let phoneHint = null;
    let keyChanged = false;
    try {
      if (row.method === 'sms') phoneHint = maskPhone(secretBox.open(row.phone_number));
      if (row.method === 'totp') secretBox.open(row.totp_secret);
    } catch (error) {
      if (error.code !== 'TWO_FACTOR_KEY_CHANGED') throw error;
      keyChanged = true;
    }
    return { enabled: true, method: row.method, enabledAt: row.enabled_at, phoneHint, recoveryCodesRemaining: rows[0].count, keyChanged };
  }

  async recentFailures(executor, userId) {
    const { rows } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM account_rate_events
      WHERE user_id = $1 AND action = 'two_factor_failure' AND created_at > NOW() - INTERVAL '15 minutes'`, [userId]);
    return rows[0].count;
  }

  async recordFailure(executor, userId) {
    await executor.execute("INSERT INTO account_rate_events (user_id, action) VALUES ($1, 'two_factor_failure')", [userId]);
  }

  async assertNotLocked(executor, userId) {
    if (await this.recentFailures(executor, userId) >= MAX_RECENT_FAILURES) {
      throw requestError(429, 'TWO_FACTOR_LOCKED', 'Too many incorrect two-step codes. Wait 15 minutes and try again.');
    }
  }

  // Starts or restarts enrollment; refuses while two-step verification is on.
  async beginEnrollment(executor, userId, { method, totpSecret = null, phone = null, code = null }) {
    const { rows } = await executor.execute(`
      INSERT INTO user_two_factor (user_id, method, totp_secret, phone_number, pending_code_hash, pending_expires_at)
      VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '10 minutes')
      ON CONFLICT (user_id) DO UPDATE SET method = EXCLUDED.method, totp_secret = EXCLUDED.totp_secret,
        phone_number = EXCLUDED.phone_number, pending_code_hash = EXCLUDED.pending_code_hash,
        pending_expires_at = EXCLUDED.pending_expires_at, pending_attempts = 0, totp_last_step = NULL, created_at = NOW()
      WHERE user_two_factor.enabled_at IS NULL
      RETURNING pending_expires_at AS "expiresAt"`, [
      userId, method, totpSecret && secretBox.seal(totpSecret), phone && secretBox.seal(phone),
      code && secretBox.digest(`enroll:${userId}`, code),
    ]);
    if (!rows.length) throw requestError(409, 'TWO_FACTOR_ENABLED', 'Two-step verification is already on. Turn it off before choosing another method.');
    return rows[0];
  }

  async completeEnrollment(userId, code) {
    return throwOutcome(await realmConnector.transaction(async executor => {
      const row = await this.row(executor, userId, true);
      if (row?.enabled_at) return fail(409, 'TWO_FACTOR_ENABLED', 'Two-step verification is already on.');
      if (!row?.pending_expires_at || new Date(row.pending_expires_at) <= new Date()) {
        return fail(400, 'TWO_FACTOR_SETUP_EXPIRED', 'This setup expired. Start two-step setup again.');
      }
      const normalized = normalizeCode(code);
      let step = null;
      const matched = row.method === 'totp'
        ? (step = verifyTotp(secretBox.open(row.totp_secret), normalized)) !== null
        : isNumericCode(normalized) && secretBox.matches(row.pending_code_hash, `enroll:${userId}`, normalized);
      if (!matched) {
        const attempts = row.pending_attempts + 1;
        if (attempts >= MAX_CODE_ATTEMPTS) {
          await executor.execute('DELETE FROM user_two_factor WHERE user_id = $1', [userId]);
          return fail(429, 'TWO_FACTOR_SETUP_LOCKED', 'Too many incorrect codes. Start two-step setup again.');
        }
        await executor.execute('UPDATE user_two_factor SET pending_attempts = $2 WHERE user_id = $1', [userId, attempts]);
        return fail(400, 'INVALID_TWO_FACTOR_CODE', attemptsLeft(attempts));
      }
      await executor.execute(`
        UPDATE user_two_factor SET enabled_at = NOW(), totp_last_step = $2, pending_code_hash = NULL,
          pending_expires_at = NULL, pending_attempts = 0 WHERE user_id = $1`, [userId, step]);
      const recoveryCodes = await this.replaceRecoveryCodes(executor, userId);
      await this.securityAlert(executor, userId, 'two_factor_enabled', 'Two-step verification was turned on', { method: row.method });
      return { method: row.method, recoveryCodes };
    }));
  }

  async replaceRecoveryCodes(executor, userId) {
    await executor.execute('DELETE FROM two_factor_recovery_codes WHERE user_id = $1', [userId]);
    const codes = generateRecoveryCodes();
    await executor.execute('INSERT INTO two_factor_recovery_codes (user_id, code_hash) SELECT $1, unnest($2::text[])', [userId, codes.map(recoveryHash)]);
    return codes.map(code => `${code.slice(0, 5)}-${code.slice(5)}`);
  }

  async disable(executor, userId) {
    await executor.execute('DELETE FROM two_factor_recovery_codes WHERE user_id = $1', [userId]);
    await executor.execute('DELETE FROM two_factor_challenges WHERE user_id = $1', [userId]);
    await executor.execute('DELETE FROM user_two_factor WHERE user_id = $1', [userId]);
    await this.securityAlert(executor, userId, 'two_factor_disabled', 'Two-step verification was turned off');
  }

  async securityAlert(executor, userId, event, title, params = {}) {
    await notificationRepository.create(executor, {
      userId, kind: 'security_alert', title, link: '#settings', params: { event, ...params },
    });
    await publishEvent(executor, 'security.changed', { userId });
  }

  // Issues a code for confirming changes when the enabled method is email/SMS.
  async issueStepUpCode(userId) {
    return realmConnector.transaction(async executor => {
      const row = await this.enabled(executor, userId, true);
      if (!row) throw requestError(400, 'TWO_FACTOR_DISABLED', 'Two-step verification is off.');
      if (row.method === 'totp') throw requestError(400, 'NO_CODE_DELIVERY', 'Use the code from your authenticator app.');
      const code = cipherEngine.generateNumericCode(6);
      await executor.execute(`
        UPDATE user_two_factor SET pending_code_hash = $2, pending_expires_at = NOW() + INTERVAL '10 minutes',
          pending_attempts = 0 WHERE user_id = $1`, [userId, secretBox.digest(`step-up:${userId}`, code)]);
      return { code, method: row.method, phone: row.method === 'sms' ? secretBox.open(row.phone_number) : null };
    });
  }

  // Checks a second-factor code against an enabled row in the caller's
  // transaction. `oneTime` describes the stored email/SMS digest.
  async checkCode(executor, row, code, oneTime) {
    const normalized = normalizeCode(code);
    if (isRecoveryCode(normalized)) {
      const used = await executor.execute(`
        UPDATE two_factor_recovery_codes SET used_at = NOW()
        WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING id`, [row.user_id, recoveryHash(normalized)]);
      return used.rowCount === 1 ? 'recovery' : null;
    }
    if (!isNumericCode(normalized)) return null;
    if (row.method === 'totp') {
      const lastStep = row.totp_last_step === null ? null : Number(row.totp_last_step);
      const step = verifyTotp(secretBox.open(row.totp_secret), normalized, { lastStep });
      if (step === null) return null;
      await executor.execute('UPDATE user_two_factor SET totp_last_step = $2 WHERE user_id = $1', [row.user_id, step]);
      return 'totp';
    }
    if (!oneTime?.hash || !oneTime.expiresAt || new Date(oneTime.expiresAt) <= new Date()) return null;
    return secretBox.matches(oneTime.hash, oneTime.scope, normalized) ? row.method : null;
  }

  // Step-up check used by re-authentication. Returns a failure outcome or null.
  async checkStepUp(executor, row, code) {
    if (!code) return fail(400, 'TWO_FACTOR_CODE_REQUIRED', 'Enter a two-step verification code or a recovery code.');
    const factor = await this.checkCode(executor, row, code, {
      hash: row.pending_code_hash, scope: `step-up:${row.user_id}`, expiresAt: row.pending_expires_at,
    });
    if (factor) {
      if (factor === 'email' || factor === 'sms') {
        await executor.execute('UPDATE user_two_factor SET pending_code_hash = NULL, pending_expires_at = NULL, pending_attempts = 0 WHERE user_id = $1', [row.user_id]);
      }
      if (factor === 'recovery') await this.securityAlert(executor, row.user_id, 'recovery_code_used', 'A recovery code was used');
      return null;
    }
    await this.recordFailure(executor, row.user_id);
    if (row.pending_code_hash) {
      const attempts = row.pending_attempts + 1;
      await executor.execute(`
        UPDATE user_two_factor SET pending_attempts = $2,
          pending_code_hash = CASE WHEN $2 >= $3 THEN NULL ELSE pending_code_hash END
        WHERE user_id = $1`, [row.user_id, attempts, MAX_CODE_ATTEMPTS]);
    }
    return fail(403, 'INVALID_TWO_FACTOR_CODE', 'That two-step code is not correct.');
  }

  async createChallenge(userId, method, code) {
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute(`
        INSERT INTO two_factor_challenges (id, user_id, token_hash, method, code_hash, sends)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING expires_at AS "expiresAt"`,
      [id, userId, cipherEngine.hashToken(token), method, code ? secretBox.digest(`login:${id}`, code) : null, code ? 1 : 0]);
      await executor.execute(`
        DELETE FROM two_factor_challenges WHERE user_id = $1 AND id NOT IN (
          SELECT id FROM two_factor_challenges WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT 5)`, [userId]);
      return { token, expiresAt: rows[0].expiresAt };
    });
  }

  async findChallenge(executor, token, lock = true) {
    const { rows } = await executor.execute(`
      SELECT c.*, u.email FROM two_factor_challenges c JOIN users u ON u.id = c.user_id
      WHERE c.token_hash = $1 AND c.expires_at > NOW() ${lock ? 'FOR UPDATE OF c' : ''}`, [cipherEngine.hashToken(token)]);
    return rows[0] ?? null;
  }

  async resendChallengeCode(token) {
    return realmConnector.transaction(async executor => {
      const challenge = await this.findChallenge(executor, token);
      if (!challenge) throw requestError(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'This sign-in expired. Sign in again.');
      if (challenge.method === 'totp') throw requestError(400, 'NO_CODE_DELIVERY', 'Use the code from your authenticator app.');
      if (challenge.sends >= MAX_CODE_SENDS) throw requestError(429, 'TWO_FACTOR_RESEND_LIMIT', 'No more codes can be sent for this sign-in. Use a recovery code or sign in again later.');
      const row = await this.enabled(executor, challenge.user_id);
      if (!row) throw requestError(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'This sign-in expired. Sign in again.');
      const code = cipherEngine.generateNumericCode(6);
      await executor.execute('UPDATE two_factor_challenges SET code_hash = $2, sends = sends + 1 WHERE id = $1', [
        challenge.id, secretBox.digest(`login:${challenge.id}`, code),
      ]);
      return { code, method: challenge.method, email: challenge.email, phone: challenge.method === 'sms' ? secretBox.open(row.phone_number) : null, expiresAt: challenge.expires_at };
    });
  }

  // Verifies the second sign-in step. `issue` creates the session inside the
  // same transaction so no token exists before the factor is accepted.
  async completeChallenge(token, code, issue) {
    return throwOutcome(await realmConnector.transaction(async executor => {
      const challenge = await this.findChallenge(executor, token);
      if (!challenge) return fail(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'This sign-in expired. Sign in again.');
      if (await this.recentFailures(executor, challenge.user_id) >= MAX_RECENT_FAILURES) {
        return fail(429, 'TWO_FACTOR_LOCKED', 'Too many incorrect two-step codes. Wait 15 minutes and try again.');
      }
      const identity = await identityRepository.findById(challenge.user_id, executor);
      const row = await this.enabled(executor, challenge.user_id, true);
      if (!identity || !row) {
        await executor.execute('DELETE FROM two_factor_challenges WHERE id = $1', [challenge.id]);
        return fail(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'This sign-in expired. Sign in again.');
      }
      if (!identity.is_active) return fail(403, 'ACCOUNT_DISABLED', 'Your account has been disabled');
      const factor = await this.checkCode(executor, row, code, {
        hash: challenge.code_hash, scope: `login:${challenge.id}`, expiresAt: challenge.expires_at,
      });
      if (!factor) {
        const attempts = challenge.attempts + 1;
        await this.recordFailure(executor, challenge.user_id);
        if (attempts >= MAX_CODE_ATTEMPTS) {
          await executor.execute('DELETE FROM two_factor_challenges WHERE id = $1', [challenge.id]);
          return fail(401, 'INVALID_TWO_FACTOR_CHALLENGE', 'Too many incorrect codes. Sign in again.');
        }
        await executor.execute('UPDATE two_factor_challenges SET attempts = $2 WHERE id = $1', [challenge.id, attempts]);
        return fail(401, 'INVALID_TWO_FACTOR_CODE', attemptsLeft(attempts));
      }
      await executor.execute('DELETE FROM two_factor_challenges WHERE id = $1', [challenge.id]);
      if (factor === 'recovery') await this.securityAlert(executor, identity.id, 'recovery_code_used', 'A recovery code was used');
      return { session: await issue(identity, executor), factor };
    }));
  }
}

export const twoFactorRepository = new TwoFactorRepository();
