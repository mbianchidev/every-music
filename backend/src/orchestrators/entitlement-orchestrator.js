import { adminGuard, identityGuard } from '../guards/identity-guard.js';
import { entitlementRepository } from '../repositories/entitlement-repository.js';
import { administrationRepository } from '../repositories/administration-repository.js';
import { publishEvent } from '../repositories/event-publisher.js';
import { ok } from '../conductors/response-helpers.js';
import { object, params } from '../validators/http-schemas.js';

export async function entitlementOrchestrator(fastify) {
  fastify.get('/entitlements/me', { preHandler: identityGuard }, async (request, reply) =>
    ok(reply, await entitlementRepository.limitsFor(request.authenticatedUser.userId)));

  fastify.get('/admin/users/:userId/entitlements', {
    preHandler: adminGuard, schema: { params: params('userId') },
  }, async (request, reply) => ok(reply, await administrationRepository.withAdmin(request.authenticatedUser.userId,
    executor => entitlementRepository.limitsFor(request.params.userId, executor))));

  fastify.post('/admin/users/:userId/entitlements', {
    preHandler: adminGuard,
    schema: {
      params: params('userId'),
      body: object({ plan: { enum: ['premium', 'partner'] }, days: { type: 'integer', minimum: 1, maximum: 3650 } }, ['plan']),
    },
  }, async (request, reply) => ok(reply, await administrationRepository.withAdmin(request.authenticatedUser.userId, async executor => {
    const entitlement = await entitlementRepository.grant(executor, {
      userId: request.params.userId, plan: request.body.plan, source: 'admin', days: request.body.days ?? null,
    });
    await administrationRepository.audit(executor, request.authenticatedUser.userId, 'entitlement_granted', request.params.userId);
    await publishEvent(executor, 'entitlements.changed', { userId: request.params.userId });
    return entitlement;
  }), 201));

  fastify.delete('/admin/entitlements/:entitlementId', {
    preHandler: adminGuard, schema: { params: params('entitlementId') },
  }, async (request, reply) => ok(reply, await administrationRepository.withAdmin(request.authenticatedUser.userId, async executor => {
    const revoked = await entitlementRepository.revoke(executor, request.params.entitlementId);
    await administrationRepository.audit(executor, request.authenticatedUser.userId, 'entitlement_revoked', revoked.userId);
    await publishEvent(executor, 'entitlements.changed', { userId: revoked.userId });
    return { id: revoked.id };
  })));
}
