import { adminGuard, identityGuard } from '../guards/identity-guard.js';
import { administrationRepository } from '../repositories/administration-repository.js';
import { ok, pagination, pageOf } from '../conductors/response-helpers.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';

export async function administrationOrchestrator(fastify) {
  fastify.post('/reports', {
    preHandler: identityGuard,
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    schema: { body: object({
      reportedUserId: uuid, messageId: uuid, category: { enum: ['spam', 'harassment', 'threats', 'other'] },
      details: text(2000, 5), signedEvidence: text(32768), consent: { const: true },
    }, ['reportedUserId', 'category', 'details', 'consent']) },
  }, async (request, reply) => ok(reply, await administrationRepository.createReport(request.authenticatedUser.userId, request.body), 201));
  fastify.get('/reports/me', {
    preHandler: identityGuard, schema: { querystring: object(paging) },
  }, async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await administrationRepository.ownReports(request.authenticatedUser.userId, page), 'reports', page));
  });
  fastify.get('/admin/analytics', { preHandler: adminGuard }, async (request, reply) =>
    ok(reply, await administrationRepository.analytics(request.authenticatedUser.userId)));
  fastify.get('/admin/reports', {
    preHandler: adminGuard, schema: { querystring: object({ ...paging, status: { enum: ['', 'open', 'reviewed', 'actioned', 'dismissed'] } }) },
  }, async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await administrationRepository.reports(request.authenticatedUser.userId, page, request.query.status), 'reports', page));
  });
  fastify.get('/admin/reports/:reportId', {
    preHandler: adminGuard, schema: { params: params('reportId') },
  }, async (request, reply) => ok(reply, await administrationRepository.report(request.authenticatedUser.userId, request.params.reportId)));
  fastify.patch('/admin/reports/:reportId', {
    preHandler: adminGuard, schema: { params: params('reportId'), body: object({
      action: { enum: ['review', 'dismiss', 'remove_message', 'suspend_user'] }, note: text(2000, 5),
    }, ['action', 'note']) },
  }, async (request, reply) => ok(reply, await administrationRepository.resolve(request.authenticatedUser.userId, request.params.reportId, request.body)));
  fastify.get('/admin/audit', {
    preHandler: adminGuard, schema: { querystring: object(paging) },
  }, async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await administrationRepository.auditLog(request.authenticatedUser.userId, page), 'entries', page));
  });
}
