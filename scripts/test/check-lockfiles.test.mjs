import assert from 'node:assert/strict';
import test from 'node:test';
import { findNonPublicSources } from '../check-lockfiles.mjs';

test('flags lockfile entries resolved outside the public npm registry', () => {
  const lock = {
    packages: {
      '': { name: 'example' },
      'node_modules/public': { resolved: 'https://registry.npmjs.org/public/-/public-1.0.0.tgz' },
      'node_modules/private': { resolved: 'https://feed.example.test/npm/registry/private/-/private-1.0.0.tgz' },
      'node_modules/git': { resolved: 'git+ssh://git@example.test/org/git.git#abc123' },
    },
  };
  assert.deepEqual(findNonPublicSources(lock).map(({ path }) => path), ['node_modules/private', 'node_modules/git']);
});
