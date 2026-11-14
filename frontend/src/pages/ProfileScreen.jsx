import { useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useResource } from '../lib/resources.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ProfileDetails from '../components/ProfileDetails.jsx';

export default function ProfileScreen() {
  const resource = useResource('/profiles/me', { events: 'profiles.changed' });
  const [loggingOut, setLoggingOut] = useState(false);
  const logout = async () => {
    setLoggingOut(true);
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
  };
  return (
    <div className="container">
      <PageHeader eyebrow="Your identity" title="PROFILE" subtitle="Show collaborators what you bring to the room." />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label="Loading your profile" /> : resource.data && (
        <article className="card card-highlight">
          {!resource.data.artistName && <p className="status-message">Complete your profile so other musicians can find you.</p>}
          <ProfileDetails profile={resource.data} />
          <div className="button-row">
            <a className="btn btn-secondary" href="#edit-profile">{resource.data.artistName ? 'Edit profile' : 'Complete profile'}</a>
            <button className="btn btn-ghost" type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? 'Signing out...' : 'Sign out'}</button>
          </div>
          <div className="compact-actions"><a href="#settings">Preferences</a><a href="#analytics">My analytics</a></div>
        </article>
      )}
      <Navigation active="profile" />
    </div>
  );
}
