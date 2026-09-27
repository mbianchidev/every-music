import { pathToFileURL } from 'node:url';
import { realmConfig, validateRealmConfig } from '../config/realm.js';
import { buildNexus } from './app.js';
import { realmConnector } from './repositories/realm-connector.js';
import { mailDispatcher } from './engines/mail-dispatcher.js';
import { googleIdentityBridge } from './engines/google-identity-bridge.js';

export async function startNexus() {
  validateRealmConfig();

  const nexus = await buildNexus();

  try {
    await realmConnector.establish(nexus.log);
    await mailDispatcher.initialize(nexus.log);
    googleIdentityBridge.initialize(nexus.log);

    await nexus.listen({
      port: realmConfig.nexus.port,
      host: realmConfig.nexus.host,
    });

    nexus.log.info({
      host: realmConfig.nexus.host,
      port: realmConfig.nexus.port,
      environment: realmConfig.environment,
      origins: realmConfig.boundaries.portalOrigins,
    }, 'Nexus started');
  } catch (error) {
    nexus.log.fatal({ err: error }, 'Nexus initialization failed');
    await realmConnector.disconnect();
    throw error;
  }

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    nexus.log.info({ signal }, 'Graceful shutdown started');

    try {
      await nexus.close();
      await realmConnector.disconnect();
      nexus.log.info('Graceful shutdown complete');
      process.exitCode = 0;
    } catch (error) {
      nexus.log.error({ err: error }, 'Graceful shutdown failed');
      process.exitCode = 1;
    }
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    nexus.log.fatal({ err: reason }, 'Unhandled promise rejection');
  });

  process.on('uncaughtException', (error) => {
    nexus.log.fatal({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });

  return nexus;
}

const isEntrypoint = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isEntrypoint) {
  startNexus().catch(() => {
    process.exitCode = 1;
  });
}
