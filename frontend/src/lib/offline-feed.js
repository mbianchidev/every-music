import nucleus, { OFFLINE_FEED_STORAGE_ID } from './nucleus.js';

const isFeed = path => path.startsWith('/announcements/search?');

export function rememberFeed(path, data, userId, storage) {
  if (!isFeed(path)) throw new Error('Only public announcement search results may be cached');
  if (!userId || userId !== nucleus.payload.persona?.userId) return false;
  try {
    const target = storage ?? globalThis.sessionStorage;
    if (!target) throw new Error('Session storage is unavailable');
    target.setItem(OFFLINE_FEED_STORAGE_ID, JSON.stringify({
      userId, path, data, cachedAt: new Date().toISOString(),
    }));
    return true;
  } catch (error) {
    console.warn('Offline announcements could not be saved in this browser', error);
    return false;
  }
}

export function offlineFeed(path, storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.sessionStorage)?.getItem(OFFLINE_FEED_STORAGE_ID) || 'null');
    const age = Date.now() - new Date(saved?.cachedAt).getTime();
    if (isFeed(path) && saved?.path === path && saved.userId === nucleus.payload.persona?.userId
      && Array.isArray(saved.data?.announcements) && saved.data.pagination
      && age >= 0 && age < 24 * 60 * 60 * 1000) {
      return { ...saved.data, offline: true, cachedAt: saved.cachedAt };
    }
    return null;
  } catch (error) {
    console.warn('Could not read offline announcements', error);
    return null;
  }
}
