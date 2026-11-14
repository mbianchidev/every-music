import { t } from './i18n.js';

export async function registerPwa(onUpdate, onError) {
  if (!import.meta.env.PROD || globalThis.__TAURI_INTERNALS__ || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    const update = () => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        onUpdate(() => {
          navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        });
      }
    };
    update();
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', update);
    });
    return registration;
  } catch (error) {
    console.error('Offline app registration failed', error);
    onError(t('app.pwa.unavailable'));
    return null;
  }
}

export async function enablePush(publicKey) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error(t('app.pwa.unsupported'));
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error(t('app.pwa.denied'));
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active) throw new Error(t('app.pwa.notReady'));
  const bytes = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const currentKey = new Uint8Array(existing.options?.applicationServerKey || []);
    if (currentKey.length === bytes.length && currentKey.every((value, index) => value === bytes[index])) return existing;
    await existing.unsubscribe();
  }
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes });
}
