const CACHE = 'everymusic-shell-__CACHE_VERSION__';
const FILES = __PRECACHE_MANIFEST__;
const paths = new Set(FILES);

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: 'reload' })))));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('everymusic-shell-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  const navigation = event.request.mode === 'navigate' && ['/', '/index.html'].includes(url.pathname);
  if (!navigation && !paths.has(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return await cache.match(navigation ? '/index.html' : url.pathname) || fetch(event.request);
  })());
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let payload;
    try {
      payload = event.data?.json();
    } catch (error) {
      console.error('Unreadable push notification', error);
    }
    await self.registration.showNotification('Every.music', {
      body: typeof payload?.body === 'string' ? payload.body : 'You have a new notification.',
      icon: '/app-icon.png',
      badge: '/app-icon.png',
      tag: typeof payload?.tag === 'string' ? payload.tag : undefined,
      data: { url: typeof payload?.url === 'string' && /^#(?:messages|announcement|analytics)(?:\?|$)/.test(payload.url) ? payload.url : '#notifications' },
    });
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const url = new URL(self.registration.scope);
    url.hash = event.notification.data?.url || '#notifications';
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients.find(item => new URL(item.url).origin === url.origin);
    if (client) {
      await client.navigate(url.href);
      await client.focus();
    } else {
      await self.clients.openWindow(url.href);
    }
  })());
});
