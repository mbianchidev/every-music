import { musicianConductor } from '../conductors/musician-conductor.js';
import { identityGuard } from '../guards/identity-guard.js';

const uuidPattern = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export async function profileOrchestrator(fastify, options) {
  fastify.get('/me', {
    preHandler: identityGuard,
  }, async (request, reply) => {
    return musicianConductor.getMyProfile(request, reply);
  });

  fastify.put('/me', {
    preHandler: identityGuard,
  }, async (request, reply) => {
    return musicianConductor.updateMyProfile(request, reply);
  });

  fastify.get('/search', async (request, reply) => {
    return musicianConductor.searchProfiles(request, reply);
  });

  fastify.get('/:profileId', {
    schema: {
      params: {
        type: 'object',
        required: ['profileId'],
        properties: {
          profileId: { type: 'string', pattern: uuidPattern },
        },
      },
    },
  }, async (request, reply) => {
    return musicianConductor.getProfileById(request, reply);
  });

  fastify.post('/me/projects', {
    preHandler: identityGuard,
  }, async (request, reply) => {
    return musicianConductor.addProject(request, reply);
  });

  fastify.delete('/me/projects/:projectId', {
    preHandler: identityGuard,
    schema: {
      params: {
        type: 'object',
        required: ['projectId'],
        properties: {
          projectId: { type: 'string', pattern: uuidPattern },
        },
      },
    },
  }, async (request, reply) => {
    return musicianConductor.removeProject(request, reply);
  });
}
