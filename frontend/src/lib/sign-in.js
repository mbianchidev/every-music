import nucleus from './nucleus.js';

export function finishSignIn(response) {
  nucleus.login(response.user, { accessToken: response.accessToken, refreshToken: response.refreshToken });
  let destination;
  try {
    destination = sessionStorage.getItem('everymusic.return-to');
    sessionStorage.removeItem('everymusic.return-to');
  } catch (error) {
    console.warn('Could not restore the requested page', error);
  }
  window.location.hash = /^#(?:feed|musician|musicians|announcement|messages|notifications|profile|saved|my-posts|reports|admin|settings|analytics)(?:\?|$)/.test(destination || '')
    ? destination : response.isNewUser ? '#edit-profile' : '#feed';
}
