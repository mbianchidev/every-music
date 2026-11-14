import test from 'node:test';
import assert from 'node:assert/strict';
import { createBandChatUnreadStore, totalUnread } from '../src/lib/band-chat-unread.js';

const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};

test('unread band chat totals ignore malformed counts', () => {
  assert.equal(totalUnread([{ unreadCount: 2 }, { unreadCount: 0 }, { unreadCount: '3' }, { unreadCount: -4 }, {}]), 5);
  assert.equal(totalUnread(null), 0);
});

test('badges share one request and refresh again after updates that arrive mid-request', async () => {
  const requests = [];
  const store = createBandChatUnreadStore({
    transmit: (path, options) => { const request = deferred(); requests.push({ path, options, request }); return request.promise; },
    account: () => 'user-1',
  });
  const seen = [];
  store.subscribe(state => seen.push(state));
  const first = store.refresh();
  store.refresh();
  store.refresh();
  assert.equal(requests.length, 1);
  assert.deepEqual({ path: requests[0].path, options: requests[0].options }, { path: '/band-chats', options: { auth: true } });
  requests[0].request.resolve({ chats: [{ organizationId: 'band-1', unreadCount: 2 }] });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.length, 2, 'one follow-up request covers every refresh asked for meanwhile');
  requests[1].request.resolve({ chats: [{ organizationId: 'band-1', unreadCount: 3 }] });
  await first;
  assert.equal(totalUnread(store.snapshot().chats), 3);
  assert.equal(seen.at(-1).loading, false);
});

test('failed requests keep the last counts, report the error, and are logged', async () => {
  const errors = [];
  let fail = false;
  const store = createBandChatUnreadStore({
    transmit: async () => { if (fail) throw new Error('Network unavailable'); return { chats: [{ organizationId: 'band-1', unreadCount: 4 }] }; },
    account: () => 'user-1',
    logger: { error: (...entry) => errors.push(entry) },
  });
  await store.refresh();
  fail = true;
  await store.refresh();
  assert.deepEqual(store.snapshot().chats, [{ organizationId: 'band-1', unreadCount: 4 }]);
  assert.equal(store.snapshot().error, 'Network unavailable');
  assert.equal(errors.length, 1);
});

test('counts never leak to another account and signed-out sessions skip the request', async () => {
  let user = 'user-1';
  let calls = 0;
  const store = createBandChatUnreadStore({
    transmit: async () => { calls += 1; return { chats: [{ organizationId: 'band-1', unreadCount: 1 }] }; },
    account: () => user,
  });
  await store.refresh();
  user = 'user-2';
  assert.equal(store.snapshot().chats, null);
  user = null;
  await store.refresh();
  assert.equal(calls, 1);
  assert.equal(store.snapshot().chats, null);
});

test('project, profile, and band chat translations cover every English key with matching placeholders', async () => {
  const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => (
    typeof child === 'object' ? keys(child, `${prefix}${key}.`) : [`${prefix}${key}`]
  )).sort();
  const placeholders = text => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const namespace of ['musicianProjects', 'profileDetails', 'bandChatUnread']) {
    const [en, ...others] = await Promise.all(['en', 'nl', 'it'].map(locale => import(`../src/locales/${locale}/${namespace}.js`)));
    const english = keys(en.default);
    for (const catalog of others) {
      assert.deepEqual(keys(catalog.default), english, `${namespace} keys`);
      for (const key of english) {
        const read = source => key.split('.').reduce((value, part) => value[part], source);
        assert.deepEqual(placeholders(read(catalog.default)), placeholders(read(en.default)), `${namespace}.${key} placeholders`);
      }
    }
  }
});
