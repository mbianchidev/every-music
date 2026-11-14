import { realmConnector } from '../repositories/realm-connector.js';
import { billingRepository } from '../repositories/billing-repository.js';
import { pointsRepository } from '../repositories/points-repository.js';
import { entitlementRepository } from '../repositories/entitlement-repository.js';
import { notificationRepository } from '../repositories/notification-repository.js';
import {
  ACTIVE_SUBSCRIPTION_STATUSES, PaymentGateway, invoiceSubscriptionId, stripeId, subscriptionPeriodEnd, subscriptionPlan,
} from '../engines/payment-gateway.js';
import { requestError } from '../engines/request-error.js';
import { ok } from './response-helpers.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLAN_NAMES = { premium: 'Premium', partner: 'Partner' };

const isActive = row => Boolean(row && ACTIVE_SUBSCRIPTION_STATUSES.has(row.status)
  && row.current_period_end && new Date(row.current_period_end) > new Date());

// Stripe Checkout, the customer portal, and webhook fulfillment. Plans and
// points are granted only from signed webhook events, never from the
// browser returning to the success URL.
export class BillingConductor {
  constructor(config, gateway = new PaymentGateway(config.monetization.stripe)) {
    this.config = config;
    this.stripe = config.monetization.stripe;
    this.gateway = gateway;
    this.origin = config.boundaries.portalOrigins[0].replace(/\/$/, '');
  }

  catalog() {
    const { stripe } = this;
    return {
      enabled: this.gateway.enabled,
      currency: stripe.currency,
      plans: [
        { id: 'premium', amountMinor: stripe.premiumMonthlyMinor, interval: 'month', available: this.gateway.enabled && Boolean(stripe.premiumPriceId) },
        { id: 'partner', amountMinor: stripe.partnerMonthlyMinor, interval: 'month', available: this.gateway.enabled && Boolean(stripe.partnerPriceId) },
      ],
      packs: this.gateway.enabled ? stripe.packs.map(({ id, points, amountMinor }) => ({ id, points, amountMinor })) : [],
    };
  }

  overview = async (request, reply) => {
    const { userId } = request.authenticatedUser;
    const [current, subscription, customer] = await Promise.all([
      entitlementRepository.limitsFor(userId),
      billingRepository.currentSubscription(userId),
      billingRepository.customerFor(realmConnector, userId),
    ]);
    return ok(reply, {
      ...this.catalog(),
      plan: current.plan,
      entitlements: current.entitlements,
      limits: current.limits,
      perks: { free: this.config.entitlements.free, premium: this.config.entitlements.premium, partner: this.config.entitlements.partner },
      subscription,
      billingAccount: Boolean(customer) && this.gateway.enabled,
    });
  };

  checkout = async (request, reply) => {
    this.gateway.requireEnabled();
    const { userId, email } = request.authenticatedUser;
    const { product, packId } = request.body;
    let price;
    let pack = null;
    if (product === 'points') {
      pack = this.stripe.packs.find(item => item.id === packId);
      if (!pack) throw requestError(404, 'PACK_NOT_FOUND', 'This points pack is not available');
      price = pack.priceId;
    } else {
      price = product === 'premium' ? this.stripe.premiumPriceId : this.stripe.partnerPriceId;
      if (!price) throw requestError(404, 'PLAN_NOT_AVAILABLE', 'This plan is not available on this server');
      if (await billingRepository.activeSubscription(realmConnector, userId)) {
        throw requestError(409, 'SUBSCRIPTION_EXISTS', 'You already have a subscription. Change or cancel it from Manage billing.');
      }
    }
    let customerId = await billingRepository.customerFor(realmConnector, userId);
    if (!customerId) {
      const customer = await this.gateway.createCustomer({ userId, email });
      customerId = await billingRepository.linkCustomer(realmConnector, userId, customer.id);
    }
    const metadata = { userId, product, ...(pack ? { packId: pack.id } : {}) };
    const session = await this.gateway.createCheckout({
      mode: pack ? 'payment' : 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${this.origin}/#store?checkout=success`,
      cancel_url: `${this.origin}/#store?checkout=cancelled`,
      metadata,
      ...(pack ? { payment_intent_data: { metadata } } : { subscription_data: { metadata: { userId, plan: product } } }),
    });
    if (!session?.id || !session?.url) throw requestError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider returned an incomplete checkout session');
    await billingRepository.recordCheckout(realmConnector, {
      id: session.id, userId, product, packId: pack?.id ?? null, points: pack?.points ?? null,
    });
    return ok(reply, { url: session.url, sessionId: session.id }, 201);
  };

  portal = async (request, reply) => {
    this.gateway.requireEnabled();
    const customerId = await billingRepository.customerFor(realmConnector, request.authenticatedUser.userId);
    if (!customerId) throw requestError(404, 'BILLING_ACCOUNT_NOT_FOUND', 'You have no billing account yet. Subscribe or buy points first.');
    const session = await this.gateway.createPortal({ customer: customerId, return_url: `${this.origin}/#store` });
    return ok(reply, { url: session.url });
  };

  // Verified, then applied exactly once: the event ID is stored in the same
  // transaction as its effects, so a failure rolls both back and Stripe
  // retries the delivery.
  webhook = async (request, reply) => {
    const event = this.gateway.verifyEvent(request.body, request.headers['stripe-signature']);
    const duplicate = await realmConnector.transaction(async (executor) => {
      if (!await billingRepository.recordEvent(executor, event)) return true;
      await this.apply(executor, event, request.log);
      return false;
    });
    return ok(reply, { received: true, duplicate });
  };

  async apply(executor, event, log) {
    const object = event.data?.object ?? {};
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        return this.completeCheckout(executor, object, log);
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        return billingRepository.finishCheckout(executor, object.id, 'expired');
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.paused':
      case 'customer.subscription.resumed':
        return this.syncSubscription(executor, object, event, log);
      case 'invoice.payment_failed':
        return this.paymentFailed(executor, object, event);
      default:
        log.debug({ type: event.type }, 'Ignoring unhandled Stripe event');
        return undefined;
    }
  }

  async completeCheckout(executor, session, log) {
    const checkout = await billingRepository.lockCheckout(executor, session.id);
    if (!checkout) {
      log.warn({ sessionId: session.id }, 'Stripe checkout session is unknown to this server');
      return;
    }
    const customerId = stripeId(session.customer);
    if (customerId) await billingRepository.linkCustomer(executor, checkout.user_id, customerId);
    if (checkout.status === 'completed') return;
    if (checkout.product !== 'points') {
      await billingRepository.finishCheckout(executor, checkout.id, 'completed');
      return;
    }
    if (!['paid', 'no_payment_required'].includes(session.payment_status)) return;
    const credit = await pointsRepository.credit(executor, {
      userId: checkout.user_id, delta: checkout.points, reason: 'purchase', reference: `stripe:${checkout.id}`, note: checkout.pack_id,
    });
    await billingRepository.finishCheckout(executor, checkout.id, 'completed');
    if (!credit.duplicate) {
      await notificationRepository.create(executor, {
        userId: checkout.user_id, kind: 'points_earned', title: `You earned ${checkout.points} points`, link: '#wallet',
        key: `points:purchase:${checkout.id}`, params: { points: checkout.points, reason: 'purchase' },
      });
    }
  }

  async resolveUser(executor, customerId, metadataUserId) {
    const linked = customerId ? await billingRepository.userForCustomer(executor, customerId) : null;
    if (linked || !UUID.test(metadataUserId ?? '')) return linked;
    const { rows } = await executor.execute('SELECT id FROM users WHERE id = $1 AND is_deleted = FALSE', [metadataUserId]);
    if (!rows.length) return null;
    if (customerId) await billingRepository.linkCustomer(executor, rows[0].id, customerId);
    return rows[0].id;
  }

  async syncSubscription(executor, subscription, event, log) {
    const plan = subscriptionPlan(subscription, this.stripe);
    if (!plan) {
      log.warn({ subscriptionId: subscription.id }, 'Stripe subscription uses a price that is not configured as a plan');
      return;
    }
    const existing = await billingRepository.lockSubscription(executor, subscription.id);
    if (existing && new Date(existing.last_event_at).getTime() > event.created * 1000) return;
    const customerId = stripeId(subscription.customer);
    const userId = existing?.user_id ?? await this.resolveUser(executor, customerId, subscription.metadata?.userId);
    const saved = await billingRepository.saveSubscription(executor, {
      id: subscription.id, userId, customerId: customerId ?? existing?.customer_id, plan, status: subscription.status,
      periodEnd: subscriptionPeriodEnd(subscription), cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
      eventAt: event.created,
    });
    const active = await billingRepository.syncEntitlement(executor, saved);
    if (saved.user_id && active !== isActive(existing)) {
      await notificationRepository.create(executor, {
        userId: saved.user_id,
        kind: active ? 'subscription_started' : 'subscription_ended',
        title: active ? `Your ${PLAN_NAMES[plan]} plan is active` : `Your ${PLAN_NAMES[plan]} plan has ended`,
        link: '#store', key: `billing:${event.id}`, params: { plan },
      });
    }
  }

  async paymentFailed(executor, invoice, event) {
    const userId = await this.resolveUser(executor, stripeId(invoice.customer), null);
    if (!userId) return;
    const subscriptionId = invoiceSubscriptionId(invoice);
    const subscription = subscriptionId ? await billingRepository.lockSubscription(executor, subscriptionId) : null;
    const plan = subscription?.plan ?? 'premium';
    await notificationRepository.create(executor, {
      userId, kind: 'payment_failed', title: `A payment for your ${PLAN_NAMES[plan]} plan failed`, link: '#store',
      key: `billing:${event.id}`, params: { plan },
    });
  }
}
