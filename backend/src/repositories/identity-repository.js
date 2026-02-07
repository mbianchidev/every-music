import { realmConnector } from './realm-connector.js';

export class IdentityRepository {
  async findByEmail(email) {
    const query = `
      SELECT id, email, password_hash, auth_provider, google_id,
             email_verified, is_active, is_deleted, created_at, last_login
      FROM users
      WHERE email = $1 AND is_deleted = false
    `;
    const result = await realmConnector.execute(query, [email]);
    return result.rows[0] || null;
  }

  async findByGoogleId(googleId) {
    const query = `
      SELECT id, email, auth_provider, google_id, email_verified,
             is_active, created_at, last_login
      FROM users
      WHERE google_id = $1 AND is_deleted = false
    `;
    const result = await realmConnector.execute(query, [googleId]);
    return result.rows[0] || null;
  }

  async findById(userId) {
    const query = `
      SELECT id, email, auth_provider, google_id, email_verified,
             is_active, created_at, last_login
      FROM users
      WHERE id = $1 AND is_deleted = false
    `;
    const result = await realmConnector.execute(query, [userId]);
    return result.rows[0] || null;
  }

  async createEmailIdentity(email, passwordHash, verificationToken) {
    const query = `
      INSERT INTO users (
        email, password_hash, auth_provider, verification_token,
        verification_token_expires
      )
      VALUES ($1, $2, 'email', $3, NOW() + INTERVAL '24 hours')
      RETURNING id, email, email_verified, created_at
    `;
    const result = await realmConnector.execute(query, [
      email,
      passwordHash,
      verificationToken,
    ]);
    return result.rows[0];
  }

  async createGoogleIdentity(email, googleId) {
    const query = `
      INSERT INTO users (email, google_id, auth_provider, email_verified)
      VALUES ($1, $2, 'google', true)
      RETURNING id, email, email_verified, created_at
    `;
    const result = await realmConnector.execute(query, [email, googleId]);
    return result.rows[0];
  }

  async verifyEmailWithToken(token) {
    const query = `
      UPDATE users
      SET email_verified = true,
          verification_token = NULL,
          verification_token_expires = NULL
      WHERE verification_token = $1
        AND verification_token_expires > NOW()
        AND is_deleted = false
      RETURNING id, email, email_verified
    `;
    const result = await realmConnector.execute(query, [token]);
    return result.rows[0] || null;
  }

  async updateLastLogin(userId) {
    const query = `
      UPDATE users
      SET last_login = NOW()
      WHERE id = $1
    `;
    await realmConnector.execute(query, [userId]);
  }

  async storeRefreshToken(userId, token, expiresAt) {
    const query = `
      INSERT INTO refresh_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const result = await realmConnector.execute(query, [userId, token, expiresAt]);
    return result.rows[0];
  }

  async findRefreshToken(token) {
    const query = `
      SELECT id, user_id, expires_at, revoked
      FROM refresh_tokens
      WHERE token = $1
    `;
    const result = await realmConnector.execute(query, [token]);
    return result.rows[0] || null;
  }

  async revokeRefreshToken(token) {
    const query = `
      UPDATE refresh_tokens
      SET revoked = true
      WHERE token = $1
    `;
    await realmConnector.execute(query, [token]);
  }

  async createPasswordResetToken(email, resetToken) {
    const query = `
      UPDATE users
      SET reset_password_token = $2,
          reset_password_expires = NOW() + INTERVAL '1 hour'
      WHERE email = $1 AND is_deleted = false
      RETURNING id, email
    `;
    const result = await realmConnector.execute(query, [email, resetToken]);
    return result.rows[0] || null;
  }

  async resetPasswordWithToken(token, newPasswordHash) {
    const query = `
      UPDATE users
      SET password_hash = $2,
          reset_password_token = NULL,
          reset_password_expires = NULL
      WHERE reset_password_token = $1
        AND reset_password_expires > NOW()
        AND is_deleted = false
      RETURNING id, email
    `;
    const result = await realmConnector.execute(query, [token, newPasswordHash]);
    return result.rows[0] || null;
  }
}

export const identityRepository = new IdentityRepository();
