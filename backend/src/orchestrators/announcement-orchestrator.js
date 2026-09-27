import { opportunityConductor } from '../conductors/opportunity-conductor.js';
import { identityGuard, optionalIdentityGuard } from '../guards/identity-guard.js';

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const announcementParamsSchema = {
  type: 'object',
  required: ['announcementId'],
  properties: {
    announcementId: { type: 'string', pattern: uuidPattern },
  },
};

export async function announcementOrchestrator(fastify, options) {
  fastify.post('/', {
    preHandler: identityGuard,
  }, async (request, reply) => {
    return opportunityConductor.createAnnouncement(request, reply);
  });

  fastify.get('/me', {
    preHandler: identityGuard,
  }, async (request, reply) => {
    return opportunityConductor.getMyAnnouncements(request, reply);
  });

  fastify.get('/search', {
    preHandler: optionalIdentityGuard,
  }, async (request, reply) => {
    return opportunityConductor.searchAnnouncements(request, reply);
  });

  fastify.get('/saved', {
    preHandler: identityGuard,
  }, async (request, reply) => {
    return opportunityConductor.getSavedAnnouncements(request, reply);
  });

  fastify.get('/:announcementId', {
    preHandler: optionalIdentityGuard,
    schema: { params: announcementParamsSchema },
  }, async (request, reply) => {
    return opportunityConductor.getAnnouncementById(request, reply);
  });

  fastify.put('/:announcementId', {
    preHandler: identityGuard,
    schema: { params: announcementParamsSchema },
  }, async (request, reply) => {
    return opportunityConductor.updateAnnouncement(request, reply);
  });

  fastify.delete('/:announcementId', {
    preHandler: identityGuard,
    schema: { params: announcementParamsSchema },
  }, async (request, reply) => {
    return opportunityConductor.deleteAnnouncement(request, reply);
  });

  fastify.post('/:announcementId/react', {
    preHandler: identityGuard,
    schema: { params: announcementParamsSchema },
  }, async (request, reply) => {
    return opportunityConductor.reactToAnnouncement(request, reply);
  });

  fastify.post('/:announcementId/save', {
    preHandler: identityGuard,
    schema: { params: announcementParamsSchema },
  }, async (request, reply) => {
    return opportunityConductor.saveAnnouncement(request, reply);
  });

  fastify.delete('/:announcementId/save', {
    preHandler: identityGuard,
    schema: { params: announcementParamsSchema },
  }, async (request, reply) => {
    return opportunityConductor.unsaveAnnouncement(request, reply);
  });
}
