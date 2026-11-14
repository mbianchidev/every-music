import { useEffect, useState } from 'react';
import conduit from './conduit.js';
import nucleus from './nucleus.js';

export const BAND_CHAT_EVENTS = ['band-chat.changed', 'organizations.changed', 'account.changed', 'connected'];

export const totalUnread = chats => (chats ?? []).reduce((sum, chat) => sum + Math.max(0, Number(chat.unreadCount) || 0), 0);

// One shared GET /band-chats for every mounted badge or list. A refresh asked
// for while a request is in flight runs once more afterwards, so updates that
// arrive mid-request are not lost. Failures keep the last known counts and
// expose the error instead of reporting zero unread messages.
export function createBandChatUnreadStore({
  transmit = (path, options) => conduit.transmit(path, options),
  account = () => nucleus.payload.persona?.userId ?? null,
  logger = console,
} = {}) {
  const listeners = new Set();
  let state = { account: null, chats: null, error: '', loading: false };
  let pending = null;
  let again = false;
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

  return {
    refresh,
    snapshot: () => (state.account === account() ? state : { account: account(), chats: null, error: '', loading: false }),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export const bandChatUnread = createBandChatUnreadStore();

export function useBandChatUnread(store = bandChatUnread) {
  const [, setState] = useState(null);
  useEffect(() => {
    let timer;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => store.refresh(), 150); };
    const update = event => { if (BAND_CHAT_EVENTS.includes(event.detail?.type)) schedule(); };
    const unsubscribe = store.subscribe(setState);
    store.refresh();
    window.addEventListener('everymusic:update', update);
    window.addEventListener('online', schedule);
    return () => {
      clearTimeout(timer);
      unsubscribe();
      window.removeEventListener('everymusic:update', update);
      window.removeEventListener('online', schedule);
    };
  }, [store]);
  const snapshot = store.snapshot();
  return { ...snapshot, total: totalUnread(snapshot.chats), reload: () => store.refresh() };
}
