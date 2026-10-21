import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const formats = {
  darwin: [{ directory: 'dmg', extension: '.dmg' }],
  linux: [
    { directory: 'deb', extension: '.deb' },
    { directory: 'appimage', extension: '.AppImage' },
  ],
  win32: [{ directory: 'nsis', extension: '.exe' }],
};

export function validateApiBase(value) {
  if (!value) {
    throw new Error('Set VITE_API_BASE_URL to an absolute API URL ending in /realm');
  }

  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)
    || url.username || url.password || url.search || url.hash
    || !url.pathname.replace(/\/$/, '').endsWith('/realm')) {
    throw new Error('VITE_API_BASE_URL must be an HTTP(S) URL ending in /realm, without credentials, query, or fragment');
  }
  if (url.protocol !== 'https:'
    && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Use HTTPS for a deployed API; HTTP is allowed only for loopback development');
  }
  return url.href.replace(/\/$/, '');
}

export async function collectBundles(bundleRoot, { platform, version, startedAt }) {
  if (!formats[platform]) {
    throw new Error(`Unsupported desktop platform: ${platform}`);
  }
  const bundles = [];
  for (const { directory, extension } of formats[platform]) {
    const path = join(bundleRoot, directory);
    const candidates = (await readdir(path))
      .filter((name) => name.includes(`_${version}_`) && name.endsWith(extension));
    const current = [];
    for (const name of candidates) {
      const file = join(path, name);
      const info = await stat(file);
      if (info.isFile() && info.size > 0 && info.mtimeMs >= startedAt - 1000) {
        current.push(file);
      }
    }
    if (current.length === 0) {
      throw new Error(`No new, nonempty ${extension} bundle for ${version} in ${path}`);
    }
    bundles.push(...current);
  }
  return bundles;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${basename(command)} failed (${result.signal || result.status})`);
  }
}

async function release() {
  const { values } = parseArgs({
    options: { check: { type: 'boolean' }, help: { type: 'boolean' } },
  });
  if (values.help) {
    console.log('Usage: VITE_API_BASE_URL=https://api.example.com/realm node scripts/release.mjs [--check]');
    console.log('Builds unsigned native desktop installers and SHA-256 checksums under artifacts/.');
    console.log('--check validates tools, versions and API configuration without building or publishing.');
    return;
  }

  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < 22 || (major === 22 && minor < 12)) {
    throw new Error('Node.js 22.12.0 or newer is required');
  }
  if (!formats[process.platform] || !['arm64', 'x64'].includes(process.arch)) {
    throw new Error(`Unsupported release host: ${process.platform}/${process.arch}`);
  }
  if (process.env.CARGO_BUILD_TARGET) {
    throw new Error('Unset CARGO_BUILD_TARGET; this script builds only for the native host');
  }
  const apiBase = validateApiBase(process.env.VITE_API_BASE_URL);
  const frontend = join(root, 'frontend');
  const tauriRoot = join(frontend, 'src-tauri');
  const packageJson = JSON.parse(await readFile(join(frontend, 'package.json'), 'utf8'));
  const config = JSON.parse(await readFile(join(tauriRoot, 'tauri.conf.json'), 'utf8'));
  const cargo = await readFile(join(tauriRoot, 'Cargo.toml'), 'utf8');
  const cargoVersion = cargo.split('[package]')[1]?.split('\n[')[0]
    .match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const version = packageJson.version;
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)
    || version !== config.version || version !== cargoVersion) {
    throw new Error('Align versions in frontend/package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml');
  }
  const cli = join(frontend, 'node_modules/@tauri-apps/cli/tauri.js');
  await access(cli);
  run('cargo', ['--version']);
  run('rustc', ['--version']);
  if (process.platform === 'win32') {
    run('cmd.exe', ['/d', '/s', '/c', 'npm --version']);
  } else {
    run('npm', ['--version']);
  }
  console.log(`Every.music ${version}: ${process.platform}/${process.arch}, API ${apiBase}`);
  console.log('No Developer ID signing, installer signing, or notarization will be requested.');
  if (values.check) {
    console.log('Preflight passed. Platform SDKs and bundling are verified by a full build.');
    return;
  }

  const artifacts = join(root, 'artifacts');
  const output = join(artifacts, `everymusic-${version}-${process.platform}-${process.arch}`);
  try {
    await access(output);
    throw new Error(`Output already exists: ${output}. Move the previous build before rebuilding.`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const target = join(tauriRoot, 'target');
  const startedAt = Date.now();
  run(process.execPath, [cli, 'build', '--ci', '--no-sign', '--bundles',
    formats[process.platform].map(({ directory }) => directory).join(','), '--', '--locked'], {
    cwd: frontend,
    env: { ...process.env, CI: 'true', VITE_API_BASE_URL: apiBase, CARGO_TARGET_DIR: target },
  });
  const bundles = await collectBundles(join(target, 'release/bundle'), {
    platform: process.platform, version, startedAt,
  });
  await mkdir(artifacts, { recursive: true });
  const staging = await mkdtemp(join(artifacts, '.release-'));
  try {
    const files = [];
    for (const file of bundles) {
      const name = basename(file);
      await copyFile(file, join(staging, name));
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(join(staging, name))) hash.update(chunk);
      files.push({ name, bytes: (await stat(file)).size, sha256: hash.digest('hex') });
    }
    await writeFile(join(staging, 'SHA256SUMS'),
      files.map(({ name, sha256 }) => `${sha256}  ${name}\n`).join(''));
    await writeFile(join(staging, 'build-info.json'), `${JSON.stringify({
      version, platform: process.platform, architecture: process.arch, apiBase,
      createdAt: new Date().toISOString(),
      signing: 'Unsigned development build; no release signing or notarization requested',
      files,
    }, null, 2)}\n`);
    await rename(staging, output);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  console.log(`Release artifacts verified: ${output}`);
  console.log('Nothing was tagged, published, or uploaded. Verify SHA256SUMS before sharing.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  release().catch((error) => {
    console.error(`Release failed: ${error.message}`);
    process.exitCode = 1;
  });
}
