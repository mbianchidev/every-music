import { randomBytes } from 'node:crypto';
import Stripe from 'stripe';

// A stand-in for the Stripe API client used by integration and browser tests.
// It records calls and returns objects shaped like Stripe's, without any
// network access. Webhooks are signed with the real SDK helper.
export function syntheticStripeClient({ origin = 'http://127.0.0.1', checkoutUrl = sessionId => `${origin}/synthetic-checkout/${sessionId}` } = {}) {
  const id = prefix => `${prefix}_synthetic${randomBytes(9).toString('hex')}`;
  const calls = { customers: [], checkouts: [], portals: [], deletedCustomers: [] };
  return {
    calls,
    customers: {
      async create(params, options) {
        calls.customers.push({ params, options });
        return { id: id('cus'), object: 'customer', email: params.email, metadata: params.metadata };
      },
      async del(customerId) {
        calls.deletedCustomers.push(customerId);
        return { id: customerId, object: 'customer', deleted: true };
      },
    },
    checkout: {
      sessions: {
        async create(params) {
          calls.checkouts.push(params);
          const sessionId = id('cs_test');
          return { id: sessionId, object: 'checkout.session', url: checkoutUrl(sessionId), mode: params.mode };
        },
      },
    },
    billingPortal: {
      sessions: {
        async create(params) {
          calls.portals.push(params);
          return { id: id('bps'), object: 'billing_portal.session', url: params.return_url ?? `${origin}/synthetic-portal`, return_url: params.return_url };
        },
      },
    },
  };
}

// Builds a signed webhook delivery for `app.inject` or `fetch`.
export function signedStripeEvent(secret, type, object, { eventId = `evt_synthetic${randomBytes(9).toString('hex')}`, created } = {}) {
  const payload = JSON.stringify({
    id: eventId, object: 'event', type, created: created ?? Math.floor(Date.now() / 1000), livemode: false,
    api_version: Stripe.API_VERSION, data: { object },
  });
  return { payload, signature: Stripe.webhooks.generateTestHeaderString({ payload, secret }) };
}
