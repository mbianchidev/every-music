import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';
import { validateMessageEnvelope } from '../engines/message-security.js';
import { messagingKeyRepository, publicMessagingKey } from './messaging-key-repository.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
export { publishEvent } from './event-publisher.js';

export const preferenceColumns = {
  messages: 'messages',
  announcements: 'announcements',
  engagements: 'engagements',
  profileViews: 'profile_views',
  push: 'push',
  analytics: 'analytics',
  platformAnalytics: 'platform_analytics',
};

export function messageView(row) {
  return {
    id: row.id, clientId: row.client_id, senderId: row.sender_id, createdAt: row.created_at,
    isDeleted: row.is_deleted, removedByModeration: row.removed_by_moderation,
    encryptionVersion: row.encryption_version, ciphertext: row.ciphertext,
    senderKeyId: row.sender_key_id, recipientKeyId: row.recipient_key_id,
    ...(row.encryption_version === 0 && !row.is_deleted ? { body: row.body } : {}),
  };
}

class CommunityRepository {
  async preferences(userId, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT COALESCE(p.messages, TRUE) AS messages,
             COALESCE(p.announcements, TRUE) AS announcements,
             COALESCE(p.engagements, TRUE) AS engagements,
             COALESCE(p.profile_views, FALSE) AS "profileViews",
             COALESCE(p.push, FALSE) AS push,
             COALESCE(p.analytics, FALSE) AS analytics,
             COALESCE(p.platform_analytics, FALSE) AS "platformAnalytics"
      FROM users u LEFT JOIN user_preferences p ON p.user_id = u.id
      WHERE u.id = $1`, [userId]);
    return rows[0];
  }

  async updatePreferences(userId, changes) {
    if (changes.analytics === false) changes = { ...changes, platformAnalytics: false };
    return realmConnector.transaction(async (executor) => {
      await executor.execute('INSERT INTO user_preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
      const entries = Object.entries(changes).filter(([key]) => Object.hasOwn(preferenceColumns, key));
      if (entries.length) {
        await executor.execute(`
          UPDATE user_preferences SET ${entries.map(([key], i) => `${preferenceColumns[key]} = $${i + 2}`).join(', ')}
          WHERE user_id = $1`, [userId, ...entries.map(([, value]) => value)]);
      }
      if (changes.analytics === false) {
        await executor.execute('DELETE FROM analytics_daily WHERE user_id = $1', [userId]);
      }
      const current = await this.preferences(userId, executor);
      if (current.platformAnalytics && !current.analytics) {
        throw requestError(400, 'ANALYTICS_CONSENT_REQUIRED', 'Enable personal analytics before opting in to platform aggregates.');
      }
      if (changes.platformAnalytics === false) {
        await executor.execute('DELETE FROM platform_analytics_daily WHERE user_id = $1', [userId]);
        await publishAdminEvent(executor);
      }
      if (changes.push === false) {
        await executor.execute('DELETE FROM push_subscriptions WHERE user_id = $1', [userId]);
      }
      await publishEvent(executor, 'preferences.changed', { userId });
      return current;
    });
  }

  async notify(executor, { userId, kind, title, link, key, preference = 'engagements' }) {
    const column = preferenceColumns[preference];
    if (!column) throw new Error('Unknown notification preference');
    const { rows } = await executor.execute(`
      INSERT INTO notifications (user_id, kind, title, link, event_key, push_sent)
      SELECT u.id, $2, $3, $4, $5, NOT COALESCE(p.push, FALSE) FROM users u
      LEFT JOIN user_preferences p ON p.user_id = u.id
      WHERE u.id = $1 AND u.is_active = TRUE AND u.is_deleted = FALSE
        AND COALESCE(p.${column}, $6)
      ON CONFLICT (event_key) DO NOTHING RETURNING id`,
    [userId, kind, title, link, key ?? null, preference !== 'profileViews']);
    if (rows.length) await publishEvent(executor, 'notifications.changed', { userId, id: rows[0].id });
  }

  async announcementPublished(executor, announcement) {
    await executor.execute(`
      WITH inserted AS (
        INSERT INTO notifications (user_id, kind, title, link, event_key, push_sent)
        SELECT f.follower_id, 'announcement', 'A musician you follow published an announcement',
          $2, 'announcement:' || $3 || ':' || f.follower_id, NOT COALESCE(p.push, FALSE)
        FROM followers f JOIN users u ON u.id = f.follower_id AND u.is_active = TRUE AND u.is_deleted = FALSE
        LEFT JOIN user_preferences p ON p.user_id = f.follower_id
        WHERE f.following_id = $1 AND COALESCE(p.announcements, TRUE)
        ON CONFLICT (event_key) DO NOTHING RETURNING user_id, id
      )
      SELECT pg_notify('everymusic_events',
        json_build_object('type', 'notifications.changed', 'userId', user_id, 'id', id)::text) FROM inserted`,
    [announcement.user_id, `#announcement?id=${announcement.id}`, announcement.id]);
    await publishEvent(executor, 'announcements.changed', { id: announcement.id });
  }

  async lockMetricConsent(executor, actorId, ownerId) {
    await executor.execute(
      'SELECT user_id FROM user_preferences WHERE user_id = ANY($1::uuid[]) ORDER BY user_id FOR SHARE',
      [[actorId, ownerId].sort()],
    );
  }

  async recordMetric(executor, actorId, ownerId, kind, resourceId) {
    if (actorId === ownerId) return false;
    await this.lockMetricConsent(executor, actorId, ownerId);
    const result = await executor.execute(`
      INSERT INTO analytics_daily (user_id, kind, resource_id)
      SELECT $2, $3, $4 FROM user_preferences actor, user_preferences owner
      WHERE actor.user_id = $1 AND actor.analytics = TRUE
        AND owner.user_id = $2 AND owner.analytics = TRUE
      ON CONFLICT (user_id, day, kind, resource_id)
      DO UPDATE SET count = analytics_daily.count + 1`,
    [actorId, ownerId, kind, resourceId]);
    if (result.rowCount) await publishEvent(executor, 'analytics.changed', { userId: ownerId });
    const platform = await executor.execute(`
      INSERT INTO platform_analytics_daily (user_id, kind, resource_id)
      SELECT $2, $3, $4 FROM user_preferences actor, user_preferences owner
      WHERE actor.user_id = $1 AND actor.analytics = TRUE AND actor.platform_analytics = TRUE
        AND owner.user_id = $2 AND owner.analytics = TRUE AND owner.platform_analytics = TRUE
      ON CONFLICT (user_id, day, kind, resource_id)
      DO UPDATE SET count = platform_analytics_daily.count + 1`,
    [actorId, ownerId, kind, resourceId]);
    if (platform.rowCount) await publishAdminEvent(executor);
    return result.rowCount > 0;
  }

  async conversation(id, userId, executor = realmConnector, lock = false) {
    const { rows } = await executor.execute(`
      SELECT c.*, CASE WHEN first_user_id = $2 THEN second_user_id ELSE first_user_id END AS recipient_id
      FROM conversations c WHERE c.id = $1 AND $2 IN (first_user_id, second_user_id)
      ${lock ? 'FOR UPDATE' : ''}`, [id, userId]);
    if (!rows[0]) throw requestError(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found');
    return rows[0];
  }

  async assertCanMessage(executor, userId, recipientId) {
    const { rows } = await executor.execute(`
      SELECT u.id FROM users u WHERE u.id = $2 AND u.is_active = TRUE AND u.is_deleted = FALSE
        AND NOT EXISTS (
          SELECT 1 FROM blocked_users WHERE
          (user_id = $1 AND blocked_user_id = $2) OR (user_id = $2 AND blocked_user_id = $1)
        )`, [userId, recipientId]);
    if (!rows.length) throw requestError(403, 'MESSAGING_UNAVAILABLE', 'Messaging is unavailable for this musician');
  }

  async startConversation(userId, recipientId) {
    recipientId = recipientId.toLowerCase();
    if (userId === recipientId) throw requestError(400, 'INVALID_RECIPIENT', 'Choose another musician');
    return realmConnector.transaction(async (executor) => {
      await this.assertCanMessage(executor, userId, recipientId);
      const [first, second] = [userId, recipientId].sort();
      const { rows } = await executor.execute(`
        INSERT INTO conversations (first_user_id, second_user_id) VALUES ($1, $2)
        ON CONFLICT (first_user_id, second_user_id)
        DO UPDATE SET updated_at = conversations.updated_at RETURNING id`, [first, second]);
      const { id } = rows[0];
      await executor.execute(`
        INSERT INTO conversation_members (conversation_id, user_id)
        VALUES ($1, $2), ($1, $3) ON CONFLICT DO NOTHING`, [id, first, second]);
      await executor.execute(`
        UPDATE conversation_members SET archived = FALSE
        WHERE conversation_id = $1 AND user_id = $2`, [id, userId]);
      if (!await messagingKeyRepository.current(recipientId, executor)) await this.notify(executor, {
        userId: recipientId, kind: 'message_request', title: 'A musician wants to start an encrypted conversation',
        link: `#messages?id=${id}`, key: `conversation-request:${id}:${recipientId}`, preference: 'messages',
      });
      await publishEvent(executor, 'conversations.changed', { userId, id });
      await publishEvent(executor, 'conversations.changed', { userId: recipientId, id });
      return { id };
    });
  }

  async sendMessage(id, userId, input) {
    const clientId = input.clientId.toLowerCase();
    const senderKeyId = input.senderKeyId.toLowerCase();
    const recipientKeyId = input.recipientKeyId.toLowerCase();
    const ciphertext = await validateMessageEnvelope(input.ciphertext, senderKeyId, recipientKeyId);
    return realmConnector.transaction(async (executor) => {
      const conversation = await this.conversation(id, userId, executor, true);
      id = conversation.id;
      await this.assertCanMessage(executor, userId, conversation.recipient_id);
      const sameMessage = row => {
        if (row.conversation_id !== id || row.ciphertext !== ciphertext
          || row.sender_key_id !== senderKeyId || row.recipient_key_id !== recipientKeyId) {
          throw requestError(409, 'MESSAGE_CONFLICT', 'This message identifier was already used');
        }
        return row;
      };
      const previous = await executor.execute('SELECT * FROM messages WHERE sender_id = $1 AND client_id = $2', [userId, clientId]);
      if (previous.rows.length) return sameMessage(previous.rows[0]);
      const keys = await executor.execute(`
        SELECT id, user_id FROM messaging_keys WHERE id = ANY($1::uuid[]) AND is_current = TRUE FOR SHARE`,
      [[senderKeyId, recipientKeyId]]);
      if (!keys.rows.some(key => key.id === senderKeyId && key.user_id === userId)
        || !keys.rows.some(key => key.id === recipientKeyId && key.user_id === conversation.recipient_id)) {
        throw requestError(409, 'MESSAGING_KEYS_CHANGED', 'Both participants need current messaging keys. Reload, unlock your key, and verify any changed fingerprint.');
      }
      const { rows } = await executor.execute(`
        INSERT INTO messages (conversation_id, sender_id, client_id, ciphertext, sender_key_id, recipient_key_id, encryption_version)
        VALUES ($1, $2, $3, $4, $5, $6, 1) ON CONFLICT (sender_id, client_id) DO NOTHING RETURNING *`,
      [id, userId, clientId, ciphertext, senderKeyId, recipientKeyId]);
      if (!rows.length) {
        const existing = await executor.execute(
          'SELECT * FROM messages WHERE sender_id = $1 AND client_id = $2', [userId, clientId],
        );
        return sameMessage(existing.rows[0]);
      }
      await executor.execute('UPDATE conversations SET updated_at = clock_timestamp() WHERE id = $1', [id]);
      await executor.execute(`
        UPDATE conversation_members SET archived = FALSE,
          read_at = CASE WHEN user_id = $2 THEN clock_timestamp() ELSE read_at END
        WHERE conversation_id = $1`, [id, userId]);
      await this.notify(executor, {
        userId: conversation.recipient_id, kind: 'message', title: 'You have a new message',
        link: `#messages?id=${id}`, key: `message:${rows[0].id}`, preference: 'messages',
      });
      await this.recordMetric(executor, userId, conversation.recipient_id, 'message', conversation.recipient_id);
      await publishEvent(executor, 'messages.changed', { userId, id });
      await publishEvent(executor, 'messages.changed', { userId: conversation.recipient_id, id });
      return rows[0];
    });
  }

  async listConversations(userId, { page, pageSize }, archived) {
    const { rows } = await realmConnector.execute(`
      SELECT c.id, c.updated_at AS "updatedAt", cm.archived,
        p.user_id AS "recipientId", COALESCE(p.artist_name, 'Musician') AS "recipientName",
        (SELECT CASE WHEN is_deleted THEN 'Message removed' WHEN encryption_version = 1 THEN 'Encrypted message' ELSE 'Legacy message' END
          FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1) AS "lastMessage",
        (SELECT COUNT(*)::int FROM messages m WHERE m.conversation_id = c.id
          AND m.sender_id <> $1 AND m.created_at > cm.read_at) AS "unreadCount",
        EXISTS(SELECT 1 FROM blocked_users WHERE user_id = $1 AND blocked_user_id = p.user_id) AS "blockedByMe"
      FROM conversation_members cm JOIN conversations c ON cm.conversation_id = c.id
      JOIN profiles p ON p.user_id = CASE WHEN c.first_user_id = $1 THEN c.second_user_id ELSE c.first_user_id END
      JOIN users u ON u.id = p.user_id
      WHERE cm.user_id = $1 AND cm.archived = $2
      ORDER BY c.updated_at DESC, c.id DESC LIMIT $3 OFFSET $4`,
    [userId, archived, pageSize + 1, (page - 1) * pageSize]);
    return rows;
  }

  async getMessages(id, userId, { page, pageSize }) {
    const conversation = await this.conversation(id, userId);
    id = conversation.id;
    const { rows: details } = await realmConnector.execute(`
      SELECT p.user_id AS "recipientId", COALESCE(p.artist_name, 'Musician') AS "recipientName",
        (u.is_active AND NOT u.is_deleted) AS "recipientAvailable",
        EXISTS(SELECT 1 FROM blocked_users WHERE user_id = $1 AND blocked_user_id = p.user_id) AS "blockedByMe"
      FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = $2`, [userId, conversation.recipient_id]);
    const { rows } = await realmConnector.execute(`
      SELECT *
      FROM messages WHERE conversation_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [id, pageSize + 1, (page - 1) * pageSize]);
    const keyIds = [...new Set(rows.flatMap(row => [row.sender_key_id, row.recipient_key_id]).filter(Boolean))];
    const keyRows = await realmConnector.execute('SELECT * FROM messaging_keys WHERE id = ANY($1::uuid[])', [keyIds]);
    return {
      rows: rows.map(messageView), keys: keyRows.rows.map(publicMessagingKey),
      conversation: { id, ...details[0], recipientKey: await messagingKeyRepository.current(conversation.recipient_id) },
    };
  }

  async updateConversation(id, userId, changes) {
    return realmConnector.transaction(async (executor) => {
      const conversation = await this.conversation(id, userId, executor, true);
      id = conversation.id;
      if (changes.blocked !== undefined) {
        await executor.execute(changes.blocked
          ? 'INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
          : 'DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2',
        [userId, conversation.recipient_id]);
      }
      await executor.execute(`
        UPDATE conversation_members SET
          archived = COALESCE($3, archived),
          read_at = CASE WHEN $4 THEN clock_timestamp() ELSE read_at END
        WHERE conversation_id = $1 AND user_id = $2`, [id, userId, changes.archived ?? null, changes.read === true]);
      if (changes.read) {
        await executor.execute(`
          UPDATE notifications SET read_at = COALESCE(read_at, NOW())
          WHERE user_id = $1 AND kind IN ('message', 'message_request') AND link = $2`, [userId, `#messages?id=${id}`]);
        await publishEvent(executor, 'notifications.changed', { userId });
      }
      await publishEvent(executor, 'conversations.changed', { userId, id });
      return { id };
    });
  }

  async deleteMessage(id, messageId, userId) {
    return realmConnector.transaction(async (executor) => {
      const conversation = await this.conversation(id, userId, executor, true);
      const { rowCount } = await executor.execute(`
        UPDATE messages SET body = NULL, ciphertext = NULL, is_deleted = TRUE
        WHERE id = $1 AND conversation_id = $2 AND sender_id = $3`, [messageId, id, userId]);
      if (!rowCount) throw requestError(404, 'MESSAGE_NOT_FOUND', 'Message not found or not yours');
      await publishEvent(executor, 'messages.changed', { userId, id });
      await publishEvent(executor, 'messages.changed', { userId: conversation.recipient_id, id });
    });
  }

  async notifications(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT id, kind, title, link, read_at AS "readAt", created_at AS "createdAt"
      FROM notifications WHERE user_id = $1
      ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`, [userId, pageSize + 1, (page - 1) * pageSize]);
    const count = await realmConnector.execute(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL', [userId],
    );
    return { rows, unreadCount: count.rows[0].count };
  }

  async readNotifications(userId, id) {
    return realmConnector.transaction(async (executor) => {
      const result = await executor.execute(`
        UPDATE notifications SET read_at = COALESCE(read_at, NOW())
        WHERE user_id = $1 ${id ? 'AND id = $2' : ''} RETURNING id`, id ? [userId, id] : [userId]);
      if (id && !result.rowCount) throw requestError(404, 'NOTIFICATION_NOT_FOUND', 'Notification not found');
      await publishEvent(executor, 'notifications.changed', { userId });
    });
  }

  async recordView(actorId, kind, resourceId) {
    return realmConnector.transaction(async (executor) => {
      const { rows } = await executor.execute(kind === 'profile_view'
        ? `SELECT p.user_id FROM profiles p JOIN users u ON p.user_id = u.id
           WHERE (p.id = $1 OR p.user_id = $1) AND u.is_active = TRUE AND u.is_deleted = FALSE`
        : `SELECT a.user_id FROM announcements a JOIN users u ON u.id = a.user_id
           WHERE a.id = $1 AND a.is_published = TRUE AND a.is_deleted = FALSE
           AND u.is_active = TRUE AND u.is_deleted = FALSE
           AND (a.expires_at IS NULL OR a.expires_at > NOW())`, [resourceId]);
      if (!rows.length) throw requestError(404, 'CONTENT_NOT_FOUND', 'Content not found');
      const ownerId = rows[0].user_id;
      const recorded = await this.recordMetric(executor, actorId, ownerId, kind, resourceId);
      if (recorded && kind === 'announcement_view') {
        await executor.execute('UPDATE announcements SET views_count = views_count + 1 WHERE id = $1', [resourceId]);
      }
      if (recorded && kind === 'profile_view') {
        await this.notify(executor, {
          userId: ownerId, kind: 'profile_view', title: 'Your profile was viewed today',
          link: '#analytics', key: `profile-view:${ownerId}:${new Date().toISOString().slice(0, 10)}`, preference: 'profileViews',
        });
      }
      return { recorded };
    });
  }

  async analytics(userId) {
    const { rows: daily } = await realmConnector.execute(`
      SELECT to_char(day, 'YYYY-MM-DD') AS day, kind, SUM(count)::int AS count
      FROM analytics_daily WHERE user_id = $1 AND day >= CURRENT_DATE - 29
      GROUP BY day, kind ORDER BY day`, [userId]);
    const { rows: content } = await realmConnector.execute(`
      SELECT a.id, a.title,
        COALESCE(SUM(d.count) FILTER (WHERE d.kind = 'announcement_view'), 0)::int AS views,
        COALESCE(SUM(d.count) FILTER (WHERE d.kind = 'like'), 0)::int AS likes,
        COALESCE(SUM(d.count) FILTER (WHERE d.kind = 'save'), 0)::int AS saves
      FROM announcements a LEFT JOIN analytics_daily d ON d.resource_id = a.id
        AND d.user_id = $1 AND d.day >= CURRENT_DATE - 29
      WHERE a.user_id = $1 AND a.is_deleted = FALSE
      GROUP BY a.id ORDER BY a.created_at DESC LIMIT 100`, [userId]);
    return { daily, content };
  }

  async follow(userId, targetId, following) {
    if (userId === targetId) throw requestError(400, 'INVALID_FOLLOW', 'You cannot follow yourself');
    return realmConnector.transaction(async (executor) => {
      const { rows } = await executor.execute(`
        SELECT u.id FROM users u JOIN profiles p ON p.user_id = u.id
        WHERE (u.id = $1 OR p.id = $1) AND u.is_active = TRUE AND u.is_deleted = FALSE`, [targetId]);
      if (!rows.length) throw requestError(404, 'PROFILE_NOT_FOUND', 'Musician not found');
      const target = rows[0].id;
      if (target === userId) throw requestError(400, 'INVALID_FOLLOW', 'You cannot follow yourself');
      await executor.execute(following
        ? 'INSERT INTO followers (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING'
        : 'DELETE FROM followers WHERE follower_id = $1 AND following_id = $2', [userId, target]);
      return { following };
    });
  }

  async visibleAnnouncement(executor, id, userId) {
    const { rows } = await executor.execute(`
      SELECT * FROM announcements WHERE id = $1 AND is_deleted = FALSE
        AND EXISTS(SELECT 1 FROM users u WHERE u.id = announcements.user_id AND u.is_active AND NOT u.is_deleted)
        AND (user_id = $2 OR (is_published = TRUE AND (expires_at IS NULL OR expires_at > NOW())))`, [id, userId ?? null]);
    if (!rows.length) throw requestError(404, 'ANNOUNCEMENT_NOT_FOUND', 'Announcement not found');
    return rows[0];
  }

  async comments(id, userId, { page, pageSize }) {
    await this.visibleAnnouncement(realmConnector, id, userId);
    const { rows } = await realmConnector.execute(`
      SELECT c.id, c.user_id AS "userId", COALESCE(p.artist_name, 'Musician') AS "artistName",
        c.body, c.created_at AS "createdAt"
      FROM announcement_comments c JOIN profiles p ON p.user_id = c.user_id
      WHERE c.announcement_id = $1 ORDER BY c.created_at DESC, c.id DESC LIMIT $2 OFFSET $3`,
    [id, pageSize + 1, (page - 1) * pageSize]);
    return rows;
  }

  async addComment(id, userId, body) {
    return realmConnector.transaction(async (executor) => {
      const announcement = await this.visibleAnnouncement(executor, id, userId);
      const { rows } = await executor.execute(`
        INSERT INTO announcement_comments (announcement_id, user_id, body) VALUES ($1, $2, $3) RETURNING id`,
      [id, userId, body.trim()]);
      if (announcement.user_id !== userId) {
        await this.notify(executor, {
          userId: announcement.user_id, kind: 'comment', title: 'Your announcement has a new comment',
          link: `#announcement?id=${id}`, key: `comment:${rows[0].id}`,
        });
      }
      await publishEvent(executor, 'comments.changed', { id });
      return rows[0];
    });
  }

  async deleteComment(id, commentId, userId) {
    return realmConnector.transaction(async (executor) => {
      await this.visibleAnnouncement(executor, id, userId);
      const { rowCount } = await executor.execute(`
        DELETE FROM announcement_comments c USING announcements a
        WHERE c.id = $1 AND c.announcement_id = $2 AND a.id = c.announcement_id
          AND (c.user_id = $3 OR a.user_id = $3)`, [commentId, id, userId]);
      if (!rowCount) throw requestError(404, 'COMMENT_NOT_FOUND', 'Comment not found or not yours');
      await publishEvent(executor, 'comments.changed', { id });
    });
  }

  async mediaReference(executor, url, userId, purpose) {
    if (!url?.startsWith('/realm/media/')) return url;
    const { rows } = await executor.execute(
      'SELECT id FROM media WHERE id = $1 AND user_id = $2 AND purpose = $3',
      [url.slice('/realm/media/'.length), userId, purpose],
    );
    if (!rows.length) throw requestError(400, 'INVALID_MEDIA', 'Upload an image for this account and content type');
    return `/realm/media/${rows[0].id}`;
  }

  async addImage(userId, purpose, content) {
    const { rows } = await realmConnector.execute(
      'INSERT INTO media (user_id, purpose, content) VALUES ($1, $2, $3) RETURNING id', [userId, purpose, content],
    );
    return { id: rows[0].id, url: `/realm/media/${rows[0].id}` };
  }

  async image(id, userId) {
    id = id.toLowerCase();
    const { rows } = await realmConnector.execute(`
      SELECT m.content, m.user_id = $3 AS owned FROM media m WHERE m.id = $1 AND (
        m.user_id = $3 OR
        EXISTS(SELECT 1 FROM profiles p JOIN users u ON u.id = p.user_id
          WHERE p.profile_picture_url = $2 AND u.is_active = TRUE AND u.is_deleted = FALSE) OR
        EXISTS(SELECT 1 FROM announcements a JOIN users u ON u.id = a.user_id AND u.is_active AND NOT u.is_deleted
          WHERE a.picture_url = $2 AND a.is_published = TRUE
          AND a.is_deleted = FALSE AND (a.expires_at IS NULL OR a.expires_at > NOW()))
      )`, [id, `/realm/media/${id}`, userId ?? null]);
    if (!rows.length) throw requestError(404, 'IMAGE_NOT_FOUND', 'Image not found');
    return rows[0];
  }

  async subscribePush(userId, subscription) {
    await realmConnector.transaction(async (executor) => {
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const { rows } = await executor.execute(
        'SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1 AND endpoint <> $2',
        [userId, subscription.endpoint],
      );
      if (rows[0].count >= 5) throw requestError(400, 'PUSH_DEVICE_LIMIT', 'At most five browsers can receive push. Disable push on all devices to reset them.');
      await executor.execute(`
        INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
        ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id,
          p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
      [userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth]);
      await executor.execute(`
        INSERT INTO user_preferences (user_id, push) VALUES ($1, TRUE)
        ON CONFLICT (user_id) DO UPDATE SET push = TRUE`, [userId]);
    });
  }

  async unsubscribePush(userId, endpoint) {
    await realmConnector.execute('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);
  }
}

export const communityRepository = new CommunityRepository();
