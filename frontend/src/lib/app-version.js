/* global __APP_VERSION__ */
// Injected by Vite from package.json; Node tests have no define step.
export const CLIENT_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';

const PATTERN = /^(\d{1,6})\.(\d{1,6})\.(\d{1,6})(?:[-+][0-9A-Za-z.-]+)?$/;

export function parseVersion(value) {
  const match = typeof value === 'string' ? PATTERN.exec(value.trim()) : null;
  return match ? match.slice(1, 4).map(Number) : null;
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  const index = a.findIndex((part, position) => part !== b[position]);
  return index === -1 ? 0 : Math.sign(a[index] - b[index]);
}

// required: older than the supported minimum; available: older than latest.
export function versionStatus(info, current = CLIENT_VERSION) {
  if (!info) return 'unknown';
  if (info.minimumClientVersion && compareVersions(current, info.minimumClientVersion) < 0) return 'required';
  if (info.latestClientVersion && compareVersions(current, info.latestClientVersion) < 0) return 'available';
  return 'current';
}

export function detectPlatform(scope = globalThis) {
  const agent = scope.navigator?.userAgent || '';
  if (scope.__TAURI_INTERNALS__) {
    if (/Android/i.test(agent)) return 'android';
    if (/iPhone|iPad|iPod/i.test(agent)) return 'ios';
    return 'desktop';
  }
  if (scope.matchMedia?.('(display-mode: standalone)').matches || scope.navigator?.standalone === true) return 'pwa';
  return 'web';
}

// Reloads into the newest web build, activating a waiting service worker first.
export async function refreshApp(scope = globalThis) {
  try {
    const registration = await scope.navigator?.serviceWorker?.getRegistration();
    await registration?.update();
    if (registration?.waiting && scope.navigator.serviceWorker.controller) {
      scope.navigator.serviceWorker.addEventListener('controllerchange', () => scope.location.reload(), { once: true });
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
  } catch (error) {
    console.warn('The offline app could not check for an update; reloading instead', error);
  }
  scope.location.reload();
}
