import { musicianConductor } from '../conductors/musician-conductor.js';
import { identityGuard } from '../guards/identity-guard.js';

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

  fastify.get('/:profileId', async (request, reply) => {
    return musicianConductor.getProfileById(request, reply);
  });

  fastify.post('/me/projects', {
    preHandler: identityGuard,
  }, async (request, reply) => {
    return musicianConductor.addProject(request, reply);
  });

  fastify.delete('/me/projects/:projectId', {
    preHandler: identityGuard,
  }, async (request, reply) => {
    return musicianConductor.removeProject(request, reply);
  });
}
