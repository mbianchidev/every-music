import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { realmConfig, validateRealmConfig } from '../config/realm.js';
import { realmConnector } from './repositories/realm-connector.js';
import { mailDispatcher } from './engines/mail-dispatcher.js';
import { googleIdentityBridge } from './engines/google-identity-bridge.js';
import { authOrchestrator } from './orchestrators/auth-orchestrator.js';
import { profileOrchestrator } from './orchestrators/profile-orchestrator.js';
import { announcementOrchestrator } from './orchestrators/announcement-orchestrator.js';
import { catalogOrchestrator } from './orchestrators/catalog-orchestrator.js';

validateRealmConfig();

const nexus = Fastify({
  logger: {
    level: realmConfig.environment === 'production' ? 'info' : 'debug',
    transport: realmConfig.environment !== 'production' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
        colorize: true,
      },
    } : undefined,
  },
  requestIdHeader: 'x-nexus-request-id',
  disableRequestLogging: false,
  trustProxy: true,
});

await nexus.register(cors, {
  origin: realmConfig.boundaries.portalOrigin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-nexus-request-id'],
});

let requestCounter = 0;
nexus.addHook('onRequest', async (request, reply) => {
  requestCounter++;
  request.requestNumber = requestCounter;
});

nexus.addHook('onResponse', async (request, reply) => {
  const responseTime = reply.getResponseTime();
  request.log.info(
    `[${request.requestNumber}] ${request.method} ${request.url} - ${reply.statusCode} (${responseTime.toFixed(2)}ms)`
  );
});

nexus.setErrorHandler((error, request, reply) => {
  request.log.error(error);

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

  const statusCode = error.statusCode || 500;
  return reply.code(statusCode).send({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: realmConfig.environment === 'production' 
        ? 'An internal error occurred' 
        : error.message,
    },
  });
});

nexus.setNotFoundHandler((request, reply) => {
  return reply.code(404).send({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${request.method} ${request.url} does not exist`,
    },
  });
});

nexus.get('/pulse', async (request, reply) => {
  try {
    await realmConnector.execute('SELECT 1 AS heartbeat');

    return {
      status: 'alive',
      realm: 'connected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: realmConfig.environment,
    };
  } catch (err) {
    return reply.code(503).send({
      status: 'degraded',
      realm: 'disconnected',
      timestamp: new Date().toISOString(),
      error: err.message,
    });
  }
});

nexus.get('/nexus-info', async () => ({
  nexus: 'Every.music Orchestration Layer',
  version: '1.0.0',
  environment: realmConfig.environment,
  routes: {
    authentication: '/realm/auth/*',
    profiles: '/realm/profiles/*',
    announcements: '/realm/announcements/*',
    catalog: '/realm/catalog/*',
  },
  documentation: 'https://docs.everymusic.com/api',
}));

await nexus.register(authOrchestrator, { prefix: '/realm/auth' });
await nexus.register(profileOrchestrator, { prefix: '/realm/profiles' });
await nexus.register(announcementOrchestrator, { prefix: '/realm/announcements' });
await nexus.register(catalogOrchestrator, { prefix: '/realm/catalog' });

const initializeNexus = async () => {
  try {
    await realmConnector.establish();
    
    await mailDispatcher.initialize();
    
    googleIdentityBridge.initialize();

    await nexus.listen({
      port: realmConfig.nexus.port,
      host: realmConfig.nexus.host,
    });

    nexus.log.info(`✓ Nexus active on ${realmConfig.nexus.host}:${realmConfig.nexus.port}`);
    nexus.log.info(`✓ Environment: ${realmConfig.environment}`);
    nexus.log.info(`✓ CORS origin: ${realmConfig.boundaries.portalOrigin}`);
  } catch (err) {
    nexus.log.error('✗ Nexus initialization failed:', err);
    process.exit(1);
  }
};

const shutdownNexus = async (signal) => {
  nexus.log.info(`Received ${signal}, initiating graceful shutdown...`);
  
  try {
    await nexus.close();
    await realmConnector.disconnect();
    nexus.log.info('✓ Nexus shutdown complete');
    process.exit(0);
  } catch (err) {
    nexus.log.error('✗ Shutdown error:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdownNexus('SIGTERM'));
process.on('SIGINT', () => shutdownNexus('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  nexus.log.error('Unhandled rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  nexus.log.error('Uncaught exception:', err);
  process.exit(1);
});

initializeNexus();
