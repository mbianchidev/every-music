import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { optimizeImage, IMAGE_BYTE_LIMIT } from '../src/engines/media-engine.js';

test('optimizes supported images and strips metadata', async () => {
  const input = await sharp({ create: { width: 1600, height: 800, channels: 3, background: '#53e6ef' } })
    .withMetadata({ orientation: 1 }).jpeg().toBuffer();
  const output = await optimizeImage(input.toString('base64'), 'image/jpeg');
  const metadata = await sharp(output).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1280);
  assert.equal(metadata.height, 640);
  assert.equal(metadata.exif, undefined);
});

test('rejects spoofed, malformed, and oversized uploads before storing them', async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ff4f8b' } }).png().toBuffer();
  for (const [data, type] of [
    [png.toString('base64'), 'image/jpeg'],
    ['not base64', 'image/png'],
    [Buffer.alloc(IMAGE_BYTE_LIMIT + 1).toString('base64'), 'image/png'],
    [Buffer.from('<svg/>').toString('base64'), 'image/png'],
  ]) {
    await assert.rejects(optimizeImage(data, type), error => error.code === 'INVALID_IMAGE' && error.statusCode === 400);
  }
});
