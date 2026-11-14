import test from 'node:test';
import assert from 'node:assert/strict';
import { finished } from 'node:stream/promises';
import { RealtimeHub } from '../src/engines/realtime-hub.js';

test('permission invalidation closes a stream before subsequent targeted events can write to it', async t => {
  let emit;
  const hub = new RealtimeHub({ listen: async (_channel, onEvent) => { emit = onEvent; return async () => {}; } }, console);
  t.after(() => hub.close());
  const stream = await hub.subscribe({ userId: 'synthetic-user', expiresAt: Math.floor(Date.now() / 1000) + 60 });
  let output = '';
  stream.on('data', chunk => { output += chunk; });
  const complete = finished(stream);
  emit({ type: 'account.changed', userId: 'synthetic-user' });
  emit({ type: 'admin.changed', userId: 'synthetic-user' });
  await complete;
  assert.match(output, /account.changed/);
  assert.doesNotMatch(output, /admin.changed/);
});
