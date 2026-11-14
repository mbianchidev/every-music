import { realmConnector } from './realm-connector.js';
import { entitlementRepository, withinLimit } from './entitlement-repository.js';
import { requestError } from '../engines/request-error.js';

const visibleOwner = 'EXISTS(SELECT 1 FROM users u WHERE u.id = a.user_id AND u.is_active AND NOT u.is_deleted)';

// Usage counters behind the freemium caps. Callers that enforce a cap must
// hold the user's row lock (`lockUser`) so concurrent writes cannot overshoot.
class QuotaRepository {
  async lockUser(executor, userId) {
    await executor.execute('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  }

  async activeAnnouncements(executor, userId, excludeId = null) {
    const { rows } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM announcements
      WHERE user_id = $1 AND is_published = TRUE AND is_deleted = FALSE
        AND (expires_at IS NULL OR expires_at > NOW()) AND ($2::uuid IS NULL OR id <> $2)`, [userId, excludeId]);
    return rows[0].count;
  }

  async savedAnnouncements(executor, userId) {
    const { rows } = await executor.execute(`
      SELECT COUNT(*)::int AS count FROM saved_announcements sa JOIN announcements a ON a.id = sa.announcement_id
      WHERE sa.user_id = $1 AND a.is_deleted = FALSE AND a.is_published = TRUE
        AND (a.expires_at IS NULL OR a.expires_at > NOW()) AND ${visibleOwner}`, [userId]);
    return rows[0].count;
  }

  async savedSearches(executor, userId) {
    const { rows } = await executor.execute('SELECT COUNT(*)::int AS count FROM saved_searches WHERE user_id = $1', [userId]);
    return rows[0].count;
  }

  async assertCapacity(executor, userId, key, used, message) {
    const { limits } = await entitlementRepository.limitsFor(userId, executor);
    if (!withinLimit(limits[key], used)) throw requestError(403, 'PLAN_LIMIT_REACHED', message(limits[key]));
    return limits[key];
  }

  async summary(userId, executor = realmConnector) {
    const { plan, limits } = await entitlementRepository.limitsFor(userId, executor);
    const usage = (used, limit) => ({ used, limit, remaining: limit === null ? null : Math.max(0, limit - used) });
    return {
      plan,
      activeAnnouncements: usage(await this.activeAnnouncements(executor, userId), limits.maxActiveAnnouncements),
      savedAnnouncements: usage(await this.savedAnnouncements(executor, userId), limits.maxSavedAnnouncements),
      savedSearches: usage(await this.savedSearches(executor, userId), limits.maxSavedSearches),
      announcementExpiryDays: limits.announcementExpiryDays,
      announcementStats: limits.announcementStats,
      profileVisits: limits.profileVisits,
      maxProjectsShown: limits.maxProjectsShown,
      maxContentShown: limits.maxContentShown,
    };
  }
}

export const quotaRepository = new QuotaRepository();
