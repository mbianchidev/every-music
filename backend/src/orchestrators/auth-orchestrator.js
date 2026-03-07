import { authenticationConductor } from '../conductors/authentication-conductor.js';

export async function authOrchestrator(fastify, options) {
  fastify.post('/register', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour'
      }
    }
  }, async (request, reply) => {
    return authenticationConductor.registerWithEmail(request, reply);
  });

  fastify.post('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes'
      }
    }
  }, async (request, reply) => {
    return authenticationConductor.loginWithEmail(request, reply);
  });

  fastify.post('/login/google', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes'
      }
    }
  }, async (request, reply) => {
    return authenticationConductor.loginWithGoogle(request, reply);
  });

  fastify.get('/verify-email', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes'
      }
    }
  }, async (request, reply) => {
    return authenticationConductor.verifyEmail(request, reply);
  });

  fastify.post('/refresh-token', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes'
      }
    }
  }, async (request, reply) => {
    return authenticationConductor.refreshAccessToken(request, reply);
  });

  fastify.post('/password-reset/initiate', {
    config: {
      rateLimit: {
        max: 3,
        timeWindow: '1 hour'
      }
    }
  }, async (request, reply) => {
    return authenticationConductor.initiatePasswordReset(request, reply);
  });

  fastify.post('/password-reset/complete', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '1 hour'
      }
    }
  }, async (request, reply) => {
    return authenticationConductor.completePasswordReset(request, reply);
  });

  fastify.post('/logout', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes'
      }
    }
  }, async (request, reply) => {
    return authenticationConductor.logout(request, reply);
  });
}
