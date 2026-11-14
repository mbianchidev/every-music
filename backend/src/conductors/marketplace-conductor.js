import { marketplaceRepository } from '../repositories/marketplace-repository.js';
import { MARKETPLACE_TABS, catalogView, listingStatus, isCurrency } from '../engines/marketplace-catalog.js';
import { requestError } from '../engines/request-error.js';
import { ok, pagination, pageOf } from './response-helpers.js';

const DEFAULTS = { listingDays: 60, expiryReminderDays: 3 };

export function searchFilters(query) {
  const filters = {
    tab: query.tab || undefined, type: query.type || undefined, category: query.category || undefined,
    subcategory: query.subcategory || undefined, condition: query.condition || undefined,
    currency: query.currency || undefined, q: query.q?.trim() || undefined, location: query.location?.trim() || undefined,
    remote: query.remote === 'true', shipping: query.shipping === 'true',
    instrumentId: query.instrumentId?.toLowerCase() || undefined, genreId: query.genreId?.toLowerCase() || undefined,
    sort: query.sort || 'newest',
    priceMin: query.priceMin ? Number(query.priceMin) : undefined,
    priceMax: query.priceMax ? Number(query.priceMax) : undefined,
  };
  if (filters.tab && filters.type && !MARKETPLACE_TABS[filters.tab].includes(filters.type)) {
    throw requestError(400, 'VALIDATION_ERROR', 'The listing type does not belong to the selected tab');
  }
  if (filters.currency && !isCurrency(filters.currency)) throw requestError(400, 'VALIDATION_ERROR', 'Choose a valid ISO 4217 currency code');
  if ((filters.priceMin !== undefined || filters.priceMax !== undefined) && !filters.currency) {
    throw requestError(400, 'VALIDATION_ERROR', 'Choose a currency for the price range');
  }
  if (filters.priceMin !== undefined && filters.priceMax !== undefined && filters.priceMin > filters.priceMax) {
    throw requestError(400, 'VALIDATION_ERROR', 'The minimum price cannot exceed the maximum price');
  }
  return filters;
}

export class MarketplaceConductor {
  constructor(config = {}) {
    this.config = { ...DEFAULTS, ...config };
  }

  catalog = async (_request, reply) => reply.header('Cache-Control', 'public, max-age=3600')
    .send({ success: true, data: catalogView(this.config) });

  search = async (request, reply) => {
    const page = pagination(request);
    const rows = await marketplaceRepository.search(searchFilters(request.query), page, request.authenticatedUser?.userId ?? null);
    return ok(reply, pageOf(rows, 'listings', page));
  };

  mine = async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await marketplaceRepository.mine(request.authenticatedUser.userId, page), 'listings', page));
  };

  saved = async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await marketplaceRepository.saved(request.authenticatedUser.userId, page), 'listings', page));
  };

  detail = async (request, reply) => ok(reply, await marketplaceRepository.detail(
    request.params.listingId.toLowerCase(), request.authenticatedUser?.userId ?? null, request.authenticatedUser?.role === 'admin',
  ));

  create = async (request, reply) => ok(reply,
    await marketplaceRepository.create(request.authenticatedUser.userId, request.body, this.config), 201);

  update = async (request, reply) => {
    if (request.body.status !== undefined) listingStatus(request.body.status);
    return ok(reply, await marketplaceRepository.update(request.authenticatedUser.userId, request.params.listingId.toLowerCase(), request.body));
  };

  renew = async (request, reply) => ok(reply,
    await marketplaceRepository.renew(request.authenticatedUser.userId, request.params.listingId.toLowerCase(), this.config));

  remove = async (request, reply) => ok(reply,
    await marketplaceRepository.remove(request.authenticatedUser.userId, request.params.listingId.toLowerCase()));

  save = async (request, reply) => ok(reply, await marketplaceRepository.save(
    request.authenticatedUser.userId, request.params.listingId.toLowerCase(), request.method === 'POST',
  ));

  report = async (request, reply) => ok(reply,
    await marketplaceRepository.report(request.authenticatedUser.userId, request.params.listingId.toLowerCase(), request.body), 201);

  moderationQueue = async (request, reply) => {
    const page = pagination(request);
    const rows = await marketplaceRepository.moderationQueue(request.authenticatedUser.userId, page, request.query.status);
    return ok(reply, pageOf(rows, 'reports', page));
  };

  moderate = async (request, reply) => ok(reply,
    await marketplaceRepository.moderate(request.authenticatedUser.userId, request.params.listingId.toLowerCase(), request.body.note));
}
