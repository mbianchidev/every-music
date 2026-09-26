import { realmConnector } from './realm-connector.js';

export class IdentityRepository {
  async findByEmail(email, executor = realmConnector) {
    const query = `
      SELECT id, email, password_hash, auth_provider, google_id,
             email_verified, is_active, is_deleted, created_at, last_login
      FROM users
      WHERE LOWER(email) = LOWER($1) AND is_deleted = false
    `;
    const result = await executor.execute(query, [email]);
    return result.rows[0] || null;
  }

  async findByGoogleId(googleId, executor = realmConnector) {
    const query = `
      SELECT id, email, auth_provider, google_id, email_verified,
             is_active, created_at, last_login
      FROM users
      WHERE google_id = $1 AND is_deleted = false
    `;
    const result = await executor.execute(query, [googleId]);
    return result.rows[0] || null;
  }

  async findById(userId, executor = realmConnector) {
    const query = `
      SELECT id, email, auth_provider, google_id, email_verified,
             is_active, created_at, last_login
      FROM users
      WHERE id = $1 AND is_deleted = false
    `;
    const result = await executor.execute(query, [userId]);
    return result.rows[0] || null;
  }

  async createEmailIdentity(email, passwordHash, verificationTokenHash, executor = realmConnector) {
    const query = `
      INSERT INTO users (
        email, password_hash, auth_provider, verification_token_hash,
        verification_token_expires
      )
      VALUES (LOWER($1), $2, 'email', $3, NOW() + INTERVAL '24 hours')
      RETURNING id, email, email_verified, created_at
    `;
    const result = await executor.execute(query, [
      email,
      passwordHash,
      verificationTokenHash,
    ]);
    return result.rows[0];
  }

  async createGoogleIdentity(email, googleId, executor = realmConnector) {
    const query = `
      INSERT INTO users (email, google_id, auth_provider, email_verified)
      VALUES (LOWER($1), $2, 'google', true)
      RETURNING id, email, email_verified, is_active, created_at
    `;
    const result = await executor.execute(query, [email, googleId]);
    return result.rows[0];
  }

  async verifyEmailWithTokenHash(tokenHash, executor = realmConnector) {
    const query = `
      UPDATE users
      SET email_verified = true,
          verification_token_hash = NULL,
          verification_token_expires = NULL
      WHERE verification_token_hash = $1
        AND verification_token_expires > NOW()
        AND is_deleted = false
      RETURNING id, email, email_verified
    `;
    const result = await executor.execute(query, [tokenHash]);
    return result.rows[0] || null;
  }

  async rotateVerificationToken(email, tokenHash, executor = realmConnector) {
    const query = `
      UPDATE users
      SET verification_token_hash = $2,
          verification_token_expires = NOW() + INTERVAL '24 hours'
      WHERE LOWER(email) = LOWER($1)
        AND auth_provider = 'email'
        AND email_verified = false
        AND is_deleted = false
      RETURNING id, email
    `;
    const result = await executor.execute(query, [email, tokenHash]);
    return result.rows[0] || null;
  }

  async updateLastLogin(userId, executor = realmConnector) {
    await executor.execute('UPDATE users SET last_login = NOW() WHERE id = $1', [userId]);
  }

  async storeRefreshToken(userId, tokenHash, expiresAt, executor = realmConnector) {
    const query = `
      INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const result = await executor.execute(query, [userId, tokenHash, expiresAt]);
    return result.rows[0];
  }

  async findRefreshToken(tokenHash, executor = realmConnector, { forUpdate = false } = {}) {
    const query = `
      SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked,
             rt.rotated_at, rt.replacement_jti, rt.replaced_by,
             replacement.token_hash AS replacement_token_hash,
             replacement.expires_at AS replacement_expires_at,
             replacement.revoked AS replacement_revoked
      FROM refresh_tokens rt
      LEFT JOIN refresh_tokens replacement ON rt.replaced_by = replacement.id
      WHERE rt.token_hash = $1
      ${forUpdate ? 'FOR UPDATE OF rt' : ''}
    `;
    const result = await executor.execute(query, [tokenHash]);
    return result.rows[0] || null;
  }

  async rotateRefreshToken(currentTokenId, userId, replacement, executor = realmConnector) {
    const inserted = await this.storeRefreshToken(
      userId,
      replacement.tokenHash,
      replacement.expiresAt,
      executor,
    );

    const result = await executor.execute(
      `UPDATE refresh_tokens
       SET revoked = true,
           rotated_at = $2,
           replacement_jti = $3,
           replaced_by = $4
       WHERE id = $1 AND revoked = false
       RETURNING id`,
      [
        currentTokenId,
        replacement.rotatedAt,
        replacement.jti,
        inserted.id,
      ],
    );

    if (result.rowCount !== 1) {
      throw new Error('Refresh token rotation conflict');
    }

    return inserted;
  }

  async revokeRefreshToken(tokenHash, executor = realmConnector) {
    await executor.execute(
      'UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1',
      [tokenHash],
    );
  }

  async revokeAllRefreshTokens(userId, executor = realmConnector) {
    await executor.execute(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false',
      [userId],
    );
  }

  async createPasswordResetToken(email, resetTokenHash, executor = realmConnector) {
    const query = `
      UPDATE users
      SET reset_password_token_hash = $2,
          reset_password_expires = NOW() + INTERVAL '1 hour'
      WHERE LOWER(email) = LOWER($1) AND is_deleted = false
      RETURNING id, email
    `;
    const result = await executor.execute(query, [email, resetTokenHash]);
    return result.rows[0] || null;
  }

  async resetPasswordWithTokenHash(tokenHash, newPasswordHash, executor = realmConnector) {
    const query = `
      UPDATE users
      SET password_hash = $2,
          reset_password_token_hash = NULL,
          reset_password_expires = NULL
      WHERE reset_password_token_hash = $1
        AND reset_password_expires > NOW()
        AND is_deleted = false
      RETURNING id, email
    `;
    const result = await executor.execute(query, [tokenHash, newPasswordHash]);
    return result.rows[0] || null;
  }
}

export const identityRepository = new IdentityRepository();
