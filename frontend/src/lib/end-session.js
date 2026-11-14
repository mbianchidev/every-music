import nucleus from './nucleus.js';

// Clears this browser after the server already ended every session (sign out
// everywhere or account deletion). Push cleanup is best effort.
export async function endLocalSession(destination) {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch (error) {
    console.warn('Browser push cleanup could not be confirmed', error);
  }
  nucleus.logout();
  window.location.hash = destination;
}
