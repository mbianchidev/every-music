import { realmConnector } from './realm-connector.js';
import { publishEvent } from './event-publisher.js';
import { ACTIVE_SUBSCRIPTION_STATUSES, ENTITLEMENT_GRACE_DAYS } from '../engines/payment-gateway.js';

export function subscriptionView(row) {
  if (!row) return null;
  return {
    id: row.id, plan: row.plan, status: row.status, currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: row.cancel_at_period_end, active: ACTIVE_SUBSCRIPTION_STATUSES.has(row.status),
  };
}

// Stripe customers, checkout sessions, subscriptions and processed webhook
// events. Entitlements for subscriptions use source 'stripe' and the
// subscription ID as reference, so each subscription maps to one row.
class BillingRepository {
  async customerFor(executor, userId) {
    const { rows } = await executor.execute('SELECT customer_id FROM billing_customers WHERE user_id = $1', [userId]);
    return rows[0]?.customer_id ?? null;
  }

  async linkCustomer(executor, userId, customerId) {
    await executor.execute(`
      INSERT INTO billing_customers (customer_id, user_id) VALUES ($1, $2)
      ON CONFLICT DO NOTHING`, [customerId, userId]);
    return this.customerFor(executor, userId);
  }

  async userForCustomer(executor, customerId) {
    const { rows } = await executor.execute('SELECT user_id FROM billing_customers WHERE customer_id = $1', [customerId]);
    return rows[0]?.user_id ?? null;
  }

  async recordCheckout(executor, { id, userId, product, packId = null, points = null }) {
    await executor.execute(`
      INSERT INTO billing_checkout_sessions (id, user_id, product, pack_id, points) VALUES ($1, $2, $3, $4, $5)`,
    [id, userId, product, packId, points]);
  }

  async lockCheckout(executor, id) {
    const { rows } = await executor.execute('SELECT * FROM billing_checkout_sessions WHERE id = $1 FOR UPDATE', [id]);
    return rows[0] ?? null;
  }

  async finishCheckout(executor, id, status) {
    await executor.execute(`
      UPDATE billing_checkout_sessions SET status = $2, completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
      WHERE id = $1 AND status = 'open'`, [id, status]);
  }

  // Returns false when the event was already processed. A concurrent delivery
  // of the same event waits on the primary key until the first one commits.
  async recordEvent(executor, event) {
    const { rowCount } = await executor.execute(`
      INSERT INTO billing_webhook_events (id, type, event_created_at) VALUES ($1, $2, to_timestamp($3))
      ON CONFLICT (id) DO NOTHING`, [event.id, event.type, event.created]);
    return rowCount === 1;
  }

  async lockSubscription(executor, id) {
    const { rows } = await executor.execute('SELECT * FROM billing_subscriptions WHERE id = $1 FOR UPDATE', [id]);
    return rows[0] ?? null;
  }

  async saveSubscription(executor, { id, userId, customerId, plan, status, periodEnd, cancelAtPeriodEnd, eventAt }) {
    const { rows } = await executor.execute(`
      INSERT INTO billing_subscriptions (id, user_id, customer_id, plan, status, current_period_end, cancel_at_period_end, last_event_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
      ON CONFLICT (id) DO UPDATE SET user_id = COALESCE(EXCLUDED.user_id, billing_subscriptions.user_id),
        plan = EXCLUDED.plan, status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end, last_event_at = EXCLUDED.last_event_at, updated_at = NOW()
      RETURNING *`, [id, userId, customerId, plan, status, periodEnd, cancelAtPeriodEnd, eventAt]);
    return rows[0];
  }

  // Keeps the subscription's entitlement in step with its Stripe status.
  async syncEntitlement(executor, subscription) {
    const active = ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status) && subscription.current_period_end
      && new Date(subscription.current_period_end) > new Date();
    if (active && subscription.user_id) {
      await executor.execute(`
        INSERT INTO user_entitlements (user_id, plan, source, reference, ends_at)
        VALUES ($1, $2, 'stripe', $3, $4::timestamptz + make_interval(days => $5::int))
        ON CONFLICT (source, reference) WHERE reference IS NOT NULL
        DO UPDATE SET plan = EXCLUDED.plan, ends_at = EXCLUDED.ends_at, revoked_at = NULL`,
      [subscription.user_id, subscription.plan, subscription.id, subscription.current_period_end, ENTITLEMENT_GRACE_DAYS]);
    } else {
      await executor.execute(`
        UPDATE user_entitlements SET revoked_at = NOW()
        WHERE source = 'stripe' AND reference = $1 AND revoked_at IS NULL`, [subscription.id]);
    }
    if (subscription.user_id) await publishEvent(executor, 'entitlements.changed', { userId: subscription.user_id });
    return Boolean(active);
  }

  async currentSubscription(userId, executor = realmConnector) {
    const { rows } = await executor.execute(`
      SELECT * FROM billing_subscriptions WHERE user_id = $1
      ORDER BY (status IN ('active', 'trialing', 'past_due')) DESC, updated_at DESC LIMIT 1`, [userId]);
    return subscriptionView(rows[0]);
  }

  async activeSubscription(executor, userId) {
    const { rows } = await executor.execute(`
      SELECT * FROM billing_subscriptions WHERE user_id = $1 AND status IN ('active', 'trialing', 'past_due', 'incomplete')
      LIMIT 1`, [userId]);
    return rows[0] ?? null;
  }

  // Customers whose account was deleted: their Stripe customer (and with it
  // any subscription) is deleted by the maintenance job.
  async orphanedCustomers(executor, limit = 20) {
    const { rows } = await executor.execute(`
      SELECT customer_id FROM billing_customers WHERE user_id IS NULL ORDER BY created_at
      LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit]);
    return rows.map(row => row.customer_id);
  }

  async forgetCustomer(executor, customerId) {
    await executor.execute('DELETE FROM billing_subscriptions WHERE customer_id = $1 AND user_id IS NULL', [customerId]);
    await executor.execute('DELETE FROM billing_customers WHERE customer_id = $1 AND user_id IS NULL', [customerId]);
  }

  async purgeEvents(executor, days = 90) {
    const { rowCount } = await executor.execute(`
      DELETE FROM billing_webhook_events WHERE processed_at < NOW() - make_interval(days => $1::int)`, [days]);
    await executor.execute(`
      DELETE FROM billing_checkout_sessions WHERE status <> 'completed' AND created_at < NOW() - make_interval(days => $1::int)`, [days]);
    return rowCount;
  }

  async stats(executor) {
    const { rows } = await executor.execute(`
      SELECT plan, status, COUNT(*)::int AS count FROM billing_subscriptions
      WHERE status IN ('active', 'trialing', 'past_due') GROUP BY plan, status`);
    const count = (plan, statuses) => rows.filter(row => row.plan === plan && statuses.includes(row.status))
      .reduce((sum, row) => sum + row.count, 0);
    return {
      premium: count('premium', ['active', 'trialing', 'past_due']),
      partner: count('partner', ['active', 'trialing', 'past_due']),
      pastDue: rows.filter(row => row.status === 'past_due').reduce((sum, row) => sum + row.count, 0),
    };
  }
}

export const billingRepository = new BillingRepository();
