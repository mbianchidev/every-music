import { realmConnector } from './realm-connector.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { administrationRepository } from './administration-repository.js';
import { accountRepository } from './account-repository.js';
import { organizationRepository } from './organization-repository.js';
import { secretBox } from '../engines/secret-box.js';
import { requestError } from '../engines/request-error.js';
import { mediaStorage } from '../engines/media-storage.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const DAY_MS = 24 * 60 * 60 * 1000;

// A per-account code that changes every UTC day. Members hold it in their
// selfie so reviewers can tell the photo was taken for this request.
export function verificationCode(userId, now = Date.now()) {
  const digest = Buffer.from(secretBox.digest(`verification:${userId}`, Math.floor(now / DAY_MS)), 'hex');
  return `EM-${Array.from(digest.subarray(0, 6), byte => CODE_ALPHABET[byte & 31]).join('')}`;
}

const mediaUrl = id => (id ? `/realm/media/${id}` : null);

function ownView(row) {
  return {
    id: row.id, status: row.status, challengeCode: row.challenge_code,
    selfieUrl: mediaUrl(row.selfie_media_id), documentUrl: mediaUrl(row.document_media_id),
    reviewNote: row.status === 'pending' ? null : row.review_note,
    createdAt: row.created_at, reviewedAt: row.reviewed_at,
  };
}

class VerificationRepository {
  async mine(userId) {
    const { rows: profiles } = await realmConnector.execute('SELECT verified_at FROM profiles WHERE user_id = $1', [userId]);
    const { rows } = await realmConnector.execute(`
      SELECT * FROM verification_requests WHERE subject_type = 'user' AND subject_id = $1
      ORDER BY created_at DESC, id DESC LIMIT 1`, [userId]);
    return {
      verifiedAt: profiles[0]?.verified_at ?? null,
      challengeCode: verificationCode(userId),
      request: rows[0] ? ownView(rows[0]) : null,
    };
  }

  async submit(userId, { selfieMediaId, documentMediaId, challengeCode }) {
    const mediaIds = [selfieMediaId, documentMediaId].filter(Boolean).map(id => id.toLowerCase());
    if (!mediaIds.length) throw requestError(400, 'VERIFICATION_EVIDENCE_REQUIRED', 'Add a selfie holding your code, a document scan, or both.');
    if (new Set(mediaIds).size !== mediaIds.length) throw requestError(400, 'INVALID_MEDIA', 'Use a different image for the selfie and the document.');
    const code = String(challengeCode ?? '').trim().toUpperCase();
    if (![verificationCode(userId), verificationCode(userId, Date.now() - DAY_MS)].includes(code)) {
      throw requestError(400, 'VERIFICATION_CODE_EXPIRED', 'This code has expired. Take a new photo holding the current code.');
    }
    return realmConnector.transaction(async executor => {
      await accountRepository.identity(executor, userId, true);
      const { rows: profiles } = await executor.execute('SELECT verified_at FROM profiles WHERE user_id = $1', [userId]);
      if (!profiles.length) throw requestError(409, 'PROFILE_REQUIRED', 'Create your profile before requesting verification.');
      if (profiles[0].verified_at) throw requestError(409, 'ALREADY_VERIFIED', 'Your profile is already verified.');
      const pending = await executor.execute(`
        SELECT id FROM verification_requests WHERE subject_type = 'user' AND subject_id = $1 AND status = 'pending'`, [userId]);
      if (pending.rowCount) throw requestError(409, 'VERIFICATION_PENDING', 'A verification request is already waiting for review.');
      await accountRepository.throttle(executor, userId, 'verification_request', {
        max: 3, minutes: 24 * 60, message: 'You can submit three verification requests per day.',
      });
      const media = await executor.execute(`
        SELECT m.id FROM media m WHERE m.id = ANY($1::uuid[]) AND m.user_id = $2 AND m.purpose = 'verification'
          AND NOT EXISTS(SELECT 1 FROM verification_requests v WHERE m.id IN (v.selfie_media_id, v.document_media_id))`,
      [mediaIds, userId]);
      if (media.rowCount !== mediaIds.length) throw requestError(400, 'INVALID_MEDIA', 'Upload new verification images from this account.');
      const { rows } = await executor.execute(`
        INSERT INTO verification_requests (subject_type, subject_id, requested_by, challenge_code, selfie_media_id, document_media_id)
        VALUES ('user', $1, $1, $2, $3, $4) RETURNING *`,
      [userId, code, selfieMediaId?.toLowerCase() ?? null, documentMediaId?.toLowerCase() ?? null]);
      const admins = (await executor.execute(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = TRUE AND is_deleted = FALSE AND id <> $1", [userId])).rows.map(row => row.id);
      await notificationRepository.createMany(executor, admins, {
        kind: 'verification_requested', title: 'A musician requested profile verification', link: '#admin',
        keyPrefix: `verification-requested:${rows[0].id}`,
      });
      await publishAdminEvent(executor);
      await publishEvent(executor, 'verification.changed', { userId });
      return ownView(rows[0]);
    });
  }

  async cancel(userId, requestId) {
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute(`
        UPDATE verification_requests SET status = 'cancelled', reviewed_at = NOW(), media_purge_after = NULL
        WHERE id = $1 AND requested_by = $2 AND status = 'pending'
        RETURNING id, selfie_media_id, document_media_id`, [requestId, userId]);
      if (!rows.length) throw requestError(404, 'VERIFICATION_NOT_FOUND', 'No pending verification request was found.');
      await executor.execute('DELETE FROM media WHERE id = ANY($1::uuid[])', [[rows[0].selfie_media_id, rows[0].document_media_id].filter(Boolean)]);
      await publishAdminEvent(executor);
      await publishEvent(executor, 'verification.changed', { userId });
      return { id: rows[0].id, status: 'cancelled' };
    });
  }

  async queue(actorId, { page, pageSize }, status) {
    return administrationRepository.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute(`
        SELECT v.id, v.subject_type AS "subjectType", v.subject_id AS "subjectId", v.challenge_code AS "challengeCode",
          v.selfie_media_id AS "selfieMediaId", v.document_media_id AS "documentMediaId", v.status,
          v.review_note AS "reviewNote", v.created_at AS "createdAt", v.reviewed_at AS "reviewedAt",
          p.id AS "profileId", COALESCE(p.artist_name, 'Musician') AS "artistName", p.first_name AS "firstName",
          p.last_name AS "lastName", p.profile_picture_url AS "profilePictureUrl", p.verified_at AS "verifiedAt",
          v.request_note AS "requestNote", o.name AS "organizationName", o.kind AS "organizationKind",
          o.verified_at AS "organizationVerifiedAt"
        FROM verification_requests v LEFT JOIN profiles p ON v.subject_type = 'user' AND p.user_id = v.subject_id
        LEFT JOIN organizations o ON v.subject_type = 'organization' AND o.id = v.subject_id
        WHERE ($1::text IS NULL OR v.status = $1)
        ORDER BY CASE WHEN $1::text = 'pending' THEN v.created_at END ASC, v.created_at DESC, v.id
        LIMIT $2 OFFSET $3`, [status || null, pageSize + 1, (page - 1) * pageSize]);
      return rows;
    });
  }

  // Dedicated administrator read path for private verification images. Every
  // read is audited; the general media route never serves these to others.
  async media(actorId, requestId, mediaId, storage = mediaStorage()) {
    const media = await administrationRepository.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute(`
        SELECT m.id, m.content, m.storage_key, v.subject_id FROM verification_requests v
        JOIN media m ON m.id = $2 AND m.id IN (v.selfie_media_id, v.document_media_id) AND m.purpose = 'verification'
        WHERE v.id = $1`, [requestId, mediaId]);
      if (!rows.length) throw requestError(404, 'IMAGE_NOT_FOUND', 'Image not found');
      await administrationRepository.audit(executor, actorId, 'verification_media_viewed', rows[0].subject_id);
      return rows[0];
    });
    if (!media.storage_key) return media.content;
    const body = await storage.get(media.storage_key);
    if (!body) throw requestError(404, 'IMAGE_NOT_FOUND', 'Image not found');
    return body;
  }

  async decide(actorId, requestId, { decision, note }, retentionDays) {
    const trimmed = note.trim();
    if (trimmed.length < 5) throw requestError(400, 'INVALID_REVIEW_NOTE', 'Record at least five characters explaining the decision.');
    return administrationRepository.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute('SELECT * FROM verification_requests WHERE id = $1 FOR UPDATE', [requestId]);
      const request = rows[0];
      if (!request) throw requestError(404, 'VERIFICATION_NOT_FOUND', 'Verification request not found');
      if (request.status !== 'pending') throw requestError(409, 'VERIFICATION_RESOLVED', 'This request was already decided. Reload the queue.');
      if (request.subject_id === actorId || request.requested_by === actorId) {
        throw requestError(403, 'SELF_REVIEW', 'Another administrator must review your own request.');
      }
      const status = decision === 'approve' ? 'approved' : 'rejected';
      await executor.execute(`
        UPDATE verification_requests SET status = $2, reviewer_id = $3, review_note = $4, reviewed_at = NOW(),
          media_purge_after = NOW() + make_interval(days => $5) WHERE id = $1`,
      [requestId, status, actorId, trimmed, retentionDays]);
      if (request.subject_type === 'organization') return this.decideOrganization(executor, actorId, request, status);
      if (status === 'approved') {
        await executor.execute('UPDATE profiles SET verified_at = NOW() WHERE user_id = $1', [request.subject_id]);
      }
      await administrationRepository.audit(executor, actorId, `verification_${status}`, request.subject_id);
      await notificationRepository.create(executor, {
        userId: request.subject_id, kind: 'verification_decided', link: '#profile', key: `verification-decided:${requestId}`,
        title: status === 'approved' ? 'Your profile is now verified' : 'Your verification request was not approved',
        params: { decision: status },
      });
      await publishEvent(executor, 'profiles.changed', { id: request.subject_id });
      await publishEvent(executor, 'verification.changed', { userId: request.subject_id });
      await publishAdminEvent(executor);
      return { id: requestId, status };
    });
  }

  // Organization pages: approval sets organizations.verified_at; both
  // outcomes are audited and the requesting leader is notified.
  async decideOrganization(executor, actorId, request, status) {
    const member = await executor.execute(`
      SELECT 1 FROM organization_members WHERE organization_id = $1 AND user_id = $2 AND status = 'active'`, [request.subject_id, actorId]);
    if (member.rowCount) throw requestError(403, 'SELF_REVIEW', 'Another administrator must review a page you belong to.');
    const { rows: [organization] } = await executor.execute('SELECT name FROM organizations WHERE id = $1', [request.subject_id]);
    if (!organization) throw requestError(404, 'ORGANIZATION_NOT_FOUND', 'Organization not found');
    if (status === 'approved') await organizationRepository.setVerified(executor, actorId, request.subject_id, true);
    await administrationRepository.audit(executor, actorId, `organization_verification_${status}`, request.subject_id);
    await notificationRepository.create(executor, {
      userId: request.requested_by, kind: 'verification_decided', link: `#organization?id=${request.subject_id}`,
      key: `verification-decided:${request.id}`,
      title: status === 'approved' ? `Your page "${organization.name}" is now verified` : `The verification request for "${organization.name}" was not approved`,
      params: { decision: status, subjectType: 'organization', organizationId: request.subject_id, organizationName: organization.name },
    });
    await publishEvent(executor, 'organizations.changed', { id: request.subject_id });
    await publishEvent(executor, 'verification.changed', { userId: request.requested_by });
    await publishAdminEvent(executor);
    return { id: request.id, status };
  }

  async revoke(actorId, userId) {
    return administrationRepository.withAdmin(actorId, async executor => {
      const { rowCount } = await executor.execute(
        'UPDATE profiles SET verified_at = NULL WHERE user_id = $1 AND verified_at IS NOT NULL', [userId]);
      if (!rowCount) throw requestError(404, 'VERIFICATION_NOT_FOUND', 'This profile is not verified.');
      await administrationRepository.audit(executor, actorId, 'verification_revoked', userId);
      await publishEvent(executor, 'profiles.changed', { id: userId });
      await publishEvent(executor, 'verification.changed', { userId });
      await publishAdminEvent(executor);
      return { userId, verifiedAt: null };
    });
  }
}

export const verificationRepository = new VerificationRepository();
