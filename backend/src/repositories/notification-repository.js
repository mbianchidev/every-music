import { publishEvent } from './event-publisher.js';
import { deliverySql } from '../engines/notification-channels.js';

// Per-recipient channels follow the kind's catalog availability, the user's
// per-kind choices, the legacy category switch, the browser push switch, and
// email verification. Email rows enter the outbox as `pending`.
function insertSql(kind, recipients, key) {
  const delivery = deliverySql(kind);
  return `
    WITH candidates AS (
      SELECT u.id, ${delivery.inApp} AS in_app, ${delivery.push} AS push, ${delivery.email} AS email
      FROM users u ${delivery.joins}
      WHERE ${recipients} AND u.is_active = TRUE AND u.is_deleted = FALSE AND ${delivery.gate}
    ), inserted AS (
      INSERT INTO notifications (user_id, kind, title, link, event_key, params, in_app, push_sent, email_status)
      SELECT id, $2, $3, $4, ${key}, $6::jsonb, in_app, NOT push, CASE WHEN email THEN 'pending' ELSE 'none' END
      FROM candidates WHERE in_app OR push OR email
      ON CONFLICT (event_key) DO NOTHING RETURNING id, user_id
    )
    SELECT id, user_id AS "userId" FROM inserted`;
}

class NotificationRepository {
  // Creates one notification inside the caller's transaction. `title` is the
  // English fallback; clients localize from `kind` and `params`. `key` makes
  // retries idempotent. Returns the new id, or null when nothing is delivered.
  async create(executor, { userId, kind, title, link, key = null, params = {} }) {
    const { rows } = await executor.execute(insertSql(kind, 'u.id = $1', '$5'),
      [userId, kind, title, link, key, JSON.stringify(params)]);
    if (!rows.length) return null;
    await publishEvent(executor, 'notifications.changed', { userId, id: rows[0].id });
    return rows[0].id;
  }

  // Fans one notification out to many users. Each event key is `${keyPrefix}:${userId}`.
  async createMany(executor, userIds, { kind, title, link, keyPrefix, params = {} }) {
    if (!userIds.length) return [];
    if (!keyPrefix) throw new Error('Fan-out notifications require a key prefix');
    const { rows } = await executor.execute(insertSql(kind, 'u.id = ANY($1::uuid[])', "$5 || ':' || id::text"),
      [userIds, kind, title, link, keyPrefix, JSON.stringify(params)]);
    for (const row of rows) await publishEvent(executor, 'notifications.changed', { userId: row.userId, id: row.id });
    return rows.map(row => row.id);
  }
}

export const notificationRepository = new NotificationRepository();
