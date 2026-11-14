import { realmConnector } from './realm-connector.js';
import { requestError } from '../engines/request-error.js';
import { publishEvent } from './event-publisher.js';

// SQL predicate: true when either account has blocked the other.
export const blockedBetween = (first, second) => `EXISTS (SELECT 1 FROM blocked_users bu
  WHERE (bu.user_id = ${first} AND bu.blocked_user_id = ${second}) OR (bu.user_id = ${second} AND bu.blocked_user_id = ${first}))`;

export const VISIT_RETENTION_DAYS = 30;

class SocialRepository {
  async resolveMember(executor, reference, { activeOnly = true } = {}) {
    const { rows } = await executor.execute(`
      SELECT u.id FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE (u.id = $1 OR p.id = $1) ${activeOnly ? 'AND u.is_active = TRUE AND u.is_deleted = FALSE' : ''}
      LIMIT 1`, [reference]);
    if (!rows.length) throw requestError(404, 'PROFILE_NOT_FOUND', 'Musician not found');
    return rows[0].id;
  }

  // Blocking also ends follows in both directions and forgets recorded
  // visits between the two accounts. Conversation rules stay unchanged.
  async block(userId, reference) {
    return realmConnector.transaction(async (executor) => {
      const target = await this.resolveMember(executor, reference);
      if (target === userId) throw requestError(400, 'INVALID_BLOCK', 'You cannot block yourself');
      await executor.execute('INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, target]);
      await executor.execute(`DELETE FROM followers
        WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)`, [userId, target]);
      await executor.execute(`DELETE FROM profile_visits
        WHERE (owner_id = $1 AND visitor_id = $2) OR (owner_id = $2 AND visitor_id = $1)`, [userId, target]);
      await this.changed(executor, userId, target);
      return { userId: target, blocked: true };
    });
  }

  async unblock(userId, reference) {
    return realmConnector.transaction(async (executor) => {
      const target = await this.resolveMember(executor, reference, { activeOnly: false });
      await executor.execute('DELETE FROM blocked_users WHERE user_id = $1 AND blocked_user_id = $2', [userId, target]);
      await this.changed(executor, userId, target);
      return { userId: target, blocked: false };
    });
  }

  async changed(executor, userId, target) {
    await publishEvent(executor, 'blocks.changed', { userId });
    await publishEvent(executor, 'profiles.changed', { userId, id: target });
    await publishEvent(executor, 'profiles.changed', { userId: target, id: userId });
  }

  async blocked(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT b.blocked_user_id AS "userId", COALESCE(p.artist_name, 'Musician') AS "artistName",
        p.profile_picture_url AS "profilePictureUrl"
      FROM blocked_users b LEFT JOIN profiles p ON p.user_id = b.blocked_user_id
      WHERE b.user_id = $1
      ORDER BY lower(COALESCE(p.artist_name, 'Musician')), b.blocked_user_id LIMIT $2 OFFSET $3`,
    [userId, pageSize + 1, (page - 1) * pageSize]);
    return rows;
  }

  async visitSharing(userId) {
    const { rows } = await realmConnector.execute(
      'SELECT COALESCE((SELECT share_profile_visits FROM user_preferences WHERE user_id = $1), FALSE) AS share', [userId],
    );
    return { share: rows[0].share };
  }

  // Withdrawing consent deletes every visit this user was recorded for.
  async setVisitSharing(userId, share) {
    return realmConnector.transaction(async (executor) => {
      await executor.execute(`
        INSERT INTO user_preferences (user_id, share_profile_visits) VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET share_profile_visits = EXCLUDED.share_profile_visits`, [userId, share]);
      if (!share) await executor.execute('DELETE FROM profile_visits WHERE visitor_id = $1', [userId]);
      await publishEvent(executor, 'preferences.changed', { userId });
      return { share };
    });
  }

  // Records one row per owner, visitor and day, only with the visitor's
  // consent, never for self-views or between blocked accounts.
  async recordVisit(ownerId, visitorId, executor = realmConnector) {
    if (!visitorId || ownerId === visitorId) return false;
    const { rowCount } = await executor.execute(`
      INSERT INTO profile_visits (owner_id, visitor_id)
      SELECT $1, $2 FROM user_preferences pref
      WHERE pref.user_id = $2 AND pref.share_profile_visits = TRUE AND NOT ${blockedBetween('$1::uuid', '$2::uuid')}
      ON CONFLICT (owner_id, day, visitor_id) DO UPDATE SET visited_at = NOW()`, [ownerId, visitorId]);
    return rowCount > 0;
  }

  async visits(ownerId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT v.visitor_id AS "userId", COALESCE(p.artist_name, 'Musician') AS "artistName",
        p.profile_picture_url AS "profilePictureUrl", MAX(v.visited_at) AS "lastVisitedAt", COUNT(*)::int AS "days"
      FROM profile_visits v
      JOIN users u ON u.id = v.visitor_id AND u.is_active = TRUE AND u.is_deleted = FALSE
      JOIN user_preferences pref ON pref.user_id = v.visitor_id AND pref.share_profile_visits = TRUE
      LEFT JOIN profiles p ON p.user_id = v.visitor_id
      WHERE v.owner_id = $1 AND v.day >= CURRENT_DATE - ${VISIT_RETENTION_DAYS - 1}
        AND NOT ${blockedBetween('$1::uuid', 'v.visitor_id')}
      GROUP BY v.visitor_id, p.artist_name, p.profile_picture_url
      ORDER BY MAX(v.visited_at) DESC, v.visitor_id LIMIT $2 OFFSET $3`,
    [ownerId, pageSize + 1, (page - 1) * pageSize]);
    return rows;
  }
}

export const socialRepository = new SocialRepository();
