import { BillingConductor } from '../conductors/billing-conductor.js';
import { MonetizationConductor } from '../conductors/monetization-conductor.js';
import { MonetizationJobs } from '../engines/monetization-jobs.js';
import { SPEND_KINDS } from '../engines/monetization-rules.js';
import { adminGuard, identityGuard, optionalIdentityGuard } from '../guards/identity-guard.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';
import { realmConfig } from '../../config/realm.js';

const WEBHOOK_BYTES = 512 * 1024;
const https = { type: 'string', maxLength: 2048, pattern: '^https://[^\\s]+$' };
const nullable = schema => ({ ...schema, type: [schema.type, 'null'] });
const tags = { type: 'array', maxItems: 20, uniqueItems: true, items: uuid };
const card = {
  sponsorName: text(80, 2),
  title: text(120, 3),
  body: text(600, 3),
  linkUrl: nullable(https),
  linkLabel: nullable(text(60, 2)),
  imageUrl: { type: ['string', 'null'], pattern: '^/realm/media/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
  imageAlt: nullable(text(200, 0)),
  videoUrl: nullable(https),
  videoSeconds: { type: ['integer', 'null'], minimum: 5, maximum: 600 },
  rewardPoints: { type: ['integer', 'null'], minimum: 1, maximum: 1000 },
  placements: { type: 'array', minItems: 1, maxItems: 2, uniqueItems: true, items: { enum: ['feed', 'musicians'] } },
  genreIds: tags,
  instrumentIds: tags,
  placeId: { type: ['integer', 'null'], minimum: 1, maximum: 2147483647 },
  radiusKm: { type: 'integer', minimum: 1, maximum: 1000 },
  startsAt: { type: 'string', format: 'date-time' },
  endsAt: { type: ['string', 'null'], format: 'date-time' },
  priority: { type: 'integer', minimum: 0, maximum: 100 },
  maxPerPage: { type: 'integer', minimum: 1, maximum: 3 },
  active: { type: 'boolean' },
};

export async function monetizationOrchestrator(fastify, { config: provided, connector = realmConnector, backgroundJobs = true }) {
  const config = {
    ...provided,
    monetization: provided.monetization ?? realmConfig.monetization,
    entitlements: provided.entitlements ?? realmConfig.entitlements,
  };
  const billing = new BillingConductor(config);
  const conductor = new MonetizationConductor(config, billing);
  const jobs = new MonetizationJobs({ config, gateway: billing.gateway, connector, logger: fastify.log });
  const route = (method, url, handler, schema = {}, guard = identityGuard, extra = {}) => fastify.route({
    method, url, preHandler: guard, schema, handler, ...extra,
  });
  const limited = (max, timeWindow = '1 hour') => ({ config: { rateLimit: { max, timeWindow } } });
  const cardParams = params('cardId');

  // Stripe signs the exact request bytes, so this scope (and only this
  // scope) keeps JSON bodies as raw buffers. Stripe retries in bursts from a
  // few addresses, so the route has its own, higher rate limit.
  await fastify.register(async (webhook) => {
    webhook.removeContentTypeParser('application/json');
    webhook.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: WEBHOOK_BYTES }, (_request, body, done) => done(null, body));
    webhook.post('/billing/webhook', { bodyLimit: WEBHOOK_BYTES, ...limited(600, '1 minute') }, billing.webhook);
  });

  route('GET', '/billing', billing.overview);
  route('POST', '/billing/checkout', billing.checkout, {
    body: object({ product: { enum: ['premium', 'partner', 'points'] }, packId: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,31}$' } }, ['product']),
  }, identityGuard, limited(10));
  route('POST', '/billing/portal', billing.portal, {}, identityGuard, limited(20));

  route('GET', '/points', conductor.wallet);
  route('GET', '/points/ledger', conductor.ledger, { querystring: object(paging) });
  route('POST', '/points/spend', conductor.spend, {
    body: object({
      kind: { enum: SPEND_KINDS }, days: { type: 'integer', minimum: 1, maximum: 365 }, announcementId: uuid,
      placeId: { type: 'integer', minimum: 1, maximum: 2147483647 }, radiusKm: { type: 'integer', minimum: 1, maximum: 1000 },
    }, ['kind', 'days']),
  }, identityGuard, limited(30));

  route('GET', '/referrals', conductor.referrals);
  route('POST', '/referrals/claim', conductor.claimReferral, {
    body: object({ code: { type: 'string', minLength: 8, maxLength: 24 } }, ['code']),
  }, identityGuard, limited(10));

  route('GET', '/rewards/videos', conductor.rewardedVideos);
  route('POST', '/rewards/videos/:cardId/views', conductor.startView, { params: cardParams }, identityGuard, limited(40));
  route('POST', '/rewards/views/complete', conductor.completeView, {
    body: object({ token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } }, ['token']),
  }, identityGuard, limited(40));

  route('POST', '/sponsored/:cardId/click', conductor.click, { params: cardParams }, optionalIdentityGuard, limited(120, '15 minutes'));
  fastify.get('/sponsored/:cardId/video', { schema: { params: cardParams } }, conductor.video);

  route('GET', '/monetization/settings', conductor.settings);
  route('PUT', '/monetization/settings', conductor.saveSettings, { body: object({ hideSponsored: { type: 'boolean' } }, ['hideSponsored']) });

  route('GET', '/admin/monetization', conductor.adminOverview, {}, adminGuard);
  route('GET', '/admin/sponsored-cards', conductor.listCards, { querystring: object(paging) }, adminGuard);
  route('POST', '/admin/sponsored-cards', conductor.createCard, {
    body: object(card, ['sponsorName', 'title', 'body']),
  }, adminGuard, limited(60));
  route('PATCH', '/admin/sponsored-cards/:cardId', conductor.updateCard, {
    params: cardParams, body: { ...object(card), minProperties: 1 },
  }, adminGuard, limited(120));
  route('DELETE', '/admin/sponsored-cards/:cardId', conductor.deleteCard, { params: cardParams }, adminGuard);
  const videoBody = Math.ceil(config.monetization.sponsoredVideoBytes / 3) * 4 + 4096;
  route('POST', '/admin/sponsored-cards/:cardId/video', conductor.uploadVideo, {
    params: cardParams,
    body: object({ data: { type: 'string', minLength: 16, maxLength: videoBody }, mimeType: { enum: ['video/mp4', 'video/webm'] } }, ['data', 'mimeType']),
  }, adminGuard, { bodyLimit: videoBody, ...limited(20) });
  route('POST', '/admin/offers', conductor.broadcastOffer, {
    body: object({
      headline: text(120, 3), message: text(500, 3), audience: { enum: ['all', 'free', 'paid'] },
      link: { type: ['string', 'null'], maxLength: 200, pattern: '^#[a-z][a-z0-9-]*(\\?[^\\s]*)?$' },
    }, ['headline', 'message', 'audience']),
  }, adminGuard, limited(10));
  route('POST', '/admin/points/grants', conductor.grantPoints, {
    body: object({ email: text(255, 3), points: { type: 'integer', minimum: 1, maximum: 100000 }, note: text(200, 3) }, ['email', 'points', 'note']),
  }, adminGuard, limited(60));

  fastify.addHook('onListen', async () => { if (backgroundJobs) jobs.start(); });
  fastify.addHook('preClose', async () => { await jobs.stop(); });
}
