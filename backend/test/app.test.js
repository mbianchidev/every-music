import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNexus } from '../src/app.js';

const config = {
  environment: 'test',
  application: { version: 'test' },
  nexus: { trustProxy: false },
  boundaries: {
    uploadLimit: 1024 * 1024,
    portalOrigins: ['http://localhost:3000'],
    rateThreshold: 100,
    rateWindow: 60000,
  },
};

test('separates liveness from database readiness', async () => {
  const app = await buildNexus({
    config,
    logger: false,
    connector: {
      execute: async () => {
        throw new Error('database unavailable');
      },
    },
  });

  const live = await app.inject({ method: 'GET', url: '/health/live' });
  const ready = await app.inject({ method: 'GET', url: '/health/ready' });

  assert.equal(live.statusCode, 200);
  assert.equal(live.json().status, 'alive');
  assert.equal(ready.statusCode, 503);
  assert.equal(ready.json().status, 'not_ready');
  assert.equal(ready.headers['x-content-type-options'], 'nosniff');

  await app.close();
});
