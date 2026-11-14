import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_LOCALE_STORAGE_ID, createLocalePreference } from '../src/lib/locale-preference.js';
import { errorText } from '../src/lib/error-text.js';
import { registerCatalog } from '../src/lib/i18n.js';
import enErrors from '../src/locales/en/errors.js';
import itErrors from '../src/locales/it/errors.js';

registerCatalog('en', 'errors', enErrors);
registerCatalog('it', 'errors', itErrors);

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
}

function harness({ device = 'nl', server = {} } = {}) {
  const listeners = new Set();
  const session = {
    authorized: false,
    payload: { persona: null },
    subscribe(listener) { listeners.add(listener); listener({ authorized: this.authorized, persona: this.payload.persona }); return () => listeners.delete(listener); },
    signIn(userId) { this.authorized = true; this.payload = { persona: { userId } }; listeners.forEach(listener => listener({ authorized: true, persona: { userId } })); },
    signOut() { this.authorized = false; this.payload = { persona: null }; listeners.forEach(listener => listener({ authorized: false, persona: null })); },
  };
  const requests = [];
  const transport = {
    failNextPut: false,
    async transmit(path, options) {
      const userId = session.payload.persona?.userId;
      requests.push({ path, method: options.method || 'GET', userId, body: options.body });
      if (options.method === 'PUT') {
        if (this.failNextPut) { this.failNextPut = false; throw Object.assign(new Error('Unavailable'), { code: 'NETWORK_ERROR', status: 0 }); }
        server[userId] = options.body.locale;
        return { locale: server[userId] };
      }
      return { locale: server[userId] ?? null };
    },
  };
  const state = { device, current: device, applied: [] };
  const preference = createLocalePreference({
    session, transport, storage: memoryStorage(),
    deviceLocale: () => state.device,
    current: () => state.current,
    apply: (code, { remember = true } = {}) => { state.current = code; if (remember) state.device = code; state.applied.push(code); },
  });
  return { session, transport, requests, state, server, preference };
}

test('the server language wins over the device language after sign-in', async () => {
  const { session, state, requests, preference } = harness({ device: 'nl', server: { a: 'it' } });
  preference.start();
  session.signIn('a');
  await preference.settled();
  assert.equal(state.current, 'it');
  assert.equal(state.device, 'nl');
  assert.deepEqual(requests.map(request => request.method), ['GET']);
});

test('an account without a language gets the device language once', async () => {
  const shared = {};
  const first = harness({ device: 'nl', server: shared });
  first.preference.start();
  first.session.signIn('a');
  await first.preference.settled();
  assert.deepEqual(first.requests.map(request => [request.method, request.body?.locale]), [['GET', undefined], ['PUT', 'nl']]);
  assert.equal(shared.a, 'nl');

  const restored = harness({ device: 'en', server: shared });
  restored.preference.start();
  restored.session.signIn('a');
  await restored.preference.settled();
  assert.equal(restored.state.current, 'nl');
  assert.deepEqual(restored.requests.map(request => request.method), ['GET']);
});

test('a language chosen while signed in stays with that account', async () => {
  const { session, state, server, preference } = harness({ device: 'en', server: { a: 'en' } });
  preference.start();
  session.signIn('a');
  await preference.settled();
  await preference.choose('it');
  assert.equal(server.a, 'it');
  assert.equal(state.current, 'it');
  assert.equal(state.device, 'en');

  session.signOut();
  assert.equal(state.current, 'en');
  session.signIn('b');
  await preference.settled();
  assert.equal(server.b, 'en');
  assert.equal(state.current, 'en');
});

test('signed out choices are remembered on the device and failed saves stay visible', async () => {
  const { session, state, transport, preference } = harness({ device: 'en', server: { a: 'en' } });
  preference.start();
  await preference.choose('nl');
  assert.equal(state.device, 'nl');
  session.signIn('a');
  await preference.settled();
  transport.failNextPut = true;
  await assert.rejects(preference.choose('it'), { code: 'NETWORK_ERROR' });
  assert.equal(state.current, 'it');
  await assert.rejects(preference.choose('fr'), /Unsupported locale/);
});

test('the account language is kept for the tab only for the same account', async () => {
  const storage = memoryStorage();
  storage.setItem(ACCOUNT_LOCALE_STORAGE_ID, JSON.stringify({ userId: 'a', locale: 'it' }));
  const applied = [];
  const session = { authorized: true, payload: { persona: { userId: 'b' } }, subscribe(listener) { listener({ authorized: true, persona: { userId: 'b' } }); } };
  const preference = createLocalePreference({
    session, storage, deviceLocale: () => 'en', current: () => applied.at(-1), apply: code => applied.push(code),
    transport: { transmit: async () => new Promise(() => {}) },
  });
  preference.start();
  assert.deepEqual(applied, ['en']);
});

test('API errors are localized by code and keep the server text when the code is unknown', () => {
  const api = (code, message, status = 400) => Object.assign(new Error(message), { name: 'ApiError', code, status });
  const blocked = api('MESSAGING_UNAVAILABLE', 'Messaging is unavailable for this musician', 403);
  assert.equal(errorText(blocked, 'en'), 'Messaging is unavailable for this musician');
  assert.equal(errorText(blocked, 'it'), itErrors.codes.MESSAGING_UNAVAILABLE);
  assert.equal(errorText(api('RATE_LIMIT_EXCEEDED', 'Too many requests, please slow down', 429), 'en'), enErrors.codes.RATE_LIMIT_EXCEEDED);
  assert.equal(errorText(api('NETWORK_ERROR', 'Unable to reach Every.music.', 0), 'it'), itErrors.codes.NETWORK_ERROR);
  assert.equal(errorText(api('SOMETHING_NEW', 'A specific server explanation'), 'it'), 'A specific server explanation');
  assert.equal(errorText(api('VALIDATION_ERROR', 'Title is too short'), 'en'), 'Title is too short');
  assert.equal(errorText(api('VALIDATION_ERROR', 'Title is too short'), 'it'), `${itErrors.codes.VALIDATION_ERROR} (Title is too short)`);
  assert.equal(errorText(api('VALIDATION_ERROR', 'Request validation failed'), 'en'), enErrors.codes.VALIDATION_ERROR);
  assert.equal(errorText(api('REQUEST_FAILED', 'Request failed with status 503', 503), 'it'), itErrors.status.server);
  assert.equal(errorText(api(undefined, '', 0), 'it'), itErrors.unknown);
});

test('client-side errors keep their already translated message', () => {
  const local = Object.assign(new Error('Sblocca la chiave'), { code: 'SESSION_CHANGED' });
  assert.equal(errorText(local, 'it'), 'Sblocca la chiave');
  assert.equal(errorText('Plain text', 'it'), 'Plain text');
  assert.equal(errorText(null), '');
});
