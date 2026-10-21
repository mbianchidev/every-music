import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectBundles, validateApiBase } from '../release.mjs';

test('validates packaged API URLs without embedding credentials or insecure remote URLs', () => {
  assert.equal(validateApiBase('https://api.example.test/realm/'), 'https://api.example.test/realm');
  assert.equal(validateApiBase('http://localhost:8080/realm'), 'http://localhost:8080/realm');
  assert.equal(validateApiBase('http://127.0.0.1:8080/realm'), 'http://127.0.0.1:8080/realm');
  for (const value of [
    undefined, '/realm', 'https://api.example.test', 'https://user:password@example.test/realm',
    'https://api.example.test/realm?token=example', 'https://api.example.test/realm#fragment',
    'http://api.example.test/realm', 'file:///realm',
  ]) {
    assert.throws(() => validateApiBase(value));
  }
});

test('requires fresh, nonempty installers for every native bundle format', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'everymusic-release-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'deb'));
  await mkdir(join(directory, 'appimage'));
  const deb = join(directory, 'deb/Every.music_1.0.0_amd64.deb');
  const appimage = join(directory, 'appimage/Every.music_1.0.0_amd64.AppImage');
  const options = { platform: 'linux', version: '1.0.0', startedAt: Date.now() };
  await writeFile(deb, 'synthetic installer');
  await writeFile(appimage, '');
  await assert.rejects(collectBundles(directory, options), /No new, nonempty .AppImage/);
  await writeFile(appimage, 'synthetic installer');
  await utimes(appimage, new Date(0), new Date(0));
  await assert.rejects(collectBundles(directory, options), /No new, nonempty .AppImage/);
  await utimes(appimage, new Date(), new Date());
  assert.deepEqual(await collectBundles(directory, options), [deb, appimage]);
  await assert.rejects(collectBundles(directory, { ...options, version: '2.0.0' }), /No new/);
  await assert.rejects(collectBundles(directory, { ...options, platform: 'unsupported' }), /Unsupported/);
});

test('release help has no build side effects and invalid arguments fail', () => {
  const script = fileURLToPath(new URL('../release.mjs', import.meta.url));
  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /without building or publishing/);
  const invalid = spawnSync(process.execPath, [script, '--publish'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /Release failed/);
});
