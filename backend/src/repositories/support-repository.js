import { realmConnector } from './realm-connector.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { notificationRepository } from './notification-repository.js';
import { administrationRepository } from './administration-repository.js';
import { requestError } from '../engines/request-error.js';

export const SUPPORT_KINDS = ['bug', 'contact', 'work'];
export const SUPPORT_STATUSES = ['open', 'in_progress', 'answered', 'closed'];
const DAILY_ACCOUNT_LIMIT = 10;
const EMAIL = /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/;

const clean = value => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function normalizeSupportRequest(input, { signedIn }) {
  const request = {
    kind: input.kind,
    contactName: clean(input.name),
    contactEmail: clean(input.email)?.toLowerCase() ?? null,
    subject: clean(input.subject) ?? '',
    message: clean(input.message) ?? '',
    steps: clean(input.steps),
    link: clean(input.link),
    diagnostics: null,
  };
  if (!SUPPORT_KINDS.includes(request.kind)) throw requestError(400, 'INVALID_SUPPORT_REQUEST', 'Choose a bug report, contact request, or job enquiry');
  if (request.subject.length < 3) throw requestError(400, 'INVALID_SUPPORT_REQUEST', 'Add a subject of at least three characters');
  if (request.message.length < 10) throw requestError(400, 'INVALID_SUPPORT_REQUEST', 'Describe your request in at least ten characters');
  if (request.contactEmail && !EMAIL.test(request.contactEmail)) throw requestError(400, 'INVALID_EMAIL', 'Enter a valid email address');
  if (!signedIn && !request.contactEmail) throw requestError(400, 'CONTACT_EMAIL_REQUIRED', 'Add an email address so the team can answer you');
  if (request.steps && request.kind !== 'bug') throw requestError(400, 'INVALID_SUPPORT_REQUEST', 'Reproduction steps belong to bug reports');
  if (request.link) {
    let url;
    try { url = new URL(request.link); } catch { url = null; }
    if (!url || !['http:', 'https:'].includes(url.protocol)) throw requestError(400, 'INVALID_LINK', 'Links must start with http:// or https://');
  }
  if (input.diagnostics) {
    if (input.diagnosticsConsent !== true) {
      throw requestError(400, 'DIAGNOSTICS_CONSENT_REQUIRED', 'Technical details are only accepted after you explicitly agree to share them');
    }
    if (request.kind !== 'bug') throw requestError(400, 'INVALID_SUPPORT_REQUEST', 'Technical details belong to bug reports');
    const entries = Object.entries(input.diagnostics).map(([key, value]) => [key, clean(value)]).filter(([, value]) => value);
    request.diagnostics = entries.length ? Object.fromEntries(entries) : null;
  }
  return request;
}

function adminSummary(row) {
  return {
    id: row.id, kind: row.kind, subject: row.subject, status: row.status,
    requesterName: row.requester_name, hasAccount: row.user_id !== null,
    createdAt: row.created_at, answeredAt: row.answered_at,
  };
}

class SupportRepository {
  async create(userId, request) {
    return realmConnector.transaction(async executor => {
      if (userId) {
        await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
        const { rows } = await executor.execute(`
          SELECT COUNT(*)::int AS count FROM support_requests
          WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'`, [userId]);
        if (rows[0].count >= DAILY_ACCOUNT_LIMIT) {
          throw requestError(429, 'SUPPORT_LIMIT', 'At most ten support requests can be sent per day. Try again tomorrow.');
        }
      }
      const { rows } = await executor.execute(`
        INSERT INTO support_requests (kind, user_id, contact_name, contact_email, subject, message, steps, link, diagnostics)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        RETURNING id, status, created_at AS "createdAt"`,
      [request.kind, userId, request.contactName, request.contactEmail, request.subject, request.message,
        request.steps, request.link, request.diagnostics ? JSON.stringify(request.diagnostics) : null]);
      if (userId) await publishEvent(executor, 'support.changed', { userId, id: rows[0].id });
      await publishAdminEvent(executor);
      return rows[0];
    });
  }

  async markForwarded(id) {
    await realmConnector.execute('UPDATE support_requests SET forwarded_at = NOW() WHERE id = $1', [id]);
  }

  async own(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT id, kind, subject, status, reply_note AS "replyNote", answered_at AS "answeredAt", created_at AS "createdAt"
      FROM support_requests WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [userId, pageSize + 1, (page - 1) * pageSize]);
    return rows;
  }

  async inbox(actorId, { page, pageSize }, { status, kind }) {
    return administrationRepository.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute(`
        SELECT s.id, s.kind, s.subject, s.status, s.user_id, s.created_at, s.answered_at,
          COALESCE(s.contact_name, p.artist_name) AS requester_name
        FROM support_requests s LEFT JOIN profiles p ON p.user_id = s.user_id
        WHERE ($1::text IS NULL OR s.status = $1) AND ($2::text IS NULL OR s.kind = $2)
        ORDER BY s.created_at DESC, s.id DESC LIMIT $3 OFFSET $4`,
      [status || null, kind || null, pageSize + 1, (page - 1) * pageSize]);
      const counts = await executor.execute('SELECT status, COUNT(*)::int AS count FROM support_requests GROUP BY status');
      return {
        rows: rows.map(adminSummary),
        counts: Object.fromEntries(SUPPORT_STATUSES.map(name => [name, counts.rows.find(row => row.status === name)?.count ?? 0])),
      };
    });
  }

  async detail(actorId, id) {
    return administrationRepository.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute(`
        SELECT s.*, COALESCE(s.contact_name, p.artist_name) AS requester_name
        FROM support_requests s LEFT JOIN profiles p ON p.user_id = s.user_id WHERE s.id = $1`, [id]);
      const row = rows[0];
      if (!row) throw requestError(404, 'SUPPORT_REQUEST_NOT_FOUND', 'Support request not found');
      await administrationRepository.audit(executor, actorId, 'support_request_viewed', id);
      return {
        ...adminSummary(row),
        userId: row.user_id, contactName: row.contact_name, contactEmail: row.contact_email,
        message: row.message, steps: row.steps, link: row.link, diagnostics: row.diagnostics,
        replyNote: row.reply_note, forwardedAt: row.forwarded_at, updatedAt: row.updated_at,
      };
    });
  }

  async update(actorId, id, { status, replyNote }) {
    const reply = clean(replyNote);
    if (reply !== null && reply.length < 5) throw requestError(400, 'INVALID_REPLY', 'Write at least five characters in the reply note');
    return administrationRepository.withAdmin(actorId, async executor => {
      const { rows } = await executor.execute('SELECT * FROM support_requests WHERE id = $1 FOR UPDATE', [id]);
      const current = rows[0];
      if (!current) throw requestError(404, 'SUPPORT_REQUEST_NOT_FOUND', 'Support request not found');
      if (status === 'answered' && !reply && !current.reply_note) {
        throw requestError(400, 'REPLY_REQUIRED', 'Add a reply note before marking the request as answered');
      }
      if (status === current.status && !reply) return { id, status, replyNote: current.reply_note, answeredAt: current.answered_at };
      const { rows: updated } = await executor.execute(`
        UPDATE support_requests SET status = $2, reply_note = COALESCE($3, reply_note), handled_by = $4,
          answered_at = CASE WHEN $3::text IS NULL THEN answered_at ELSE NOW() END, updated_at = NOW()
        WHERE id = $1 RETURNING status, reply_note, answered_at`, [id, status, reply, actorId]);
      if (status !== current.status) await administrationRepository.audit(executor, actorId, 'support_status_changed', id);
      if (reply) await administrationRepository.audit(executor, actorId, 'support_replied', id);
      if (reply && current.user_id) {
        await notificationRepository.create(executor, {
          userId: current.user_id, kind: 'support_reply', title: 'The team replied to your support request',
          link: '#help?view=requests', key: `support-reply:${id}:${new Date(updated[0].answered_at).getTime()}`,
          params: { subject: current.subject },
        });
      }
      if (current.user_id) await publishEvent(executor, 'support.changed', { userId: current.user_id, id });
      await publishAdminEvent(executor);
      return { id, status: updated[0].status, replyNote: updated[0].reply_note, answeredAt: updated[0].answered_at };
    });
  }

  // Answered and closed requests are kept for a year after their last update.
  async cleanup(executor = realmConnector) {
    const { rowCount } = await executor.execute(`
      DELETE FROM support_requests WHERE status IN ('answered', 'closed') AND updated_at < NOW() - INTERVAL '365 days'`);
    return rowCount;
  }
}

export const supportRepository = new SupportRepository();
