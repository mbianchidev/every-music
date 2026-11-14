import { identityGuard } from '../guards/identity-guard.js';
import { messagingKeyRepository } from '../repositories/messaging-key-repository.js';
import { ok, pagination, pageOf } from '../conductors/response-helpers.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';

export async function encryptionOrchestrator(fastify) {
  const jwk = object({
    kty: { const: 'EC' }, crv: { const: 'P-256' }, x: text(43, 43), y: text(43, 43),
  }, ['kty', 'crv', 'x', 'y']);
  fastify.addHook('preHandler', identityGuard);
  fastify.get('/me', { schema: { querystring: object(paging) } }, async (request, reply) => {
    const page = pagination(request);
    return ok(reply, pageOf(await messagingKeyRepository.listOwn(request.authenticatedUser.userId, page), 'keys', page));
  });
  fastify.get('/me/:keyId', { schema: { params: params('keyId') } }, async (request, reply) =>
    ok(reply, await messagingKeyRepository.findOwn(request.params.keyId, request.authenticatedUser.userId)));
  fastify.get('/users/:userId', { schema: { params: params('userId') } }, async (request, reply) =>
    ok(reply, { key: await messagingKeyRepository.current(request.params.userId) }));
  fastify.post('/me', {
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    schema: { body: object({
      signingKey: jwk, encryptionKey: jwk, identityProof: text(8192), encryptedPrivateKey: text(16384), replaceKeyId: uuid,
    }, ['signingKey', 'encryptionKey', 'identityProof', 'encryptedPrivateKey']) },
  }, async (request, reply) => ok(reply, await messagingKeyRepository.publish(request.authenticatedUser.userId, request.body), 201));
}
