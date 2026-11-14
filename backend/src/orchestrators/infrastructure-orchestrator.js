import { InfrastructureConductor } from '../conductors/infrastructure-conductor.js';
import { identityGuard } from '../guards/identity-guard.js';
import { text, object, params } from '../validators/http-schemas.js';
import { NATIVE_PUSH_PLATFORMS } from '../engines/native-push.js';
import { DEFAULT_ATTACHMENT_BYTES } from '../../config/infrastructure.js';

export async function infrastructureOrchestrator(fastify, { config }) {
  const conductor = new InfrastructureConductor(config);
  const attachmentLimit = config.attachmentLimit ?? DEFAULT_ATTACHMENT_BYTES;
  const device = object({ platform: { enum: NATIVE_PUSH_PLATFORMS }, token: text(4096) }, ['platform', 'token']);

  // Encrypted attachment bytes are opaque to the server; this parser is scoped
  // to this plugin so no other route accepts raw bodies.
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: attachmentLimit },
    (_request, body, done) => done(null, body));

  fastify.post('/media/blobs', {
    onRequest: identityGuard,
    bodyLimit: attachmentLimit,
    config: { rateLimit: { max: 60, timeWindow: '15 minutes' } },
  }, conductor.uploadBlob);

  fastify.get('/push/devices', { preHandler: identityGuard }, conductor.listDevices);
  fastify.post('/push/devices', {
    preHandler: identityGuard,
    schema: { body: device },
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, conductor.registerDevice);
  fastify.delete('/push/devices', { preHandler: identityGuard, schema: { body: device } }, conductor.unregisterDevice);
  fastify.delete('/push/devices/:deviceId', {
    preHandler: identityGuard, schema: { params: params('deviceId') },
  }, conductor.removeDevice);
}
