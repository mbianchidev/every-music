import { realmConnector } from './realm-connector.js';
import { publishEvent } from './event-publisher.js';
import { requestError } from '../engines/request-error.js';

export const EARN_REASONS = ['purchase', 'referral_inviter', 'referral_invitee', 'rewarded_video', 'app_rating', 'event_grant'];

export function ledgerView(row) {
  return {
    id: row.id, delta: row.delta, reason: row.reason, balanceAfter: row.balance_after,
    note: row.note, createdAt: row.created_at,
  };
}

// Append-only points ledger. Every change locks the user's balance row, so
// concurrent spends serialize and a balance can never go negative. Each entry
// has a unique `reference`; replaying a reference returns the earlier entry
// instead of applying it twice.
class PointsRepository {
  async adjust(executor, { userId, delta, reason, reference, actorId = null, note = null }) {
    if (!Number.isInteger(delta) || delta === 0) throw new Error('Points adjustments must be non-zero integers');
    await executor.execute('INSERT INTO points_balances (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    const { rows: [current] } = await executor.execute('SELECT balance FROM points_balances WHERE user_id = $1 FOR UPDATE', [userId]);
    const { rows: existing } = await executor.execute('SELECT * FROM points_ledger WHERE reference = $1', [reference]);
    if (existing.length) return { entry: ledgerView(existing[0]), balance: current.balance, duplicate: true };
    const balance = current.balance + delta;
    if (balance < 0) {
      throw requestError(409, 'INSUFFICIENT_POINTS', `You need ${-delta} points but have ${current.balance}. Earn or buy more points first.`);
    }
    const { rows: [entry] } = await executor.execute(`
      INSERT INTO points_ledger (user_id, delta, reason, reference, balance_after, actor_id, note)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [userId, delta, reason, reference, balance, actorId, note]);
    await executor.execute('UPDATE points_balances SET balance = $2, updated_at = NOW() WHERE user_id = $1', [userId, balance]);
    await publishEvent(executor, 'points.changed', { userId });
    return { entry: ledgerView(entry), balance, duplicate: false };
  }

  credit(executor, entry) {
    return this.adjust(executor, entry);
  }

  debit(executor, { points, ...entry }) {
    return this.adjust(executor, { ...entry, delta: -points });
  }

  async balance(userId, executor = realmConnector) {
    const { rows } = await executor.execute('SELECT balance FROM points_balances WHERE user_id = $1', [userId]);
    return rows[0]?.balance ?? 0;
  }

  async ledger(userId, { page, pageSize }) {
    const { rows } = await realmConnector.execute(`
      SELECT * FROM points_ledger WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [userId, pageSize + 1, (page - 1) * pageSize]);
    return rows.map(ledgerView);
  }

  async lookupUser(executor, email) {
    const { rows } = await executor.execute(`
      SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE AND is_deleted = FALSE`, [email]);
    if (!rows.length) throw requestError(404, 'ACCOUNT_NOT_FOUND', 'No active account uses this email address');
    return rows[0].id;
  }

  async recentGrants(executor, limit = 20) {
    const { rows } = await executor.execute(`
      SELECT l.id, l.delta, l.note, l.created_at, l.user_id, p.artist_name
      FROM points_ledger l LEFT JOIN profiles p ON p.user_id = l.user_id
      WHERE l.reason = 'event_grant' ORDER BY l.created_at DESC, l.id DESC LIMIT $1`, [limit]);
    return rows.map(row => ({
      id: row.id, points: row.delta, note: row.note, createdAt: row.created_at, userId: row.user_id, artistName: row.artist_name,
    }));
  }

  async totals(executor, days = 30) {
    const { rows } = await executor.execute(`
      SELECT reason, SUM(delta)::int AS total, COUNT(*)::int AS entries FROM points_ledger
      WHERE created_at > NOW() - make_interval(days => $1::int) GROUP BY reason`, [days]);
    const { rows: [outstanding] } = await executor.execute('SELECT COALESCE(SUM(balance), 0)::int AS total FROM points_balances');
    return {
      earned: Object.fromEntries(rows.filter(row => row.total > 0).map(row => [row.reason, row.total])),
      spent: Object.fromEntries(rows.filter(row => row.total < 0).map(row => [row.reason, -row.total])),
      outstanding: outstanding.total,
    };
  }
}

export const pointsRepository = new PointsRepository();
