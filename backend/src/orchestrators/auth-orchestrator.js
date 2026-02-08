import { authenticationConductor } from '../conductors/authentication-conductor.js';
import rateLimit from '@fastify/rate-limit';

export async function authOrchestrator(fastify, options) {
  // Register rate limiting for auth routes
  await fastify.register(rateLimit, {
    max: 10,
    timeWindow: '15 minutes',
    cache: 10000, // Maximum number of unique clients (IPs) to track
    skipOnError: false
  });
  // Apply stricter rate limiting to registration endpoint
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

  // Apply stricter rate limiting to login endpoint
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

  fastify.get('/verify-email', async (request, reply) => {
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

  fastify.post('/logout', async (request, reply) => {
    return authenticationConductor.logout(request, reply);
  });
}
