import { realmConnector } from './realm-connector.js';
import { communityRepository } from './community-repository.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { requestError } from '../engines/request-error.js';
import { verifyReportedMessage } from '../engines/message-security.js';

class AdministrationRepository {
  async requireAdmin(executor, actorId) {
    const result = await executor.execute(`
      SELECT id FROM users WHERE id = $1 AND role = 'admin' AND is_active = TRUE AND is_deleted = FALSE FOR SHARE`, [actorId]);
    if (!result.rowCount) throw requestError(403, 'ADMIN_REQUIRED', 'Administrator access is required');
  }

  async withAdmin(actorId, operation) {
    return realmConnector.transaction(async executor => {
      await this.requireAdmin(executor, actorId);
      return operation(executor);
    });
  }

  async audit(executor, actorId, action, targetId, reportId = null) {
    await executor.execute('INSERT INTO admin_audit (actor_id, action, target_id, report_id) VALUES ($1, $2, $3, $4)', [actorId, action, targetId, reportId]);
  }

  async changeRole(email, role) {
    if (!['admin', 'member'].includes(role)) throw new Error('Unsupported account role');
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute(`
        SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND email_verified = TRUE
          AND is_active = TRUE AND is_deleted = FALSE FOR UPDATE`, [email]);
      if (!rows.length) throw requestError(404, 'ACCOUNT_NOT_FOUND', 'Choose an active, verified account');
      const id = rows[0].id;
      await executor.execute('UPDATE users SET role = $2 WHERE id = $1', [id, role]);
      await this.audit(executor, null, role === 'admin' ? 'role_granted' : 'role_revoked', id);
      await publishEvent(executor, 'account.changed', { userId: id });
      await publishAdminEvent(executor);
      return { userId: id, role };
    });
  }

  async evidence(executor, report) {
    if (!report.signed_evidence) return { body: report.legacy_evidence, verified: false };
    const message = (await executor.execute('SELECT * FROM messages WHERE id = $1', [report.message_id])).rows[0];
    if (!message) throw requestError(409, 'EVIDENCE_UNAVAILABLE', 'The original message metadata is unavailable');
    const keys = await executor.execute('SELECT * FROM messaging_keys WHERE id = ANY($1::uuid[])', [[message.sender_key_id, message.recipient_key_id]]);
    const sender = keys.rows.find(key => key.id === message.sender_key_id);
    const recipient = keys.rows.find(key => key.id === message.recipient_key_id);
    return { body: await verifyReportedMessage(report.signed_evidence, message, sender, recipient), verified: true };
  }

  async createReport(userId, input) {
    if (input.consent !== true) throw requestError(400, 'REPORT_CONSENT_REQUIRED', 'Explicitly agree before disclosing report content to administrators.');
    const targetId = input.reportedUserId.toLowerCase();
    if (targetId === userId) throw requestError(400, 'INVALID_REPORT', 'You cannot report yourself');
    if (input.details.trim().length < 5) throw requestError(400, 'INVALID_REPORT', 'Add at least five characters describing the concern');
    return realmConnector.transaction(async executor => {
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const target = await executor.execute('SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE', [targetId]);
      if (!target.rowCount) throw requestError(404, 'ACCOUNT_NOT_FOUND', 'Musician not found');
      const recent = await executor.execute("SELECT COUNT(*)::int AS count FROM user_reports WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '1 day'", [userId]);
      if (recent.rows[0].count >= 10) throw requestError(429, 'REPORT_LIMIT', 'At most ten reports can be submitted per day');
      const duplicate = await executor.execute(`
        SELECT id FROM user_reports WHERE reporter_id = $1 AND reported_user_id = $2 AND status = 'open'
          AND message_id IS NOT DISTINCT FROM $3::uuid`, [userId, targetId, input.messageId ?? null]);
      if (duplicate.rows.length) throw requestError(409, 'REPORT_EXISTS', 'An open report already exists for this concern');
      let legacyEvidence = null;
      let evidenceKeyId = null;
      if (input.messageId) {
        const { rows } = await executor.execute(`
          SELECT m.* FROM messages m JOIN conversations c ON c.id = m.conversation_id
          WHERE m.id = $1 AND $2 IN (c.first_user_id, c.second_user_id) FOR SHARE OF m`, [input.messageId, userId]);
        const message = rows[0];
        if (!message || message.sender_id !== targetId || message.is_deleted) {
          throw requestError(404, 'MESSAGE_NOT_FOUND', 'A report can attach an existing message from the reported musician');
        }
        if (message.encryption_version === 1) {
          if (!input.signedEvidence) throw requestError(400, 'EVIDENCE_REQUIRED', 'Explicitly attach the selected decrypted message');
          await this.evidence(executor, { message_id: message.id, signed_evidence: input.signedEvidence });
          evidenceKeyId = message.sender_key_id;
        } else {
          if (input.signedEvidence) throw requestError(400, 'INVALID_REPORT_EVIDENCE', 'Legacy messages do not have a sender signature');
          legacyEvidence = message.body;
        }
      } else if (input.signedEvidence) {
        throw requestError(400, 'INVALID_REPORT_EVIDENCE', 'Select a message before attaching evidence');
      }
      const { rows } = await executor.execute(`
        INSERT INTO user_reports (reporter_id, reported_user_id, message_id, category, details, signed_evidence, legacy_evidence, evidence_key_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, status, created_at AS "createdAt"`,
      [userId, targetId, input.messageId ?? null, input.category, input.details.trim(), input.signedEvidence ?? null, legacyEvidence, evidenceKeyId]);
      await publishAdminEvent(executor);
      await publishEvent(executor, 'reports.changed', { userId, id: rows[0].id });
      return rows[0];
    });
  }

  async ownReports(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT r.id, r.category, r.details, r.status, r.created_at AS "createdAt", r.reviewed_at AS "reviewedAt",
        COALESCE(p.artist_name, 'Musician') AS "reportedName"
      FROM user_reports r LEFT JOIN profiles p ON p.user_id = r.reported_user_id
      WHERE r.reporter_id = $1 ORDER BY r.created_at DESC, r.id DESC LIMIT $2 OFFSET $3`,
    [userId, pageSize + 1, (page - 1) * pageSize]);
    return rows;
  }

  async analytics(actorId) {
    return this.withAdmin(actorId, async executor => {
      const totals = (await executor.execute(`
        SELECT COUNT(*)::int AS accounts, COUNT(*) FILTER (WHERE is_active)::int AS "activeAccounts",
          COUNT(*) FILTER (WHERE role = 'admin' AND is_active)::int AS administrators
        FROM users WHERE is_deleted = FALSE`)).rows[0];
      totals.platformOptIns = (await executor.execute(`
        SELECT COUNT(*)::int AS count FROM user_preferences p JOIN users u ON u.id = p.user_id
        WHERE p.analytics AND p.platform_analytics AND u.is_active AND NOT u.is_deleted`)).rows[0].count;
      totals.openReports = (await executor.execute("SELECT COUNT(*)::int AS count FROM user_reports WHERE status = 'open'")).rows[0].count;
      const { rows: daily } = await executor.execute(`
        SELECT to_char(day, 'YYYY-MM-DD') AS day, kind, SUM(count)::int AS count
        FROM platform_analytics_daily WHERE day >= CURRENT_DATE - 29 GROUP BY day, kind ORDER BY day, kind`);
      const { rows: content } = await executor.execute(`
        SELECT a.id, a.title,
          COALESCE(SUM(d.count) FILTER (WHERE d.kind = 'announcement_view'), 0)::int AS views,
          COALESCE(SUM(d.count) FILTER (WHERE d.kind = 'like'), 0)::int AS likes,
          COALESCE(SUM(d.count) FILTER (WHERE d.kind = 'save'), 0)::int AS saves
        FROM announcements a JOIN users u ON u.id = a.user_id AND u.is_active AND NOT u.is_deleted
        JOIN platform_analytics_daily d ON d.resource_id = a.id AND d.day >= CURRENT_DATE - 29
        WHERE a.is_published AND NOT a.is_deleted AND (a.expires_at IS NULL OR a.expires_at > NOW())
        GROUP BY a.id ORDER BY SUM(d.count) DESC, a.id LIMIT 100`);
      return { totals, daily, content };
    });
  }

  async reports(actorId, { page, pageSize }, status) {
    return this.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute(`
        SELECT r.id, r.category, r.status, r.created_at AS "createdAt", r.reported_user_id AS "reportedUserId",
          COALESCE(p.artist_name, 'Musician') AS "reportedName", r.message_id IS NOT NULL AS "hasMessage"
        FROM user_reports r LEFT JOIN profiles p ON p.user_id = r.reported_user_id
        WHERE ($1::text IS NULL OR r.status = $1) ORDER BY r.created_at DESC, r.id DESC LIMIT $2 OFFSET $3`,
      [status || null, pageSize + 1, (page - 1) * pageSize]);
      return rows;
    });
  }

  async report(actorId, id) {
    return this.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute(`
        SELECT r.*, COALESCE(p.artist_name, 'Musician') AS reported_name
        FROM user_reports r LEFT JOIN profiles p ON p.user_id = r.reported_user_id WHERE r.id = $1 FOR SHARE OF r`, [id]);
      const report = rows[0];
      if (!report) throw requestError(404, 'REPORT_NOT_FOUND', 'Report not found');
      const evidence = await this.evidence(executor, report);
      await this.audit(executor, actorId, 'report_viewed', report.reported_user_id, id);
      await publishAdminEvent(executor);
      return {
        id: report.id, category: report.category, details: report.details, status: report.status,
        reportedUserId: report.reported_user_id, reportedName: report.reported_name,
        messageId: report.message_id, evidence: evidence.body, evidenceVerified: evidence.verified,
        createdAt: report.created_at, reviewedAt: report.reviewed_at, moderatorNote: report.moderator_note,
      };
    });
  }

  async resolve(actorId, id, { action, note }) {
    if (!['review', 'dismiss', 'remove_message', 'suspend_user'].includes(action)) throw requestError(400, 'INVALID_MODERATION_ACTION', 'Unsupported moderation action');
    if (note.trim().length < 5) throw requestError(400, 'INVALID_MODERATION_NOTE', 'Record at least five characters explaining the decision');
    return this.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute('SELECT * FROM user_reports WHERE id = $1 FOR UPDATE', [id]);
      const report = rows[0];
      if (!report) throw requestError(404, 'REPORT_NOT_FOUND', 'Report not found');
      if (report.status !== 'open') throw requestError(409, 'REPORT_RESOLVED', 'This report was already reviewed. Reload the queue.');
      let status = action === 'dismiss' ? 'dismissed' : 'reviewed';
      let auditAction = action === 'dismiss' ? 'report_dismissed' : 'report_reviewed';
      if (action === 'remove_message') {
        if (!report.message_id) throw requestError(400, 'NO_REPORTED_MESSAGE', 'Only an attached reported message can be removed');
        const removed = await executor.execute(`
          UPDATE messages SET body = NULL, ciphertext = NULL, is_deleted = TRUE, removed_by_moderation = TRUE
          WHERE id = $1 RETURNING conversation_id`, [report.message_id]);
        if (!removed.rowCount) throw requestError(404, 'MESSAGE_NOT_FOUND', 'Reported message not found');
        const members = await executor.execute('SELECT user_id FROM conversation_members WHERE conversation_id = $1', [removed.rows[0].conversation_id]);
        for (const member of members.rows) await publishEvent(executor, 'messages.changed', { userId: member.user_id, id: removed.rows[0].conversation_id });
        status = 'actioned'; auditAction = 'message_removed';
      } else if (action === 'suspend_user') {
        const target = await executor.execute("SELECT id, role FROM users WHERE id = $1 AND is_deleted = FALSE FOR UPDATE", [report.reported_user_id]);
        if (!target.rows.length || target.rows[0].role !== 'member' || report.reported_user_id === actorId) {
          throw requestError(403, 'PROTECTED_ACCOUNT', 'Administrators cannot suspend themselves or other administrators here');
        }
        await executor.execute('UPDATE users SET is_active = FALSE WHERE id = $1', [report.reported_user_id]);
        await executor.execute('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [report.reported_user_id]);
        await executor.execute('DELETE FROM push_subscriptions WHERE user_id = $1', [report.reported_user_id]);
        await executor.execute('UPDATE notifications SET push_sent = TRUE WHERE user_id = $1', [report.reported_user_id]);
        await publishEvent(executor, 'account.changed', { userId: report.reported_user_id });
        await publishEvent(executor, 'profiles.changed', { id: report.reported_user_id });
        await publishEvent(executor, 'announcements.changed', { id: report.reported_user_id });
        status = 'actioned'; auditAction = 'user_suspended';
      }
      await executor.execute(`
        UPDATE user_reports SET status = $2, moderator_id = $3, moderator_note = $4, reviewed_at = NOW() WHERE id = $1`,
      [id, status, actorId, note.trim()]);
      await this.audit(executor, actorId, auditAction, action === 'remove_message' ? report.message_id : report.reported_user_id, id);
      await communityRepository.notify(executor, {
        userId: report.reporter_id, kind: 'report_reviewed', title: 'An administrator reviewed your report', link: '#reports', key: `report-reviewed:${id}`,
      });
      await publishEvent(executor, 'reports.changed', { userId: report.reporter_id, id });
      await publishAdminEvent(executor);
      return { id, status };
    });
  }

  async auditLog(actorId, { page, pageSize }) {
    return this.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute(`
        SELECT id, actor_id AS "actorId", action, target_id AS "targetId", report_id AS "reportId", created_at AS "createdAt"
        FROM admin_audit ORDER BY created_at DESC, id DESC LIMIT $1 OFFSET $2`, [pageSize + 1, (page - 1) * pageSize]);
      return rows;
    });
  }
}

export const administrationRepository = new AdministrationRepository();
