import { useCallback, useEffect, useState } from 'react';
import conduit from './conduit.js';
import nucleus from './nucleus.js';
import { offlineFeed, rememberFeed } from './offline-feed.js';

export function useResource(path, { auth = true, events = '', cacheFeed = false, reconnect = true } = {}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ path: null, data: null, loading: Boolean(path), error: '' });
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    if (!path) return undefined;
    const controller = new AbortController();
    const userId = nucleus.payload.persona?.userId;
    setState(previous => ({
      path, data: previous.path === path ? previous.data : null, loading: true, error: '',
    }));
    const load = async () => {
      if (cacheFeed && !navigator.onLine) {
        const saved = offlineFeed(path);
        if (!saved) throw new Error('You are offline. There is no saved copy of these results. Reconnect and retry.');
        return saved;
      }
      const data = await conduit.transmit(path, { auth, signal: controller.signal });
      if (cacheFeed && !controller.signal.aborted && !rememberFeed(path, data, userId)) {
        return { ...data, offlineCacheWarning: 'These results could not be saved for offline use. Browser storage may be full or unavailable.' };
      }
      return data;
    };
    load().then(data => {
      if (!controller.signal.aborted) setState({ path, data, loading: false, error: '' });
    }).catch(error => {
      if (!controller.signal.aborted) setState(previous => ({
        ...previous, data: [403, 404].includes(error.status) ? null : previous.data, loading: false, error: error.message,
      }));
    });
    return () => controller.abort();
  }, [path, auth, cacheFeed, revision]);

  useEffect(() => {
    let timer;
    const update = (event) => {
      if (!events.split(',').includes(event.detail.type) && event.detail.type !== 'connected') return;
      clearTimeout(timer);
      timer = setTimeout(reload, 150);
    };
    if (events) window.addEventListener('everymusic:update', update);
    if (reconnect) window.addEventListener('online', reload);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('everymusic:update', update);
      window.removeEventListener('online', reload);
    };
  }, [events, reconnect, reload]);

  return { ...state, data: state.path === path ? state.data : null, reload };
}

export function useDebounced(value, milliseconds = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), milliseconds);
    return () => clearTimeout(timer);
  }, [value, milliseconds]);
  return debounced;
}

export function queryString(values) {
  return new URLSearchParams(Object.entries(values)
    .filter(([, value]) => value !== '' && value !== undefined && value !== null)).toString();
}
