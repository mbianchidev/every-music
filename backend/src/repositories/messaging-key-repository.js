import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';
import { validateKeyPublication } from '../engines/message-security.js';

export function publicMessagingKey(row) {
  return row ? {
    id: row.id, userId: row.user_id, signingKey: row.signing_key, encryptionKey: row.encryption_key,
    identityProof: row.identity_proof, fingerprint: row.fingerprint, isCurrent: row.is_current, createdAt: row.created_at,
  } : null;
}

const ownKey = row => ({ ...publicMessagingKey(row), encryptedPrivateKey: row.encrypted_private_key });

class MessagingKeyRepository {
  async listOwn(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT * FROM messaging_keys WHERE user_id = $1
      ORDER BY is_current DESC, created_at DESC, id LIMIT $2 OFFSET $3`, [userId, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(ownKey);
  }

  async findOwn(id, userId) {
    const { rows } = await realmConnector.execute('SELECT * FROM messaging_keys WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!rows.length) throw requestError(404, 'MESSAGING_KEY_NOT_FOUND', 'Messaging key not found');
    return ownKey(rows[0]);
  }

  async current(userId, executor = realmConnector) {
    const { rows } = await executor.execute('SELECT * FROM messaging_keys WHERE user_id = $1 AND is_current = TRUE', [userId]);
    return publicMessagingKey(rows[0]);
  }

  async publish(userId, input) {
    const value = await validateKeyPublication(userId, input);
    return realmConnector.transaction(async executor => {
      const owner = await executor.execute('SELECT id FROM users WHERE id = $1 AND is_active = TRUE AND is_deleted = FALSE FOR UPDATE', [userId]);
      if (!owner.rowCount) throw requestError(403, 'ACCOUNT_UNAVAILABLE', 'This account cannot publish messaging keys');
      const current = await this.current(userId, executor);
      const reused = await executor.execute('SELECT id FROM messaging_keys WHERE fingerprint = $1', [value.fingerprint]);
      if (reused.rowCount) throw requestError(409, 'MESSAGING_KEY_REUSED', 'Generate a new identity instead of reusing an existing messaging key.');
      if (current && current.id !== input.replaceKeyId?.toLowerCase()) {
        throw requestError(409, 'MESSAGING_KEY_EXISTS', 'A current messaging key already exists. Reload before explicitly resetting it.');
      }
      if (!current && input.replaceKeyId) throw requestError(409, 'MESSAGING_KEY_CHANGED', 'The messaging key changed. Reload and retry.');
      const recent = await executor.execute("SELECT COUNT(*)::int AS count FROM messaging_keys WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'", [userId]);
      if (recent.rows[0].count >= 5) throw requestError(429, 'KEY_RESET_LIMIT', 'At most five messaging key changes are allowed per day.');
      if (current) await executor.execute('UPDATE messaging_keys SET is_current = FALSE WHERE id = $1', [current.id]);
      const { rows } = await executor.execute(`
        INSERT INTO messaging_keys (user_id, signing_key, encryption_key, identity_proof, fingerprint, encrypted_private_key)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, JSON.stringify(value.signingKey), JSON.stringify(value.encryptionKey), value.identityProof, value.fingerprint, value.encryptedPrivateKey]);
      await executor.execute(`
        SELECT pg_notify('everymusic_events',
          json_build_object('type', 'keys.changed', 'userId', person.user_id, 'id', $1::text)::text)
        FROM (
          SELECT DISTINCT other.user_id FROM conversation_members own
          JOIN conversation_members other ON other.conversation_id = own.conversation_id WHERE own.user_id = $1
          UNION SELECT $1::uuid
        ) person`, [userId]);
      return ownKey(rows[0]);
    });
  }
}

export const messagingKeyRepository = new MessagingKeyRepository();
