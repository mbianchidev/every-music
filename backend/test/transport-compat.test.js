import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { blobFrom } from 'node-fetch';

test('preserves native DOMException errors when a file-backed blob changes', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'everymusic-blob-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, 'synthetic.txt');
  await writeFile(file, 'synthetic payload');
  await utimes(file, new Date(1000), new Date(1000));

  const blob = await blobFrom(file);
  assert.equal(await blob.text(), 'synthetic payload');

  await writeFile(file, 'updated synthetic payload');
  await utimes(file, new Date(2000), new Date(2000));
  await assert.rejects(blob.text(), (error) => {
    assert.equal(error.constructor, globalThis.DOMException);
    assert.equal(error.name, 'NotReadableError');
    return true;
  });
});
