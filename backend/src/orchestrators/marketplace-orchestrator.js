import { MarketplaceConductor } from '../conductors/marketplace-conductor.js';
import { MarketplaceExpiryJob } from '../engines/marketplace-expiry-job.js';
import { adminGuard, identityGuard, optionalIdentityGuard } from '../guards/identity-guard.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';
import { realmConnector } from '../repositories/realm-connector.js';
import {
  CONDITIONS, LISTING_STATUSES, LISTING_TYPES, MARKETPLACE_TABS, MAX_LISTING_PHOTOS, MAX_LISTING_TAGS, MAX_PRICE_MINOR,
  PRICE_MODES, RATE_UNITS, SORTS,
} from '../engines/marketplace-catalog.js';

const key = { type: 'string', pattern: '^[a-z][a-z0-9_]{1,47}$' };
const nullable = schema => ({ ...schema, type: [schema.type, 'null'] });
const tags = { type: 'array', maxItems: MAX_LISTING_TAGS, uniqueItems: true, items: uuid };
const listing = {
  type: { enum: LISTING_TYPES },
  category: key,
  subcategory: nullable(key),
  title: text(120, 3),
  description: text(5000, 10),
  condition: { enum: [...CONDITIONS, null] },
  priceMode: { enum: PRICE_MODES },
  priceMinor: { type: ['integer', 'null'], minimum: 0, maximum: MAX_PRICE_MINOR },
  currency: { type: ['string', 'null'], pattern: '^[A-Z]{3}$' },
  rateUnit: { enum: [...RATE_UNITS, null] },
  locationText: { type: ['string', 'null'], maxLength: 160 },
  latitude: { type: ['number', 'null'], minimum: -90, maximum: 90 },
  longitude: { type: ['number', 'null'], minimum: -180, maximum: 180 },
  remote: { type: 'boolean' },
  shipping: { type: 'boolean' },
  photos: {
    type: 'array', maxItems: MAX_LISTING_PHOTOS, uniqueItems: true,
    items: { type: 'string', pattern: '^/realm/media/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' },
  },
  instrumentIds: tags,
  genreIds: tags,
};
const search = object({
  ...paging,
  tab: { enum: ['', ...Object.keys(MARKETPLACE_TABS)] },
  type: { enum: ['', ...LISTING_TYPES] },
  category: { anyOf: [{ const: '' }, key] },
  subcategory: { anyOf: [{ const: '' }, key] },
  condition: { enum: ['', ...CONDITIONS] },
  currency: { type: 'string', pattern: '^([A-Z]{3})?$' },
  priceMin: { type: 'string', pattern: '^(\\d{1,12})?$' },
  priceMax: { type: 'string', pattern: '^(\\d{1,12})?$' },
  q: text(200, 0),
  location: text(160, 0),
  remote: { enum: ['', 'true', 'false'] },
  shipping: { enum: ['', 'true', 'false'] },
  instrumentId: { anyOf: [{ const: '' }, uuid] },
  genreId: { anyOf: [{ const: '' }, uuid] },
  sort: { enum: ['', ...SORTS] },
});
const listingParams = params('listingId');

export async function marketplaceOrchestrator(fastify, { config = {}, connector = realmConnector, backgroundJobs = true }) {
  const settings = config.marketplace ?? {};
  const conductor = new MarketplaceConductor(settings);
  const job = new MarketplaceExpiryJob({ config: conductor.config, connector, logger: fastify.log });
  const route = (method, url, handler, schema = {}, guard = identityGuard, extra = {}) => fastify.route({
    method, url, preHandler: guard, schema, handler, ...extra,
  });
  const limited = (max, timeWindow = '1 hour') => ({ config: { rateLimit: { max, timeWindow } } });

  fastify.get('/marketplace/catalog', conductor.catalog);
  route('GET', '/marketplace/listings', conductor.search, { querystring: search }, optionalIdentityGuard);
  route('POST', '/marketplace/listings', conductor.create, {
    body: object(listing, ['type', 'category', 'title', 'description', 'priceMode']),
  }, identityGuard, limited(30));
  route('GET', '/marketplace/listings/mine', conductor.mine, { querystring: object(paging) });
  route('GET', '/marketplace/listings/saved', conductor.saved, { querystring: object(paging) });
  route('GET', '/marketplace/listings/:listingId', conductor.detail, { params: listingParams }, optionalIdentityGuard);
  route('PATCH', '/marketplace/listings/:listingId', conductor.update, {
    params: listingParams, body: { ...object({ ...listing, status: { enum: LISTING_STATUSES } }), minProperties: 1 },
  }, identityGuard, limited(120));
  route('POST', '/marketplace/listings/:listingId/renew', conductor.renew, { params: listingParams }, identityGuard, limited(60));
  route('DELETE', '/marketplace/listings/:listingId', conductor.remove, { params: listingParams });
  route(['POST', 'DELETE'], '/marketplace/listings/:listingId/save', conductor.save, { params: listingParams });
  route('POST', '/marketplace/listings/:listingId/reports', conductor.report, {
    params: listingParams,
    body: object({
      category: { enum: ['spam', 'harassment', 'threats', 'other'] }, details: text(2000, 5), consent: { const: true },
    }, ['category', 'details', 'consent']),
  }, identityGuard, limited(20));
  route('GET', '/admin/marketplace/reports', conductor.moderationQueue, {
    querystring: object({ ...paging, status: { enum: ['', 'open', 'reviewed', 'actioned', 'dismissed'] } }),
  }, adminGuard);
  route('DELETE', '/admin/marketplace/listings/:listingId', conductor.moderate, {
    params: listingParams, body: object({ note: text(2000, 5) }, ['note']),
  }, adminGuard);

  fastify.addHook('onListen', async () => { if (backgroundJobs) job.start(); });
  fastify.addHook('preClose', async () => { await job.stop(); });
}
