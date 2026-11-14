import nucleus from './nucleus.js';

// Clears this browser after the server already ended every session (sign out
// everywhere or account deletion). Push cleanup is best effort. The route
// changes first so the protected-route guard does not replace the destination.
export async function endLocalSession(destination) {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch (error) {
    console.warn('Browser push cleanup could not be confirmed', error);
  }
  if (window.location.hash !== destination) {
    const changed = new Promise(resolve => window.addEventListener('hashchange', resolve, { once: true }));
    window.location.hash = destination;
    await changed;
  }
  nucleus.logout();
}
