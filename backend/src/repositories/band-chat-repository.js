import { realmConnector } from './realm-connector.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { organizationRepository, displayName } from './organization-repository.js';
import { publicMessagingKey } from './messaging-key-repository.js';
import { requestError } from '../engines/request-error.js';
import { GROUP_LIMITS, validateGroupEnvelope, verifyReportedGroupMessage } from '../engines/message-security.js';

const lower = value => value.toLowerCase();
const chatLink = organizationId => `#organization?id=${organizationId}&section=chat`;

export function bandMessageView(row) {
  return {
    id: row.id, clientId: row.client_id, senderId: row.sender_id, senderName: row.sender_name, createdAt: row.created_at,
    isDeleted: row.is_deleted, removedByModeration: row.removed_by_moderation,
    ciphertext: row.ciphertext, senderKeyId: row.sender_key_id, recipientKeyIds: row.recipient_key_ids,
    attachments: row.attachments ?? [],
  };
}

const messageSelect = `
  SELECT bm.*, ${displayName('sp')} AS sender_name,
    COALESCE((SELECT array_agg(ba.media_id ORDER BY ba.media_id) FROM band_chat_attachments ba WHERE ba.message_id = bm.id), '{}') AS attachments
  FROM band_chat_messages bm LEFT JOIN profiles sp ON sp.user_id = bm.sender_id`;

class BandChatRepository {
  async access(executor, organizationId, userId) {
    const access = await organizationRepository.requireMember(executor, organizationId, userId, null);
    if (access.organization.kind !== 'band') throw requestError(404, 'BAND_CHAT_UNAVAILABLE', 'Group chat is available for band pages');
    return access.organization;
  }

  // Aligns chat membership periods with the band's current memberships. A
  // period is tied to one organization_members row, so leaving and rejoining
  // starts a new period that cannot see the earlier history.
  async sync(executor, organizationId) {
    await executor.execute(`
      UPDATE band_chat_members c SET left_at = GREATEST(clock_timestamp(), c.joined_at)
      WHERE c.organization_id = $1 AND c.left_at IS NULL AND NOT EXISTS(
        SELECT 1 FROM organization_members m WHERE m.id = c.member_id AND m.status = 'active')`, [organizationId]);
    await executor.execute(`
      INSERT INTO band_chat_members (organization_id, user_id, member_id)
      SELECT m.organization_id, m.user_id, m.id FROM organization_members m
      WHERE m.organization_id = $1 AND m.status = 'active'
      ON CONFLICT (organization_id, user_id) WHERE left_at IS NULL DO NOTHING`, [organizationId]);
  }

  async period(executor, organizationId, userId) {
    const { rows } = await executor.execute(`
      SELECT joined_at, CASE WHEN read_at = '-infinity' THEN NULL ELSE read_at END AS read_at
      FROM band_chat_members WHERE organization_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [organizationId, userId]);
    if (!rows.length) throw requestError(403, 'ORGANIZATION_PERMISSION_REQUIRED', 'Only current band members can use the band chat');
    return rows[0];
  }

  // Current members and the messaging key each one can receive with. Members
  // without a published key, or with inactive accounts, cannot receive.
  async members(executor, organizationId) {
    const { rows } = await executor.execute(`
      SELECT m.user_id, ${displayName('p')} AS name, p.profile_picture_url AS picture_url, m.role,
        (u.is_active AND NOT u.is_deleted) AS available, k.*
      FROM organization_members m JOIN users u ON u.id = m.user_id
      LEFT JOIN profiles p ON p.user_id = m.user_id
      LEFT JOIN messaging_keys k ON k.user_id = m.user_id AND k.is_current AND u.is_active AND NOT u.is_deleted
      WHERE m.organization_id = $1 AND m.status = 'active'
      ORDER BY ${displayName('p')}, m.user_id`, [organizationId]);
    return rows.map(row => ({
      userId: row.user_id, name: row.name, pictureUrl: row.picture_url, role: row.role,
      key: row.available && row.id ? publicMessagingKey(row) : null, canReceive: Boolean(row.available && row.id),
    }));
  }

  async chat(organizationId, userId, { page, pageSize }) {
    return realmConnector.transaction(async executor => {
      const organization = await this.access(executor, organizationId, userId);
      await this.sync(executor, organization.id);
      const period = await this.period(executor, organization.id, userId);
      const members = await this.members(executor, organization.id);
      const { rows } = await executor.execute(`${messageSelect}
        WHERE bm.organization_id = $1 AND bm.created_at >= $2
        ORDER BY bm.created_at DESC, bm.id DESC LIMIT $3 OFFSET $4`,
      [organization.id, period.joined_at, pageSize + 1, (page - 1) * pageSize]);
      const keyIds = [...new Set(rows.map(row => row.sender_key_id).filter(Boolean))];
      const keys = keyIds.length
        ? (await executor.execute('SELECT * FROM messaging_keys WHERE id = ANY($1::uuid[])', [keyIds])).rows.map(publicMessagingKey) : [];
      const { rows: unread } = await executor.execute(`
        SELECT COUNT(*)::int AS count FROM band_chat_messages bm
        JOIN band_chat_members c ON c.organization_id = bm.organization_id AND c.user_id = $2 AND c.left_at IS NULL
        WHERE bm.organization_id = $1 AND bm.created_at >= c.joined_at AND bm.created_at > c.read_at
          AND bm.sender_id <> $2 AND NOT bm.is_deleted`, [organization.id, userId]);
      return {
        chat: {
          organizationId: organization.id, name: organization.name, joinedAt: period.joined_at,
          readAt: period.read_at,
          unreadCount: unread[0].count, members, limits: { ...GROUP_LIMITS },
        },
        rows: rows.map(bandMessageView), keys,
      };
    });
  }

  async list(userId) {
    const { rows } = await realmConnector.execute(`
      SELECT o.id, o.name, o.slug, o.picture_url,
        COALESCE((SELECT COUNT(*) FROM band_chat_messages bm WHERE bm.organization_id = o.id AND bm.created_at >= c.joined_at
          AND bm.created_at > c.read_at AND bm.sender_id <> $1 AND NOT bm.is_deleted), 0)::int AS unread_count,
        (SELECT MAX(bm.created_at) FROM band_chat_messages bm WHERE bm.organization_id = o.id AND bm.created_at >= c.joined_at) AS last_message_at
      FROM organization_members m JOIN organizations o ON o.id = m.organization_id AND o.kind = 'band' AND NOT o.is_deleted
      LEFT JOIN band_chat_members c ON c.organization_id = o.id AND c.user_id = $1 AND c.left_at IS NULL
      WHERE m.user_id = $1 AND m.status = 'active'
      ORDER BY last_message_at DESC NULLS LAST, o.name, o.id`, [userId]);
    return rows.map(row => ({
      organizationId: row.id, name: row.name, slug: row.slug, pictureUrl: row.picture_url,
      unreadCount: row.unread_count, lastMessageAt: row.last_message_at,
    }));
  }

  async send(organizationId, userId, input) {
    const clientId = lower(input.clientId);
    const senderKeyId = lower(input.senderKeyId);
    const recipientKeyIds = input.recipientKeyIds.map(lower);
    const attachmentIds = [...new Set((input.attachmentIds ?? []).map(lower))];
    if (attachmentIds.length !== (input.attachmentIds ?? []).length || attachmentIds.length > GROUP_LIMITS.attachments) {
      throw requestError(400, 'INVALID_ATTACHMENT', `Attach up to ${GROUP_LIMITS.attachments} different files`);
    }
    const ciphertext = await validateGroupEnvelope(input.ciphertext, senderKeyId, recipientKeyIds);
    return realmConnector.transaction(async executor => {
      const organization = await this.access(executor, organizationId, userId);
      // Membership changes lock the organization row; sharing it keeps the
      // recipient check consistent with them.
      await executor.execute('SELECT id FROM organizations WHERE id = $1 FOR SHARE', [organization.id]);
      await this.sync(executor, organization.id);
      await this.period(executor, organization.id, userId);
      const sameMessage = async row => {
        const stored = (await executor.execute('SELECT media_id FROM band_chat_attachments WHERE message_id = $1', [row.id])).rows
          .map(item => item.media_id);
        if (row.organization_id !== organization.id || row.ciphertext !== ciphertext || row.sender_key_id !== senderKeyId
          || stored.length !== attachmentIds.length || stored.some(id => !attachmentIds.includes(id))) {
          throw requestError(409, 'MESSAGE_CONFLICT', 'This message identifier was already used');
        }
        return this.message(executor, row.id);
      };
      const previous = await executor.execute('SELECT * FROM band_chat_messages WHERE sender_id = $1 AND client_id = $2', [userId, clientId]);
      if (previous.rows.length) return sameMessage(previous.rows[0]);
      const { rows: keys } = await executor.execute(`
        SELECT k.id, k.user_id FROM organization_members m JOIN users u ON u.id = m.user_id AND u.is_active AND NOT u.is_deleted
        JOIN messaging_keys k ON k.user_id = m.user_id AND k.is_current
        WHERE m.organization_id = $1 AND m.status = 'active' FOR SHARE OF k`, [organization.id]);
      if (!keys.some(key => key.id === senderKeyId && key.user_id === userId)) {
        throw requestError(409, 'MESSAGING_KEYS_CHANGED', 'Unlock your current messaging key, reload the chat, and send again.');
      }
      if (keys.length !== recipientKeyIds.length || keys.some(key => !recipientKeyIds.includes(key.id))) {
        throw requestError(409, 'BAND_CHAT_RECIPIENTS_CHANGED', 'Band members or their messaging keys changed. Reload the chat, check fingerprints, and send again.');
      }
      if (attachmentIds.length) {
        const { rows: media } = await executor.execute(`
          SELECT id FROM media WHERE id = ANY($1::uuid[]) AND user_id = $2 AND purpose = 'attachment'
            AND NOT EXISTS(SELECT 1 FROM band_chat_attachments ba WHERE ba.media_id = media.id)
          FOR UPDATE`, [attachmentIds, userId]);
        if (media.length !== attachmentIds.length) {
          throw requestError(400, 'INVALID_ATTACHMENT', 'Upload each encrypted attachment with this account and attach it only once');
        }
      }
      const { rows } = await executor.execute(`
        INSERT INTO band_chat_messages (organization_id, sender_id, client_id, ciphertext, sender_key_id, recipient_key_ids)
        VALUES ($1, $2, $3, $4, $5, $6::uuid[]) ON CONFLICT (sender_id, client_id) DO NOTHING RETURNING *`,
      [organization.id, userId, clientId, ciphertext, senderKeyId, recipientKeyIds]);
      if (!rows.length) {
        const existing = await executor.execute('SELECT * FROM band_chat_messages WHERE sender_id = $1 AND client_id = $2', [userId, clientId]);
        return sameMessage(existing.rows[0]);
      }
      const message = rows[0];
      if (attachmentIds.length) {
        await executor.execute(`
          INSERT INTO band_chat_attachments (message_id, media_id) SELECT $1, id FROM unnest($2::uuid[]) AS id`,
        [message.id, attachmentIds]);
      }
      await executor.execute(`
        UPDATE band_chat_members SET read_at = clock_timestamp()
        WHERE organization_id = $1 AND user_id = $2 AND left_at IS NULL`, [organization.id, userId]);
      const { rows: others } = await executor.execute(`
        SELECT user_id, CASE WHEN read_at = '-infinity' THEN 0 ELSE (EXTRACT(EPOCH FROM read_at) * 1000)::bigint END AS read_mark
        FROM band_chat_members WHERE organization_id = $1 AND left_at IS NULL AND user_id <> $2`, [organization.id, userId]);
      for (const other of others) {
        // One unread notification per member until they read the chat again.
        await notificationRepository.create(executor, {
          userId: other.user_id, kind: 'band_message', title: `New messages in the ${organization.name} band chat`,
          link: chatLink(organization.id), key: `band-message:${organization.id}:${other.user_id}:${other.read_mark}`,
          params: { organizationId: organization.id, name: organization.name },
        });
      }
      await this.publish(executor, organization.id, [userId, ...others.map(other => other.user_id)]);
      return this.message(executor, message.id);
    });
  }

  async message(executor, id) {
    const { rows } = await executor.execute(`${messageSelect} WHERE bm.id = $1`, [id]);
    return bandMessageView(rows[0]);
  }

  async publish(executor, organizationId, userIds) {
    for (const userId of new Set(userIds)) await publishEvent(executor, 'band-chat.changed', { userId, id: organizationId });
  }

  async currentMemberIds(executor, organizationId) {
    const { rows } = await executor.execute(
      'SELECT user_id FROM band_chat_members WHERE organization_id = $1 AND left_at IS NULL', [organizationId]);
    return rows.map(row => row.user_id);
  }

  async markRead(organizationId, userId) {
    return realmConnector.transaction(async executor => {
      const organization = await this.access(executor, organizationId, userId);
      await this.sync(executor, organization.id);
      await this.period(executor, organization.id, userId);
      await executor.execute(`
        UPDATE band_chat_members SET read_at = clock_timestamp()
        WHERE organization_id = $1 AND user_id = $2 AND left_at IS NULL`, [organization.id, userId]);
      await executor.execute(`
        UPDATE notifications SET read_at = COALESCE(read_at, NOW())
        WHERE user_id = $1 AND kind = 'band_message' AND link = $2`, [userId, chatLink(organization.id)]);
      await publishEvent(executor, 'notifications.changed', { userId });
      await publishEvent(executor, 'band-chat.changed', { userId, id: organization.id });
      return { organizationId: organization.id };
    });
  }

  async remove(organizationId, messageId, userId) {
    return realmConnector.transaction(async executor => {
      const organization = await this.access(executor, organizationId, userId);
      await this.sync(executor, organization.id);
      const { rowCount } = await executor.execute(`
        UPDATE band_chat_messages SET ciphertext = NULL, is_deleted = TRUE
        WHERE id = $1 AND organization_id = $2 AND sender_id = $3 AND NOT is_deleted`, [messageId, organization.id, userId]);
      if (!rowCount) throw requestError(404, 'MESSAGE_NOT_FOUND', 'Message not found or not yours');
      await executor.execute('DELETE FROM band_chat_attachments WHERE message_id = $1', [messageId]);
      await this.publish(executor, organization.id, await this.currentMemberIds(executor, organization.id));
    });
  }

  async removeByModeration(executor, messageId) {
    const { rows } = await executor.execute(`
      UPDATE band_chat_messages SET ciphertext = NULL, is_deleted = TRUE, removed_by_moderation = TRUE
      WHERE id = $1 RETURNING organization_id`, [messageId]);
    if (!rows.length) throw requestError(404, 'MESSAGE_NOT_FOUND', 'Reported message not found');
    await executor.execute('DELETE FROM band_chat_attachments WHERE message_id = $1', [messageId]);
    await this.publish(executor, rows[0].organization_id, await this.currentMemberIds(executor, rows[0].organization_id));
  }

  async evidenceFor(executor, messageId, signedEvidence) {
    const { rows } = await executor.execute('SELECT * FROM band_chat_messages WHERE id = $1', [messageId]);
    const message = rows[0];
    if (!message) throw requestError(409, 'EVIDENCE_UNAVAILABLE', 'The original message metadata is unavailable');
    const sender = (await executor.execute('SELECT * FROM messaging_keys WHERE id = $1', [message.sender_key_id])).rows[0];
    const attachments = (await executor.execute('SELECT media_id FROM band_chat_attachments WHERE message_id = $1', [message.id])).rows
      .map(row => row.media_id);
    if (!sender) throw requestError(409, 'EVIDENCE_UNAVAILABLE', 'The sender key is unavailable');
    return verifyReportedGroupMessage(signedEvidence, message, sender, message.is_deleted ? null : attachments);
  }

  // Report evidence for the admin report view. Attachment contents are never
  // disclosed; the evidence notes how many the message carried.
  async reportEvidence(executor, report) {
    const result = await this.evidenceFor(executor, report.band_message_id, report.signed_evidence);
    const note = result.attachments ? `\n[${result.attachments} encrypted attachment(s), not disclosed]` : '';
    return { body: `${result.body}${note}`.trim(), verified: true };
  }

  async report(organizationId, messageId, userId, input) {
    if (input.consent !== true) throw requestError(400, 'REPORT_CONSENT_REQUIRED', 'Explicitly agree before disclosing report content to administrators.');
    const details = input.details.trim();
    if (details.length < 5) throw requestError(400, 'INVALID_REPORT', 'Add at least five characters describing the concern');
    return realmConnector.transaction(async executor => {
      const organization = await this.access(executor, organizationId, userId);
      await this.sync(executor, organization.id);
      const period = await this.period(executor, organization.id, userId);
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const { rows } = await executor.execute(`
        SELECT * FROM band_chat_messages WHERE id = $1 AND organization_id = $2 AND created_at >= $3 FOR SHARE`,
      [messageId, organization.id, period.joined_at]);
      const message = rows[0];
      if (!message || message.is_deleted || message.sender_id === userId) {
        throw requestError(404, 'MESSAGE_NOT_FOUND', 'A report can attach an existing message from another band member');
      }
      const recent = await executor.execute("SELECT COUNT(*)::int AS count FROM user_reports WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '1 day'", [userId]);
      if (recent.rows[0].count >= 10) throw requestError(429, 'REPORT_LIMIT', 'At most ten reports can be submitted per day');
      const duplicate = await executor.execute(
        "SELECT id FROM user_reports WHERE reporter_id = $1 AND band_message_id = $2 AND status = 'open'", [userId, message.id]);
      if (duplicate.rows.length) throw requestError(409, 'REPORT_EXISTS', 'An open report already exists for this message');
      await this.evidenceFor(executor, message.id, input.signedEvidence);
      const { rows: created } = await executor.execute(`
        INSERT INTO user_reports (reporter_id, reported_user_id, band_message_id, category, details, signed_evidence, evidence_key_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, status, created_at AS "createdAt"`,
      [userId, message.sender_id, message.id, input.category, details, input.signedEvidence, message.sender_key_id]);
      await publishAdminEvent(executor);
      await publishEvent(executor, 'reports.changed', { userId, id: created[0].id });
      return created[0];
    });
  }
}

export const bandChatRepository = new BandChatRepository();
