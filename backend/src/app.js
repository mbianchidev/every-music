import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { realmConfig } from '../config/realm.js';
import { realmConnector } from './repositories/realm-connector.js';
import { authOrchestrator } from './orchestrators/auth-orchestrator.js';
import { profileOrchestrator } from './orchestrators/profile-orchestrator.js';
import { announcementOrchestrator } from './orchestrators/announcement-orchestrator.js';
import { catalogOrchestrator } from './orchestrators/catalog-orchestrator.js';

function applySecurityHeaders(reply) {
  reply
    .header('X-Content-Type-Options', 'nosniff')
    .header('X-Frame-Options', 'DENY')
    .header('Referrer-Policy', 'no-referrer')
    .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    .header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
}

export async function buildNexus({
  config = realmConfig,
  connector = realmConnector,
  logger,
} = {}) {
  const nexus = Fastify({
    logger: logger ?? {
      level: config.environment === 'production' ? 'info' : 'debug',
      transport: config.environment !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
              colorize: true,
            },
          }
        : undefined,
    },
    requestIdHeader: 'x-nexus-request-id',
    bodyLimit: config.boundaries.uploadLimit,
    trustProxy: config.nexus.trustProxy,
  });

  await nexus.register(cors, {
    origin: config.boundaries.portalOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-nexus-request-id'],
  });

  await nexus.register(rateLimit, {
    max: config.boundaries.rateThreshold,
    timeWindow: config.boundaries.rateWindow,
    cache: 10000,
    skipOnError: false,
  });

  nexus.addHook('onSend', async (_request, reply, payload) => {
    applySecurityHeaders(reply);
    return payload;
  });

  nexus.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Request failed');

    if (error.validation) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: error.validation,
        },
      });
    }

    if (error.statusCode === 429) {
      return reply.code(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests, please slow down',
        },
      });
    }

    const statusCode = error.statusCode && error.statusCode < 500 ? error.statusCode : 500;
    return reply.code(statusCode).send({
      success: false,
      error: {
        code: statusCode === 500 ? 'INTERNAL_ERROR' : error.code || 'REQUEST_FAILED',
        message: statusCode === 500 && config.environment === 'production'
          ? 'An internal error occurred'
          : error.message,
      },
    });
  });

  nexus.setNotFoundHandler((request, reply) => reply.code(404).send({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${request.method} ${request.url} does not exist`,
    },
  }));

  nexus.get('/health/live', async () => ({
    status: 'alive',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  const readinessHandler = async (request, reply) => {
    try {
      await connector.execute('SELECT 1 AS heartbeat');
      return {
        status: 'ready',
        dependencies: { database: 'connected' },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      request.log.error({ err: error }, 'Readiness check failed');
      return reply.code(503).send({
        status: 'not_ready',
        dependencies: { database: 'disconnected' },
        timestamp: new Date().toISOString(),
      });
    }
  };

  nexus.get('/health/ready', readinessHandler);
  nexus.get('/pulse', readinessHandler);

  nexus.get('/nexus-info', async () => ({
    nexus: 'Every.music API',
    version: config.application.version,
    environment: config.environment,
  }));

  await nexus.register(authOrchestrator, { prefix: '/realm/auth' });
  await nexus.register(profileOrchestrator, { prefix: '/realm/profiles' });
  await nexus.register(announcementOrchestrator, { prefix: '/realm/announcements' });
  await nexus.register(catalogOrchestrator, { prefix: '/realm/catalog' });

  return nexus;
}
