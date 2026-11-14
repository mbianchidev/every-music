import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { MediaStorage, S3ObjectStore } from '../src/engines/media-storage.js';
import { forEachMedia } from '../src/repositories/media-repository.js';

const settings = {
  region: 'eu-west-1', bucket: 'everymusic-media', accessKeyId: 'synthetic-access', secretAccessKey: 'synthetic-secret',
};

function recorder(responses) {
  const requests = [];
  const fetch = async (request) => {
    requests.push({ method: request.method, url: request.url, headers: Object.fromEntries(request.headers), body: request.body ? Buffer.from(await request.arrayBuffer()) : null });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { requests, fetch };
}

test('object URLs support virtual-hosted AWS buckets and path-style compatible endpoints', () => {
  assert.equal(new S3ObjectStore(settings).url('media/a b'), 'https://everymusic-media.s3.eu-west-1.amazonaws.com/media/a%20b');
  const compatible = new S3ObjectStore({ ...settings, endpoint: 'http://object-store:8333', forcePathStyle: true });
  assert.equal(compatible.url('media/1'), 'http://object-store:8333/everymusic-media/media/1');
  assert.equal(compatible.url(), 'http://object-store:8333/everymusic-media');
});

test('uploads are signed with a payload hash and retried once after a provider error', async () => {
  const { requests, fetch } = recorder([new Response(null, { status: 503 }), new Response(null, { status: 200 })]);
  const store = new S3ObjectStore(settings, { fetch, retryDelayMs: 0 });
  await store.put('media/1', Buffer.from('synthetic bytes'), 'image/webp');
  assert.equal(requests.length, 2);
  const [, upload] = requests;
  assert.equal(upload.method, 'PUT');
  assert.equal(upload.headers['content-type'], 'image/webp');
  assert.equal(upload.headers['x-amz-content-sha256'], createHash('sha256').update('synthetic bytes').digest('hex'));
  assert.match(upload.headers.authorization,
    /^AWS4-HMAC-SHA256 Credential=synthetic-access\/\d{8}\/eu-west-1\/s3\/aws4_request, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
  assert.deepEqual(upload.body, Buffer.from('synthetic bytes'));
});

test('downloads stream bytes, report missing objects, and deletions tolerate absent keys', async () => {
  const { fetch } = recorder([
    new Response('stored bytes', { status: 200 }),
    new Response(null, { status: 404 }),
    new Response(null, { status: 404 }),
    new Response(null, { status: 403 }),
  ]);
  const store = new S3ObjectStore(settings, { fetch, retryDelayMs: 0 });
  const stream = await store.get('media/1');
  assert.ok(stream instanceof Readable);
  assert.equal(Buffer.concat(await stream.toArray()).toString(), 'stored bytes');
  assert.equal(await store.get('media/missing'), null);
  await store.remove('media/missing');
  await assert.rejects(store.remove('media/forbidden'), error => error.statusCode === 403);
});

test('storage failures become a visible 503 and readiness is reported only for the S3 driver', async () => {
  assert.equal(await new MediaStorage({ driver: 'postgres', s3: {} }).status(), null);
  const missing = new MediaStorage({ driver: 'postgres', s3: {} });
  await assert.rejects(missing.get('media/1'), error => error.statusCode === 503 && error.code === 'MEDIA_STORAGE_UNAVAILABLE');

  const { fetch } = recorder([new Error('connect ECONNREFUSED'), new Error('connect ECONNREFUSED'),
    new Response(null, { status: 200 }), new Error('timeout'), new Error('timeout')]);
  const storage = new MediaStorage({ driver: 's3', s3: settings }, { fetch, retryDelayMs: 0 });
  await assert.rejects(storage.put('media/1', Buffer.from('x'), 'image/webp'), error => error.code === 'MEDIA_STORAGE_UNAVAILABLE');
  assert.equal(await storage.status(), 'connected');
  assert.equal(await storage.status(), 'unavailable');
});

test('registry predicates can be evaluated per media row for cleanup', () => {
  assert.equal(forEachMedia('EXISTS(SELECT 1 FROM t WHERE t.url = $2 AND t.n = $20)'),
    "EXISTS(SELECT 1 FROM t WHERE t.url = ('/realm/media/' || m.id::text) AND t.n = $20)");
});
