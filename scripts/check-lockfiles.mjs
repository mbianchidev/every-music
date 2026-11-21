#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLIC_REGISTRY = 'https://registry.npmjs.org/';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOCKFILES = ['backend/package-lock.json', 'frontend/package-lock.json'];

export function findNonPublicSources(lock) {
  return Object.entries(lock.packages ?? {})
    .filter(([, entry]) => entry.resolved && !entry.resolved.startsWith(PUBLIC_REGISTRY))
    .map(([path, entry]) => ({ path, resolved: entry.resolved }));
}

async function main() {
  let failures = 0;
  for (const file of LOCKFILES) {
    const lock = JSON.parse(await readFile(join(root, file), 'utf8'));
    for (const { path, resolved } of findNonPublicSources(lock)) {
      console.error(`${file}: ${path} resolves to ${resolved}`);
      failures += 1;
    }
  }
  if (failures) {
    console.error(`Found ${failures} lockfile entries outside ${PUBLIC_REGISTRY}. `
      + 'Reinstall with the public registry so CI and Dependabot can fetch them.');
    process.exitCode = 1;
  } else {
    console.log(`All lockfile entries resolve to ${PUBLIC_REGISTRY}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`Lockfile check failed: ${error.message}`);
    process.exitCode = 1;
  });
}
