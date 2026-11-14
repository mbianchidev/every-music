import test from 'node:test';
import assert from 'node:assert/strict';
import { readEvents } from '../src/lib/realtime.js';

test('fragmented and coalesced event frames ignore heartbeats and preserve UTF-8 data', async () => {
  const encoder = new TextEncoder();
  const payload = encoder.encode(': heartbeat\n\ndata: {"type":"profiles.changed","id":"synthetic-\u00f8"}\n\ndata: {"type":"connected"}\n\n');
  const unicodeStart = payload.findIndex(byte => byte === 0xc3);
  const body = new ReadableStream({
    start(stream) {
      stream.enqueue(payload.slice(0, unicodeStart + 1));
      stream.enqueue(payload.slice(unicodeStart + 1, unicodeStart + 3));
      stream.enqueue(payload.slice(unicodeStart + 3));
      stream.close();
    },
  });
  const events = [];
  await readEvents(body, event => events.push(event), new AbortController().signal);
  assert.deepEqual(events, [
    { type: 'profiles.changed', id: 'synthetic-\u00f8' }, { type: 'connected' },
  ]);
});

test('a stalled event stream is cancelled so the client can reconnect', { timeout: 2000 }, async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(readEvents(body, () => {}, new AbortController().signal, 5), /timed out/);
  assert.equal(cancelled, true);
});
