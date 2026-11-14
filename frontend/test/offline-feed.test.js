import test from 'node:test';
import assert from 'node:assert/strict';
import nucleus, { OFFLINE_FEED_STORAGE_ID } from '../src/lib/nucleus.js';
import { offlineFeed, rememberFeed } from '../src/lib/offline-feed.js';

test('offline results are bound to account, exact query, and a 24-hour lifetime', t => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const path = '/announcements/search?page=1';
  const data = { announcements: [{ id: 'synthetic', title: 'Synthetic open call' }], pagination: { page: 1 } };
  nucleus.login({ userId: 'synthetic-a' }, { accessToken: 'access-a', refreshToken: 'refresh-a' });
  t.after(() => nucleus.logout());
  assert.equal(rememberFeed(path, data, 'synthetic-a', storage), true);
  assert.equal(offlineFeed(path, storage).announcements[0].title, 'Synthetic open call');
  assert.equal(offlineFeed('/announcements/search?page=2', storage), null);
  assert.throws(() => rememberFeed('/conversations', data, 'synthetic-a', storage), /Only public/);
  nucleus.login({ userId: 'synthetic-b' }, { accessToken: 'access-b', refreshToken: 'refresh-b' });
  assert.equal(offlineFeed(path, storage), null);
  assert.equal(rememberFeed(path, data, 'synthetic-a', storage), false);
  nucleus.login({ userId: 'synthetic-a' }, { accessToken: 'access-a', refreshToken: 'refresh-a' });
  const expired = JSON.parse(storage.getItem(OFFLINE_FEED_STORAGE_ID));
  expired.cachedAt = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1).toISOString();
  storage.setItem(OFFLINE_FEED_STORAGE_ID, JSON.stringify(expired));
  assert.equal(offlineFeed(path, storage), null);
});
