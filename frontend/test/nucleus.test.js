import test from 'node:test';
import assert from 'node:assert/strict';
import { Nucleus } from '../src/lib/nucleus.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

test('persists and restores a valid session', () => {
  const storage = createStorage();
  const session = new Nucleus({ storage });

  session.login(
    { userId: 'user-1', email: 'player@example.com' },
    { accessToken: 'access', refreshToken: 'refresh' },
  );

  const restored = new Nucleus({ storage });
  assert.equal(restored.authorized, true);
  assert.equal(restored.payload.persona.userId, 'user-1');
});

test('discards malformed stored sessions', () => {
  const storage = createStorage({
    'everymusic.session.v1': '{"persona":null,"keys":{"accessToken":"broken"}}',
  });

  const session = new Nucleus({ storage });
  assert.equal(session.authorized, false);
  assert.equal(storage.getItem('everymusic.session.v1'), null);
});

test('updates tokens without losing the signed-in persona', () => {
  const session = new Nucleus({ storage: createStorage() });
  session.login(
    { userId: 'user-1' },
    { accessToken: 'old', refreshToken: 'refresh' },
  );
  session.updateTokens({ accessToken: 'new' });

  assert.equal(session.payload.keys.accessToken, 'new');
  assert.equal(session.payload.keys.refreshToken, 'refresh');
  assert.equal(session.payload.persona.userId, 'user-1');
});
