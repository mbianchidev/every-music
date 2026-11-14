import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNexus } from '../src/app.js';
import { requestError } from '../src/engines/request-error.js';

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

test('preserves intentional service errors while masking unexpected production details', async t => {
  const app = await buildNexus({ config: { ...config, environment: 'production' }, logger: false });
  t.after(() => app.close());
  app.get('/disabled-provider', async () => { throw requestError(503, 'PUSH_NOT_CONFIGURED', 'Browser push is not configured'); });
  app.get('/connection-limit', async () => { throw requestError(429, 'EVENT_CONNECTION_LIMIT', 'Close another tab and retry'); });
  app.get('/unexpected-failure', async () => { throw new Error('Synthetic internal database detail'); });
  const disabled = await app.inject('/disabled-provider');
  assert.equal(disabled.statusCode, 503);
  assert.equal(disabled.json().error.code, 'PUSH_NOT_CONFIGURED');
  assert.equal(disabled.json().error.message, 'Browser push is not configured');
  const limited = await app.inject('/connection-limit');
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.json().error.message, 'Close another tab and retry');
  const unexpected = await app.inject('/unexpected-failure');
  assert.equal(unexpected.statusCode, 500);
  assert.equal(unexpected.json().error.message, 'An internal error occurred');
  assert.equal(unexpected.body.includes('Synthetic internal'), false);
});
