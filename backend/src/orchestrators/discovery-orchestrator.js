import { identityGuard } from '../guards/identity-guard.js';
import { ok, pagination, pageOf } from '../conductors/response-helpers.js';
import { normalizeSavedFilters } from '../conductors/discovery-conductor.js';
import { savedSearchRepository } from '../repositories/saved-search-repository.js';
import { socialRepository } from '../repositories/social-repository.js';
import { quotaRepository } from '../repositories/quota-repository.js';
import { entitlementRepository } from '../repositories/entitlement-repository.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';

const filters = object({
  searchTerm: text(200, 0), city: text(255, 0), instrumentId: uuid, genreId: uuid,
  isRemote: { type: 'boolean' }, isCoverBand: { type: 'boolean' },
  placeId: { type: 'integer', minimum: 1, maximum: 2147483647 },
  latitude: { type: 'number', minimum: -90, maximum: 90 },
  longitude: { type: 'number', minimum: -180, maximum: 180 },
  radiusKm: { type: 'integer', minimum: 1, maximum: 1000 },
  country: { type: 'string', pattern: '^[A-Za-z]{2}$' },
  region: { type: 'string', pattern: '^[A-Za-z0-9]{1,20}$' },
});
const name = { type: 'string', minLength: 1, maxLength: 100, pattern: '\\S' };
const writeLimit = (max) => ({ rateLimit: { max, timeWindow: '1 hour' } });

// Saved searches, profile blocks, consented profile visits and plan quotas.
export async function discoveryOrchestrator(fastify) {
  const route = (method, url, handler, schema = {}, config = {}) => fastify.route({
    method, url, preHandler: identityGuard, schema, config, handler,
  });
  const me = request => request.authenticatedUser.userId;

  route('GET', '/quotas', async (request, reply) => ok(reply, await quotaRepository.summary(me(request))));

  route('GET', '/saved-searches', async (request, reply) => ok(reply, { searches: await savedSearchRepository.list(me(request)) }));
  route('POST', '/saved-searches', async (request, reply) => ok(reply, await savedSearchRepository.create(me(request), {
    name: request.body.name.trim(), filters: await normalizeSavedFilters(request.body.filters), notify: request.body.notify,
  }), 201), { body: object({ name, filters, notify: { type: 'boolean' } }, ['name', 'filters']) }, writeLimit(30));
  route('PATCH', '/saved-searches/:searchId', async (request, reply) => ok(reply, await savedSearchRepository.update(me(request), request.params.searchId, {
    name: request.body.name?.trim(), notify: request.body.notify,
    filters: request.body.filters ? await normalizeSavedFilters(request.body.filters) : undefined,
  })), { params: params('searchId'), body: object({ name, filters, notify: { type: 'boolean' } }) }, writeLimit(120));
  route('DELETE', '/saved-searches/:searchId', async (request, reply) => {
    await savedSearchRepository.remove(me(request), request.params.searchId);
    return ok(reply, { id: request.params.searchId });
  }, { params: params('searchId') });

  route('POST', '/profiles/:profileId/block', async (request, reply) =>
    ok(reply, await socialRepository.block(me(request), request.params.profileId)), { params: params('profileId') }, writeLimit(60));
  route('DELETE', '/profiles/:profileId/block', async (request, reply) =>
    ok(reply, await socialRepository.unblock(me(request), request.params.profileId)), { params: params('profileId') }, writeLimit(60));
  route('GET', '/blocks', async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await socialRepository.blocked(me(request), page), 'blocked', page));
  }, { querystring: object(paging) });

  route('GET', '/profile-visits/sharing', async (request, reply) => ok(reply, await socialRepository.visitSharing(me(request))));
  route('PUT', '/profile-visits/sharing', async (request, reply) =>
    ok(reply, await socialRepository.setVisitSharing(me(request), request.body.share)),
  { body: object({ share: { type: 'boolean' } }, ['share']) });
  route('GET', '/profile-visits', async (request, reply) => {
    await entitlementRepository.requireLimit(me(request), 'profileVisits', 0);
    const page = pagination(request);
    return ok(reply, pageOf(await socialRepository.visits(me(request), page), 'visits', page));
  }, { querystring: object(paging) });
}
