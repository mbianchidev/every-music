import { realmConnector } from './realm-connector.js';
import { realmConfig } from '../../config/realm.js';
import { requestError } from '../engines/request-error.js';

const PLAN_RANK = { free: 0, premium: 1, partner: 2 };

function entitlementView(row) {
  return {
    id: row.id, plan: row.plan, source: row.source,
    startsAt: row.starts_at, endsAt: row.ends_at,
  };
}

// `null` limits are unlimited; booleans are feature switches.
export function withinLimit(limit, used) {
  return limit === null || used < limit;
}

class EntitlementRepository {
  constructor(config = realmConfig.entitlements) {
    this.config = config;
  }

  async active(userId, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT id, plan, source, starts_at, ends_at FROM user_entitlements
      WHERE user_id = $1 AND revoked_at IS NULL AND starts_at <= NOW()
        AND (ends_at IS NULL OR ends_at > NOW())
      ORDER BY ends_at DESC NULLS FIRST, id`, [userId]);
    return rows.map(entitlementView);
  }

  // The highest active plan decides every limit.
  async limitsFor(userId, executor = realmConnector) {
    const entitlements = await this.active(userId, executor);
    const plan = entitlements.reduce((best, item) => (PLAN_RANK[item.plan] > PLAN_RANK[best] ? item.plan : best), 'free');
    return { plan, limits: { ...this.config[plan] }, entitlements };
  }

  async requireLimit(userId, key, used, executor = realmConnector) {
    const { limits } = await this.limitsFor(userId, executor);
    if (!Object.hasOwn(limits, key)) throw new Error(`Unknown entitlement limit: ${key}`);
    if (typeof limits[key] === 'boolean' ? !limits[key] : !withinLimit(limits[key], used)) {
      throw requestError(403, 'PLAN_LIMIT_REACHED', 'Your current plan does not allow this. Upgrade or free up space first.');
    }
    return limits[key];
  }

  // Idempotent per (source, reference): a repeated reference returns null.
  async grant(executor, { userId, plan, source, reference = null, days = null }) {
    if (!['premium', 'partner'].includes(plan)) throw requestError(400, 'INVALID_PLAN', 'Unsupported plan');
    const { rows } = await executor.execute(`
      INSERT INTO user_entitlements (user_id, plan, source, reference, ends_at)
      SELECT u.id, $2, $3, $4, CASE WHEN $5::int IS NULL THEN NULL ELSE NOW() + make_interval(days => $5::int) END
      FROM users u WHERE u.id = $1 AND u.is_deleted = FALSE
      ON CONFLICT (source, reference) WHERE reference IS NOT NULL DO NOTHING
      RETURNING id, plan, source, starts_at, ends_at`, [userId, plan, source, reference, days]);
    if (!rows.length) {
      if (reference) return null;
      throw requestError(404, 'USER_NOT_FOUND', 'User not found');
    }
    return entitlementView(rows[0]);
  }

  async revoke(executor, id) {
    const { rows } = await executor.execute(`
      UPDATE user_entitlements SET revoked_at = NOW() WHERE id = $1 AND revoked_at IS NULL
      RETURNING id, user_id`, [id]);
    if (!rows.length) throw requestError(404, 'ENTITLEMENT_NOT_FOUND', 'Entitlement not found');
    return { id: rows[0].id, userId: rows[0].user_id };
  }
}

export const entitlementRepository = new EntitlementRepository();
