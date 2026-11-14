import { identityGuard } from '../guards/identity-guard.js';
import { realmConnector } from '../repositories/realm-connector.js';
import { ApplicationRepository } from '../repositories/application-repository.js';
import { ApplicationMaintenance } from '../engines/application-maintenance.js';
import {
  APPLICATION_LINK_TYPES, DEFAULT_RETENTION_DAYS, MAX_APPLICATION_INSTRUMENTS, MAX_APPLICATION_LINKS, OWNER_STATUSES,
} from '../engines/application-rules.js';
import { ok, pagination, pageOf } from '../conductors/response-helpers.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';

const applicationBody = object({
  message: text(4000),
  instrumentIds: { type: 'array', maxItems: MAX_APPLICATION_INSTRUMENTS, items: uuid },
  links: {
    type: 'array', maxItems: MAX_APPLICATION_LINKS,
    items: object({ linkType: { enum: APPLICATION_LINK_TYPES }, url: text(2048) }, ['url']),
  },
}, ['message']);

export async function applicationOrchestrator(fastify, { config = {}, connector = realmConnector, backgroundJobs = true } = {}) {
  const retentionDays = config.applications?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const repository = new ApplicationRepository(retentionDays);
  const userId = request => request.authenticatedUser.userId;

  fastify.post('/announcements/:announcementId/applications', {
    preHandler: identityGuard,
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    schema: { params: params('announcementId'), body: applicationBody },
  }, async (request, reply) => ok(reply, await repository.apply(userId(request), request.params.announcementId, request.body), 201));

  fastify.get('/announcements/:announcementId/applications/me', {
    preHandler: identityGuard, schema: { params: params('announcementId') },
  }, async (request, reply) => ok(reply, { application: await repository.mineFor(userId(request), request.params.announcementId) }));

  fastify.get('/applications/me', {
    preHandler: identityGuard, schema: { querystring: object(paging) },
  }, async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await repository.mine(userId(request), page), 'applications', page));
  });

  fastify.get('/applications/announcements', {
    preHandler: identityGuard, schema: { querystring: object(paging) },
  }, async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await repository.announcements(userId(request), page), 'announcements', page));
  });

  fastify.get('/applications/received', {
    preHandler: identityGuard,
    schema: { querystring: object({
      ...paging, announcementId: uuid, instrumentId: uuid, status: { enum: OWNER_STATUSES }, sort: { enum: ['newest', 'oldest'] },
    }) },
  }, async (request, reply) => {
    const page = pagination(request);
    const { announcementId, instrumentId, status, sort } = request.query;
    const result = await repository.received(userId(request), { announcementId, instrumentId, status, sort }, page);
    return ok(reply, { ...pageOf(result.rows, 'applications', page), counts: result.counts, announcement: result.announcement });
  });

  fastify.patch('/applications/:applicationId', {
    preHandler: identityGuard,
    schema: {
      params: params('applicationId'),
      body: { ...object({ status: { enum: OWNER_STATUSES }, ownerNote: text(2000, 0) }), minProperties: 1 },
    },
  }, async (request, reply) => ok(reply, await repository.update(userId(request), request.params.applicationId, request.body)));

  fastify.delete('/applications/:applicationId', {
    preHandler: identityGuard, schema: { params: params('applicationId') },
  }, async (request, reply) => ok(reply, await repository.withdraw(userId(request), request.params.applicationId)));

  if (backgroundJobs) {
    const maintenance = new ApplicationMaintenance({ connector, retentionDays, logger: fastify.log });
    fastify.addHook('onListen', async () => maintenance.start());
    fastify.addHook('preClose', async () => maintenance.stop());
  }
}
