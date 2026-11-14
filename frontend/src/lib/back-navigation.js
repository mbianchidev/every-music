const ENTRY_ROUTES = new Set(['', 'boot', 'login', 'register', 'forgot-password', 'verify-email', 'reset-password']);
const routeName = hash => hash.replace(/^#/, '').split('?')[0];

// Nested screens and where Back goes when there is no in-app history.
export function backFallback(route, authorized) {
  const home = authorized ? '#feed' : '#login';
  switch (route.name) {
    case 'announcement': return '#feed';
    case 'musician': return '#musicians';
    case 'edit-profile': return '#profile';
    case 'edit-announcement': return '#my-posts';
    case 'legal': return '#help';
    case 'event': case 'new-event': case 'my-events': return '#events';
    case 'edit-event': return route.query.get('id') ? `#event?id=${encodeURIComponent(route.query.get('id'))}` : '#events';
    case 'help': return route.query.get('view') ? '#help' : home;
    default: return null;
  }
}

// Uses the browser history only when the previous entry is another page of
// this app (not a sign-in step or another site); otherwise opens the fallback.
export function goBack(fallback, scope = globalThis) {
  const navigation = scope.navigation;
  if (navigation?.canGoBack && navigation.currentEntry) {
    const previous = navigation.entries()[navigation.currentEntry.index - 1];
    let hash = null;
    try {
      const url = new URL(previous?.url);
      if (url.origin === scope.location.origin) hash = url.hash;
    } catch {
      hash = null;
    }
    if (hash !== null && !ENTRY_ROUTES.has(routeName(hash))) {
      scope.history.back();
      return 'history';
    }
  }
  scope.location.hash = fallback;
  return 'fallback';
}
