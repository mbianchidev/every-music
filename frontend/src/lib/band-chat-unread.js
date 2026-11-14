import { useEffect, useState } from 'react';
import conduit from './conduit.js';
import nucleus from './nucleus.js';

export const totalUnread = chats => (chats ?? []).reduce((sum, chat) => sum + Math.max(0, Number(chat.unreadCount) || 0), 0);

// Page-wide `organizations.changed` events (follows, photos, posts) reach every
// client, so only events addressed to this account can change its bands.
export function affectsBandChats(detail = {}) {
  if (detail.type === 'organizations.changed') return Boolean(detail.userId);
  return ['band-chat.changed', 'account.changed', 'connected'].includes(detail.type);
}

// One shared GET /band-chats for every mounted badge or list. Live updates are
// observed once while anything is subscribed. A refresh asked for while a
// request is in flight runs once more afterwards, so updates that arrive
// mid-request are not lost. Failures keep the last known counts and expose
// the error instead of reporting zero unread messages.
export function createBandChatUnreadStore({
  transmit = (path, options) => conduit.transmit(path, options),
  account = () => nucleus.payload.persona?.userId ?? null,
  logger = console,
  events = globalThis.window,
  delay = 150,
} = {}) {
  const listeners = new Set();
  let state = { account: null, chats: null, error: '', loading: false };
  let pending = null;
  let again = false;
  let timer;
  const publish = next => { state = next; for (const listener of listeners) listener(state); };

  async function load() {
    const owner = account();
    if (!owner) { publish({ account: null, chats: null, error: '', loading: false }); return; }
    const kept = state.account === owner ? state.chats : null;
    publish({ account: owner, chats: kept, error: '', loading: true });
    try {
      const data = await transmit('/band-chats', { auth: true });
      if (account() === owner) publish({ account: owner, chats: data.chats, error: '', loading: false });
    } catch (error) {
      logger.error('Could not load unread band chat messages', error);
      if (account() === owner) publish({ account: owner, chats: kept, error: error.message || 'Request failed', loading: false });
    }
  }

  function refresh() {
    if (pending) { again = true; return pending; }
    pending = load().finally(async () => {
      pending = null;
      if (again) { again = false; await refresh(); }
    });
    return pending;
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, delay); };
  const update = event => { if (affectsBandChats(event.detail)) schedule(); };

  return {
    refresh,
    snapshot: () => (state.account === account() ? state : { account: account(), chats: null, error: '', loading: false }),
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        events?.addEventListener('everymusic:update', update);
        events?.addEventListener('online', schedule);
        refresh();
      } else if (state.account !== account()) {
        refresh();
      }
      return () => {
        if (!listeners.delete(listener) || listeners.size) return;
        clearTimeout(timer);
        events?.removeEventListener('everymusic:update', update);
        events?.removeEventListener('online', schedule);
      };
    },
  };
}

export const bandChatUnread = createBandChatUnreadStore();

export function useBandChatUnread(store = bandChatUnread) {
  const [, setState] = useState(null);
  useEffect(() => store.subscribe(setState), [store]);
  const snapshot = store.snapshot();
  return { ...snapshot, total: totalUnread(snapshot.chats), reload: () => store.refresh() };
}
