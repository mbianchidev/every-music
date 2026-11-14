import Stripe from 'stripe';
import { requestError } from './request-error.js';
import { paymentsEnabled } from '../../config/monetization.js';

// Subscription statuses that keep a paid plan. `past_due` keeps it while
// Stripe retries the renewal payment; Stripe moves the subscription to
// `unpaid` or `canceled` when retries are exhausted.
export const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
export const ENTITLEMENT_GRACE_DAYS = 2;

export const stripeId = value => (typeof value === 'string' ? value : value?.id ?? null);

// Newer Stripe API versions report billing periods on subscription items.
export function subscriptionPeriodEnd(subscription) {
  if (Number.isInteger(subscription.current_period_end)) return new Date(subscription.current_period_end * 1000);
  const ends = (subscription.items?.data ?? []).map(item => item.current_period_end).filter(Number.isInteger);
  return ends.length ? new Date(Math.max(...ends) * 1000) : null;
}

// The configured price decides the plan (customers can switch plans in the
// billing portal); checkout metadata is the fallback.
export function subscriptionPlan(subscription, stripe) {
  const prices = (subscription.items?.data ?? []).map(item => stripeId(item.price) ?? stripeId(item.plan));
  if (stripe.partnerPriceId && prices.includes(stripe.partnerPriceId)) return 'partner';
  if (stripe.premiumPriceId && prices.includes(stripe.premiumPriceId)) return 'premium';
  const planned = subscription.metadata?.plan;
  return ['premium', 'partner'].includes(planned) ? planned : null;
}

export function invoiceSubscriptionId(invoice) {
  return stripeId(invoice.subscription ?? invoice.parent?.subscription_details?.subscription ?? null);
}

function providerError(error) {
  return Object.assign(
    requestError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider could not complete the request. Try again in a moment.'),
    { cause: error },
  );
}

// Thin wrapper around the official Stripe SDK. Tests inject `settings.client`
// (a stand-in with the same method shapes) so no network call is made.
export class PaymentGateway {
  constructor(settings = {}) {
    this.settings = settings;
    this.enabled = paymentsEnabled(settings);
    this.client = this.enabled
      ? settings.client ?? new Stripe(settings.secretKey, { maxNetworkRetries: 2, timeout: 10000, appInfo: { name: 'Every.music' } })
      : null;
  }

  requireEnabled() {
    if (!this.enabled) throw requestError(503, 'PAYMENTS_DISABLED', 'Payments are not available on this server');
  }

  // Signature checks use the raw request bytes; parsed JSON would not match.
  verifyEvent(rawBody, signature) {
    this.requireEnabled();
    if (!Buffer.isBuffer(rawBody) || !signature) throw requestError(400, 'INVALID_SIGNATURE', 'Missing webhook signature');
    try {
      return Stripe.webhooks.constructEvent(rawBody, signature, this.settings.webhookSecret);
    } catch (error) {
      throw Object.assign(requestError(400, 'INVALID_SIGNATURE', 'Webhook signature verification failed'), { cause: error });
    }
  }

  async call(operation) {
    this.requireEnabled();
    try {
      return await operation(this.client);
    } catch (error) {
      throw providerError(error);
    }
  }

  createCustomer({ userId, email }) {
    return this.call(client => client.customers.create({ email, metadata: { userId } }, { idempotencyKey: `customer-${userId}` }));
  }

  createCheckout(params) {
    return this.call(client => client.checkout.sessions.create(params));
  }

  createPortal(params) {
    return this.call(client => client.billingPortal.sessions.create(params));
  }

  // Deleting a customer also cancels its subscriptions immediately.
  async deleteCustomer(customerId) {
    this.requireEnabled();
    try {
      return await this.client.customers.del(customerId);
    } catch (error) {
      if (error?.statusCode === 404 || error?.code === 'resource_missing') return { id: customerId, deleted: true };
      throw providerError(error);
    }
  }
}
