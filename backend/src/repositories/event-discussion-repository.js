import { realmConnector } from './realm-connector.js';
import { publishEvent, publishAdminEvent } from './event-publisher.js';
import { administrationRepository } from './administration-repository.js';
import { displayName } from './organization-repository.js';
import { eventRepository, editorSql, VISIBLE_EVENT } from './event-repository.js';
import { requestError } from '../engines/request-error.js';

const postNotFound = () => requestError(404, 'EVENT_POST_NOT_FOUND', 'Discussion post not found');
const POST_LIMIT = { max: 20, minutes: 10 };

// Serializes per account and records the action, or throws 429; the same
// account_rate_events table as accountRepository.throttle.
async function throttle(executor, userId, action, { max, minutes, message }) {
  await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const { rows } = await executor.execute(`
    SELECT COUNT(*)::int AS count FROM account_rate_events
    WHERE user_id = $1 AND action = $2 AND created_at > NOW() - make_interval(mins => $3)`, [userId, action, minutes]);
  if (rows[0].count >= max) throw requestError(429, 'ACCOUNT_RATE_LIMIT', message);
  await executor.execute('INSERT INTO account_rate_events (user_id, action) VALUES ($1, $2)', [userId, action]);
}

function postView(row, viewerId, moderator) {
  return {
    id: row.id, body: row.body, createdAt: row.created_at,
    author: { userId: row.author_id, name: row.author_name, pictureUrl: row.author_picture_url, verifiedAt: row.author_verified_at },
    isOwn: row.author_id === viewerId, canDelete: row.author_id === viewerId || moderator,
  };
}

class EventDiscussionRepository {
  // Attendees (going or interested), organizers, and administrators may read
  // and write the discussion of a published event.
  async access(executor, eventId, userId, admin, { lock = false } = {}) {
    const { rows } = await executor.execute(`
      SELECT e.id, e.title, e.visibility, e.status, e.owner_user_id, e.created_by, ${editorSql('e', '$2::uuid')} AS editor,
        EXISTS(SELECT 1 FROM event_attendees a WHERE a.event_id = e.id AND a.user_id = $2) AS attendee
      FROM events e WHERE e.id = $1 AND ((${VISIBLE_EVENT}) OR ${editorSql('e', '$2::uuid')} OR $3::boolean)
      ${lock ? 'FOR SHARE OF e' : ''}`, [eventId, userId, admin]);
    const event = rows[0];
    if (!event) throw requestError(404, 'EVENT_NOT_FOUND', 'Event not found');
    if (!event.editor && !event.attendee && !admin) {
      throw requestError(403, 'EVENT_ATTENDANCE_REQUIRED', 'Mark yourself as going or interested to join the discussion');
    }
    return { ...event, moderator: event.editor || admin };
  }

  async posts(userId, eventId, { page, pageSize }, admin = false) {
    const event = await this.access(realmConnector, eventId, userId, admin);
    const { rows } = await realmConnector.execute(`
      SELECT ep.id, ep.body, ep.created_at, ep.author_id, ${displayName('p')} AS author_name,
        p.profile_picture_url AS author_picture_url, p.verified_at AS author_verified_at
      FROM event_posts ep JOIN users u ON u.id = ep.author_id AND u.is_active AND NOT u.is_deleted
      LEFT JOIN profiles p ON p.user_id = ep.author_id
      WHERE ep.event_id = $1 AND NOT EXISTS(SELECT 1 FROM blocked_users b
        WHERE (b.user_id = $2 AND b.blocked_user_id = ep.author_id) OR (b.user_id = ep.author_id AND b.blocked_user_id = $2))
      ORDER BY ep.created_at DESC, ep.id DESC LIMIT $3 OFFSET $4`, [event.id, userId, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(row => postView(row, userId, event.moderator));
  }

  async createPost(userId, eventId, body, admin = false) {
    const text = body.trim();
    if (!text) throw requestError(400, 'VALIDATION_ERROR', 'Write a message first');
    return realmConnector.transaction(async executor => {
      const event = await this.access(executor, eventId, userId, admin, { lock: true });
      if (event.visibility !== 'published') throw requestError(409, 'EVENT_NOT_PUBLISHED', 'Publish the event before starting its discussion');
      await throttle(executor, userId, 'event_post', {
        ...POST_LIMIT, message: `You can post ${POST_LIMIT.max} messages every ${POST_LIMIT.minutes} minutes. Try again shortly.`,
      });
      const { rows } = await executor.execute(`
        INSERT INTO event_posts (event_id, author_id, body) VALUES ($1, $2, $3) RETURNING id`, [event.id, userId, text]);
      await publishEvent(executor, 'gigs.posts.changed', { id: event.id });
      const { rows: [post] } = await executor.execute(`
        SELECT ep.id, ep.body, ep.created_at, ep.author_id, ${displayName('p')} AS author_name,
          p.profile_picture_url AS author_picture_url, p.verified_at AS author_verified_at
        FROM event_posts ep LEFT JOIN profiles p ON p.user_id = ep.author_id WHERE ep.id = $1`, [rows[0].id]);
      return postView(post, userId, event.moderator);
    });
  }

  // Authors delete their own posts; organizers and administrators moderate
  // the board. Administrator removals of someone else's post are audited.
  async removePost(userId, eventId, postId, admin = false) {
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute(`
        SELECT ep.id, ep.author_id, ${editorSql('e', '$3::uuid')} AS editor FROM event_posts ep JOIN events e ON e.id = ep.event_id
        WHERE ep.id = $1 AND ep.event_id = $2 FOR UPDATE OF ep`, [postId, eventId, userId]);
      const post = rows[0];
      if (!post) throw postNotFound();
      if (post.author_id !== userId && !post.editor && !admin) {
        throw requestError(403, 'EVENT_PERMISSION_REQUIRED', 'Only the author, organizers, or administrators can remove this post');
      }
      const { rowCount: resolved } = await executor.execute(`
        UPDATE user_reports SET status = 'actioned', moderator_id = $2, reviewed_at = NOW(),
          moderator_note = COALESCE(moderator_note, 'The reported post was removed')
        WHERE event_post_id = $1 AND status = 'open'`, [post.id, userId]);
      await executor.execute('DELETE FROM event_posts WHERE id = $1', [post.id]);
      if (admin && post.author_id !== userId && !post.editor) {
        await administrationRepository.audit(executor, userId, 'event_post_removed', post.author_id);
      }
      if (resolved) await publishAdminEvent(executor);
      await publishEvent(executor, 'gigs.posts.changed', { id: eventId });
      return { id: post.id, removed: true };
    });
  }

  async createCommunication(userId, eventId, { kind, body }) {
    const text = body.trim();
    if (!text) throw requestError(400, 'VALIDATION_ERROR', 'Write the announcement first');
    return realmConnector.transaction(async executor => {
      const event = await eventRepository.requireEditor(executor, eventId, userId);
      if (event.visibility !== 'published') throw requestError(409, 'EVENT_NOT_PUBLISHED', 'Publish the event before sending announcements');
      return eventRepository.insertCommunication(executor, event.id, userId, { kind, body: text });
    });
  }

  async fileReport(executor, reporterId, { reportedUserId, eventId, postId = null, evidence = null }, input) {
    if (input.consent !== true) throw requestError(400, 'REPORT_CONSENT_REQUIRED', 'Explicitly agree before disclosing report content to administrators.');
    const details = input.details.trim();
    if (details.length < 5) throw requestError(400, 'INVALID_REPORT', 'Add at least five characters describing the concern');
    if (!reportedUserId) throw requestError(409, 'REPORT_UNAVAILABLE', 'This event has no responsible account to report. Contact support instead.');
    if (reportedUserId === reporterId) throw requestError(400, 'INVALID_REPORT', 'You cannot report your own content');
    await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [reporterId]);
    const recent = await executor.execute(
      "SELECT COUNT(*)::int AS count FROM user_reports WHERE reporter_id = $1 AND created_at > NOW() - INTERVAL '1 day'", [reporterId]);
    if (recent.rows[0].count >= 10) throw requestError(429, 'REPORT_LIMIT', 'At most ten reports can be submitted per day');
    const duplicate = await executor.execute(`
      SELECT id FROM user_reports WHERE reporter_id = $1 AND event_id = $2 AND event_post_id IS NOT DISTINCT FROM $3 AND status = 'open'`,
    [reporterId, eventId, postId]);
    if (duplicate.rows.length) throw requestError(409, 'REPORT_EXISTS', 'An open report already exists for this concern');
    const { rows } = await executor.execute(`
      INSERT INTO user_reports (reporter_id, reported_user_id, event_id, event_post_id, category, details, legacy_evidence)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, status, created_at AS "createdAt"`,
    [reporterId, reportedUserId, eventId, postId, input.category, details, evidence]);
    await publishAdminEvent(executor);
    await publishEvent(executor, 'reports.changed', { userId: reporterId, id: rows[0].id });
    return rows[0];
  }

  // The reported post's text is copied as unverified evidence so it stays
  // readable for administrators even after the post is removed.
  async reportPost(userId, eventId, postId, input, admin = false) {
    return realmConnector.transaction(async executor => {
      await this.access(executor, eventId, userId, admin);
      const { rows } = await executor.execute('SELECT id, author_id, body FROM event_posts WHERE id = $1 AND event_id = $2', [postId, eventId]);
      if (!rows[0]) throw postNotFound();
      return this.fileReport(executor, userId, {
        reportedUserId: rows[0].author_id, eventId, postId: rows[0].id, evidence: rows[0].body,
      }, input);
    });
  }

  // Reports about an event target its owner, its creator, or the leader of
  // its first organizer.
  async reportEvent(userId, eventId, input) {
    return realmConnector.transaction(async executor => {
      const { rows } = await executor.execute(`
        SELECT e.id, e.title, COALESCE(e.owner_user_id, e.created_by, (
          SELECT m.user_id FROM event_organizers eo JOIN organization_members m ON m.organization_id = eo.organization_id
            AND m.role = 'leader' AND m.status = 'active'
          WHERE eo.event_id = e.id ORDER BY eo.position LIMIT 1)) AS responsible
        FROM events e WHERE e.id = $1 AND ${VISIBLE_EVENT}`, [eventId]);
      if (!rows[0]) throw requestError(404, 'EVENT_NOT_FOUND', 'Event not found');
      return this.fileReport(executor, userId, { reportedUserId: rows[0].responsible, eventId: rows[0].id, evidence: rows[0].title }, input);
    });
  }
}

export const eventDiscussionRepository = new EventDiscussionRepository();
