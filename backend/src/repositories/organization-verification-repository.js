import { realmConnector } from './realm-connector.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { organizationRepository } from './organization-repository.js';
import { verificationCode } from './verification-repository.js';
import { requestError } from '../engines/request-error.js';

const mediaUrl = id => (id ? `/realm/media/${id}` : null);

function requestView(row) {
  return {
    id: row.id, status: row.status, challengeCode: row.challenge_code, note: row.request_note,
    documentUrl: mediaUrl(row.document_media_id), reviewNote: row.status === 'pending' ? null : row.review_note,
    createdAt: row.created_at, reviewedAt: row.reviewed_at,
  };
}

// Verification requests for organization pages reuse verification_requests
// with subject_type 'organization'. Only the page leader can request; an
// administrator decides in the shared verification queue.
class OrganizationVerificationRepository {
  async leader(executor, organizationId, userId, lock = false) {
    const access = await organizationRepository.requireMember(executor, organizationId, userId, null, { lock });
    if (access.role !== 'leader') throw requestError(403, 'LEADER_REQUIRED', 'Only the page leader can request verification');
    return access;
  }

  async status(organizationId, userId) {
    await this.leader(realmConnector, organizationId, userId);
    const { rows: [organization] } = await realmConnector.execute('SELECT verified_at FROM organizations WHERE id = $1', [organizationId]);
    const { rows } = await realmConnector.execute(`
      SELECT * FROM verification_requests WHERE subject_type = 'organization' AND subject_id = $1
      ORDER BY created_at DESC, id DESC LIMIT 1`, [organizationId]);
    return {
      verified: Boolean(organization.verified_at), verifiedAt: organization.verified_at,
      challengeCode: verificationCode(organizationId), request: rows[0] ? requestView(rows[0]) : null,
    };
  }

  async submit(organizationId, userId, { note, documentMediaId }) {
    const text = note.trim();
    if (text.length < 10) throw requestError(400, 'VALIDATION_ERROR', 'Explain in at least ten characters how we can confirm the page');
    return realmConnector.transaction(async executor => {
      const access = await this.leader(executor, organizationId, userId, true);
      const { rows: [organization] } = await executor.execute('SELECT name, verified_at FROM organizations WHERE id = $1', [organizationId]);
      if (organization.verified_at) throw requestError(409, 'ALREADY_VERIFIED', 'This page is already verified.');
      const pending = await executor.execute(`
        SELECT id FROM verification_requests WHERE subject_type = 'organization' AND subject_id = $1 AND status = 'pending'`, [organizationId]);
      if (pending.rowCount) throw requestError(409, 'VERIFICATION_PENDING', 'A verification request is already waiting for review.');
      await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
      const { rows: recent } = await executor.execute(`
        SELECT COUNT(*)::int AS count FROM account_rate_events
        WHERE user_id = $1 AND action = 'organization_verification' AND created_at > NOW() - INTERVAL '1 day'`, [userId]);
      if (recent[0].count >= 3) throw requestError(429, 'ACCOUNT_RATE_LIMIT', 'You can submit three page verification requests per day.');
      await executor.execute("INSERT INTO account_rate_events (user_id, action) VALUES ($1, 'organization_verification')", [userId]);
      const documentId = documentMediaId?.toLowerCase() ?? null;
      if (documentId) {
        const media = await executor.execute(`
          SELECT m.id FROM media m WHERE m.id = $1 AND m.user_id = $2 AND m.purpose = 'verification'
            AND NOT EXISTS(SELECT 1 FROM verification_requests v WHERE m.id IN (v.selfie_media_id, v.document_media_id))`, [documentId, userId]);
        if (!media.rowCount) throw requestError(400, 'INVALID_MEDIA', 'Upload a new verification document from this account.');
      }
      const { rows } = await executor.execute(`
        INSERT INTO verification_requests (subject_type, subject_id, requested_by, challenge_code, document_media_id, request_note)
        VALUES ('organization', $1, $2, $3, $4, $5) RETURNING *`,
      [organizationId, userId, verificationCode(organizationId), documentId, text]);
      const admins = (await executor.execute(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE AND is_deleted = FALSE AND id <> $1", [userId])).rows.map(row => row.id);
      await notificationRepository.createMany(executor, admins, {
        kind: 'verification_requested', title: `The page "${organization.name}" requested verification`, link: '#admin',
        keyPrefix: `verification-requested:${rows[0].id}`,
        params: { subjectType: 'organization', organizationId, organizationName: access.organization.name },
      });
      await publishAdminEvent(executor);
      await publishEvent(executor, 'verification.changed', { userId });
      return requestView(rows[0]);
    });
  }

  async cancel(organizationId, userId, requestId) {
    return realmConnector.transaction(async executor => {
      await this.leader(executor, organizationId, userId, true);
      const { rows } = await executor.execute(`
        UPDATE verification_requests SET status = 'cancelled', reviewed_at = NOW(), media_purge_after = NULL
        WHERE id = $1 AND subject_type = 'organization' AND subject_id = $2 AND status = 'pending'
        RETURNING id, document_media_id`, [requestId, organizationId]);
      if (!rows.length) throw requestError(404, 'VERIFICATION_NOT_FOUND', 'No pending verification request was found.');
      if (rows[0].document_media_id) await executor.execute('DELETE FROM media WHERE id = $1', [rows[0].document_media_id]);
      await publishAdminEvent(executor);
      await publishEvent(executor, 'verification.changed', { userId });
      return { id: rows[0].id, status: 'cancelled' };
    });
  }
}

export const organizationVerificationRepository = new OrganizationVerificationRepository();
