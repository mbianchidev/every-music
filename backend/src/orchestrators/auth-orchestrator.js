import { authenticationConductor } from '../conductors/authentication-conductor.js';

export async function authOrchestrator(fastify, options) {
  fastify.post('/register', async (request, reply) => {
    return authenticationConductor.registerWithEmail(request, reply);
  });

  fastify.post('/login', async (request, reply) => {
    return authenticationConductor.loginWithEmail(request, reply);
  });

  fastify.post('/login/google', async (request, reply) => {
    return authenticationConductor.loginWithGoogle(request, reply);
  });

  fastify.get('/verify-email', async (request, reply) => {
    return authenticationConductor.verifyEmail(request, reply);
  });

  fastify.post('/refresh-token', async (request, reply) => {
    return authenticationConductor.refreshAccessToken(request, reply);
  });

  fastify.post('/password-reset/initiate', async (request, reply) => {
    return authenticationConductor.initiatePasswordReset(request, reply);
  });

  fastify.post('/password-reset/complete', async (request, reply) => {
    return authenticationConductor.completePasswordReset(request, reply);
  });

  fastify.post('/logout', async (request, reply) => {
    return authenticationConductor.logout(request, reply);
  });
}
