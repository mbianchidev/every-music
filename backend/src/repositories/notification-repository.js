import { publishEvent } from './event-publisher.js';
import { notificationKind } from '../engines/notification-catalog.js';

const legacyColumns = {
  messages: 'messages',
  announcements: 'announcements',
  engagements: 'engagements',
  profileViews: 'profile_views',
};

function delivery(kind) {
  const definition = notificationKind(kind);
  const column = definition.preference ? legacyColumns[definition.preference] : undefined;
  if (definition.preference && !column) throw new Error(`Unknown notification preference for ${kind}`);
  const legacyDefault = definition.preference !== 'profileViews';
  return {
    gate: column ? `COALESCE(p.${column}, ${legacyDefault ? 'TRUE' : 'FALSE'})` : 'TRUE',
    inApp: definition.inApp === 'on' || (definition.inApp === 'optional' && Boolean(column)),
    push: definition.push === 'on',
  };
}

function insertSql(kind, recipients, key) {
  const { gate } = delivery(kind);
  return `
    WITH inserted AS (
      INSERT INTO notifications (user_id, kind, title, link, event_key, params, in_app, push_sent)
      SELECT u.id, $2, $3, $4, ${key}, $6::jsonb, $7::boolean, NOT (COALESCE(p.push, FALSE) AND $8::boolean)
      FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id
      WHERE ${recipients} AND u.is_active = TRUE AND u.is_deleted = FALSE AND ${gate}
        AND ($7::boolean OR (COALESCE(p.push, FALSE) AND $8::boolean))
      ON CONFLICT (event_key) DO NOTHING RETURNING id, user_id
    )
    SELECT id, user_id AS "userId" FROM inserted`;
}

class NotificationRepository {
  // Creates one notification inside the caller's transaction. `title` is the
  // English fallback; clients localize from `kind` and `params`. `key` makes
  // retries idempotent. Returns the new id, or null when nothing is delivered.
  async create(executor, { userId, kind, title, link, key = null, params = {} }) {
    const { inApp, push } = delivery(kind);
    const { rows } = await executor.execute(insertSql(kind, 'u.id = $1', '$5'),
      [userId, kind, title, link, key, JSON.stringify(params), inApp, push]);
    if (!rows.length) return null;
    await publishEvent(executor, 'notifications.changed', { userId, id: rows[0].id });
    return rows[0].id;
  }

  // Fans one notification out to many users. Each event key is `${keyPrefix}:${userId}`.
  async createMany(executor, userIds, { kind, title, link, keyPrefix, params = {} }) {
    if (!userIds.length) return [];
    if (!keyPrefix) throw new Error('Fan-out notifications require a key prefix');
    const { inApp, push } = delivery(kind);
    const { rows } = await executor.execute(insertSql(kind, 'u.id = ANY($1::uuid[])', "$5 || ':' || u.id::text"),
      [userIds, kind, title, link, keyPrefix, JSON.stringify(params), inApp, push]);
    for (const row of rows) await publishEvent(executor, 'notifications.changed', { userId: row.userId, id: row.id });
    return rows.map(row => row.id);
  }
}

export const notificationRepository = new NotificationRepository();
