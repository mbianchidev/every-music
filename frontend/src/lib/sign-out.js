import conduit from './conduit.js';
import nucleus from './nucleus.js';

// Same sequence as the profile screen: remove this browser's push endpoint,
// revoke the refresh session, then clear local state even if the server fails.
export async function signOut() {
  let failed = false;
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      try {
        await conduit.transmit('/push/subscriptions', { method: 'DELETE', auth: true, body: { endpoint: subscription.endpoint } });
      } finally { await subscription.unsubscribe(); }
    }
  } catch (error) {
    failed = true;
    console.warn('Browser push cleanup could not be confirmed', error);
  }
  try {
    await conduit.transmit('/auth/logout', { method: 'POST', auth: true, body: { refreshToken: nucleus.payload.keys?.refreshToken } });
  } catch (error) {
    failed = true;
    console.warn('Server-side session revocation failed; clearing the local session', error);
  }
  nucleus.logout();
  window.location.hash = failed ? '#login?signedOut=local-only' : '#login';
}
