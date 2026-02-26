import { authenticationConductor } from '../conductors/authentication-conductor.js';
import rateLimit from '@fastify/rate-limit';

export async function authOrchestrator(fastify, options) {
  // Register rate limiting plugin for per-route use via preHandler
  await fastify.register(rateLimit, {
    global: false,
    cache: 10000, // Maximum number of unique clients (IPs) to track
    skipOnError: false
  });

  fastify.post('/register', {
    preHandler: fastify.rateLimit({
      max: 3,
      timeWindow: '1 hour'
    })
  }, async (request, reply) => {
    return authenticationConductor.registerWithEmail(request, reply);
  });

  fastify.post('/login', {
    preHandler: fastify.rateLimit({
      max: 5,
      timeWindow: '15 minutes'
    })
  }, async (request, reply) => {
    return authenticationConductor.loginWithEmail(request, reply);
  });

  fastify.post('/login/google', {
    preHandler: fastify.rateLimit({
      max: 5,
      timeWindow: '15 minutes'
    })
  }, async (request, reply) => {
    return authenticationConductor.loginWithGoogle(request, reply);
  });

  fastify.get('/verify-email', {
    preHandler: fastify.rateLimit({
      max: 10,
      timeWindow: '15 minutes'
    })
  }, async (request, reply) => {
    return authenticationConductor.verifyEmail(request, reply);
  });

  fastify.post('/refresh-token', {
    preHandler: fastify.rateLimit({
      max: 10,
      timeWindow: '15 minutes'
    })
  }, async (request, reply) => {
    return authenticationConductor.refreshAccessToken(request, reply);
  });

  fastify.post('/password-reset/initiate', {
    preHandler: fastify.rateLimit({
      max: 3,
      timeWindow: '1 hour'
    })
  }, async (request, reply) => {
    return authenticationConductor.initiatePasswordReset(request, reply);
  });

  fastify.post('/password-reset/complete', {
    preHandler: fastify.rateLimit({
      max: 5,
      timeWindow: '1 hour'
    })
  }, async (request, reply) => {
    return authenticationConductor.completePasswordReset(request, reply);
  });

  fastify.post('/logout', {
    preHandler: fastify.rateLimit({
      max: 10,
      timeWindow: '15 minutes'
    })
  }, async (request, reply) => {
    return authenticationConductor.logout(request, reply);
  });
}
