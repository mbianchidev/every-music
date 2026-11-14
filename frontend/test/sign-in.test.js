import test from 'node:test';
import assert from 'node:assert/strict';
import nucleus from '../src/lib/nucleus.js';
import { finishSignIn } from '../src/lib/sign-in.js';

test('sign-in restores safe report/admin deep links without accepting external redirects', () => {
  const originalWindow = globalThis.window;
  const originalStorage = globalThis.sessionStorage;
  const response = { user: { userId: 'synthetic-user' }, accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', isNewUser: false };
  try {
    for (const [destination, expected] of [
      ['#admin?tab=reports&id=synthetic', '#admin?tab=reports&id=synthetic'],
      ['#reports', '#reports'],
      ['https://example.test/untrusted', '#feed'],
      ['#admin-malformed?next=https://example.test', '#feed'],
    ]) {
      const values = new Map([['everymusic.return-to', destination]]);
      globalThis.window = { location: { hash: '' } };
      globalThis.sessionStorage = { getItem: key => values.get(key), removeItem: key => values.delete(key) };
      finishSignIn(response);
      assert.equal(window.location.hash, expected);
      assert.equal(values.has('everymusic.return-to'), false);
      assert.equal(nucleus.payload.persona.userId, 'synthetic-user');
    }
  } finally {
    nucleus.logout();
    globalThis.window = originalWindow;
    globalThis.sessionStorage = originalStorage;
  }
});
