import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, Conduit } from '../src/lib/conduit.js';

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createSession() {
  return {
    payload: {
      persona: { userId: 'user-1' },
      keys: {
        accessToken: 'old-access',
        refreshToken: 'refresh-token',
      },
    },
    updateTokens(keys) {
      this.payload.keys = { ...this.payload.keys, ...keys };
    },
    logout() {
      this.payload = { persona: null, keys: null };
    },
  };
}

test('returns typed API errors', async () => {
  const conduit = new Conduit({
    baseUrl: 'https://api.example.test/realm',
    fetchImpl: async () => jsonResponse({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: ['Title is required'],
      },
    }, 400),
  });

  await assert.rejects(
    conduit.transmit('/announcements'),
    (error) => error instanceof ApiError
      && error.status === 400
      && error.code === 'VALIDATION_ERROR'
      && error.details[0] === 'Title is required',
  );
});

test('uses one refresh request for concurrent expired requests', async () => {
  const session = createSession();
  let refreshCalls = 0;

  const conduit = new Conduit({
    baseUrl: 'https://api.example.test/realm',
    session,
    fetchImpl: async (url, options) => {
      if (url.endsWith('/auth/refresh-token')) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return jsonResponse({
          success: true,
          data: {
            accessToken: 'new-access',
            refreshToken: 'refresh-token',
          },
        });
      }

      if (options.headers.get('Authorization') === 'Bearer old-access') {
        return jsonResponse({
          success: false,
          error: { code: 'INVALID_TOKEN', message: 'Expired' },
        }, 401);
      }

      return jsonResponse({ success: true, data: { ok: true } });
    },
  });

  const [first, second] = await Promise.all([
    conduit.transmit('/profiles/me', { auth: true }),
    conduit.transmit('/announcements/me', { auth: true }),
  ]);

  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true });
  assert.equal(refreshCalls, 1);
  assert.equal(session.payload.keys.accessToken, 'new-access');
});

test('does not clear a session on network errors', async () => {
  const session = createSession();
  const conduit = new Conduit({
    session,
    fetchImpl: async () => {
      throw new TypeError('offline');
    },
  });

  await assert.rejects(
    conduit.transmit('/profiles/me', { auth: true }),
    (error) => error.code === 'NETWORK_ERROR',
  );
  assert.equal(session.payload.persona.userId, 'user-1');
});
