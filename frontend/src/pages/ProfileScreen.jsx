import { useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useResource } from '../lib/resources.js';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ProfileDetails from '../components/ProfileDetails.jsx';
import VerificationRequest from '../components/VerificationRequest.jsx';
import ProfileVisits from '../components/ProfileVisits.jsx';
import { PromoteButton } from '../components/monetization/SpendDialog.jsx';
import { useI18n } from '../lib/i18n.js';

export default function ProfileScreen() {
  const { t } = useI18n();
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
      <PageHeader eyebrow={t('app.nav.sections.yourSpace')} title={t('profile.title')} subtitle={t('profile.subtitle')} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('profile.loading')} /> : resource.data && (
        <article className="card card-highlight">
          {!resource.data.artistName && <p className="status-message">{t('profile.incomplete')}</p>}
          <ProfileDetails profile={resource.data} />
          <div className="button-row">
            <a className="btn btn-secondary" href="#edit-profile">{resource.data.artistName ? t('app.routes.editProfile') : t('profile.complete')}</a>
            <button className="btn btn-ghost" type="button" onClick={logout} disabled={loggingOut}>{loggingOut ? t('profile.signingOut') : t('profile.signOut')}</button>
            {resource.data.artistName && <PromoteButton mode="profile" />}
          </div>
          <div className="compact-actions"><a href="#settings">{t('profile.preferences')}</a><a href="#analytics">{t('profile.analytics')}</a></div>
        </article>
      )}
      <VerificationRequest />
      {resource.data && <ProfileVisits />}
    </div>
  );
}
