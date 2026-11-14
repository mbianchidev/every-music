import conduit from './conduit.js';

export async function readEvents(body, onEvent, signal, idleTimeoutMs = 45000) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let idleTimer;
  try {
    while (!signal.aborted) {
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          idleTimer = setTimeout(() => reject(new Error('Live updates timed out; reconnecting')), idleTimeoutMs);
        }),
      ]);
      clearTimeout(idleTimer);
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 65536) throw new Error('Live update exceeded the supported size');
      let end;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        for (const line of frame.split('\n')) {
          if (line.startsWith('data: ')) onEvent(JSON.parse(line.slice(6)));
        }
      }
    }
  } finally {
    clearTimeout(idleTimer);
    await reader.cancel();
    reader.releaseLock();
  }
}

export function connectLiveUpdates(onStatus) {
  let stopped = false;
  let controller;
  let timer;
  let attempt = 0;
  let generation = 0;
  const connect = async () => {
    if (stopped) return;
    if (!navigator.onLine) { onStatus('offline'); return; }
    const current = ++generation;
    const connection = new AbortController();
    controller = connection;
    try {
      const response = await conduit.transmit('/events', { auth: true, stream: true, signal: connection.signal });
      if (stopped || current !== generation) return;
      if (!response.headers.get('content-type')?.startsWith('text/event-stream')) {
        throw new Error('The server did not return a live event stream');
      }
      onStatus('live');
      attempt = 0;
      await readEvents(response.body, detail => window.dispatchEvent(new CustomEvent('everymusic:update', { detail })), connection.signal);
      if (!stopped) throw new Error('Live connection ended; reconnecting');
    } catch (error) {
      if (stopped || current !== generation) return;
      console.warn('Live updates interrupted', error.message);
      onStatus(navigator.onLine ? 'reconnecting' : 'offline');
      timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(attempt++, 5)));
    } finally {
      connection.abort();
    }
  };
  const online = () => { ++generation; clearTimeout(timer); controller?.abort(); void connect(); };
  const offline = () => { ++generation; clearTimeout(timer); controller?.abort(); onStatus('offline'); };
  window.addEventListener('online', online);
  window.addEventListener('offline', offline);
  void connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    controller?.abort();
    window.removeEventListener('online', online);
    window.removeEventListener('offline', offline);
  };
}
