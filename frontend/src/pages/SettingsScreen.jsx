import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';
import { enablePush } from '../lib/pwa.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import MessagingKeys from '../components/MessagingKeys.jsx';
import NotificationPreferences from '../components/NotificationPreferences.jsx';
import SecuritySettings from '../components/SecuritySettings.jsx';
import PrivacySettings from '../components/PrivacySettings.jsx';
import DiscoverySettings from '../components/DiscoverySettings.jsx';
import PushDevices from '../components/PushDevices.jsx';
import FollowVisibilitySetting from '../components/FollowVisibilitySetting.jsx';
import SponsoredSettings from '../components/monetization/SponsoredSettings.jsx';
import CalendarFeedSettings from '../components/CalendarFeedSettings.jsx';
import LanguageSettings from '../components/LanguageSettings.jsx';

const keys = ['messages', 'announcements', 'engagements', 'profileViews', 'analytics', 'platformAnalytics'];

export default function SettingsScreen() {
  const { t } = useI18n();
  const resource = useResource('/preferences', { reconnect: false });
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (resource.data && !draft) setDraft(resource.data); }, [resource.data, draft]);
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const saved = await conduit.transmit('/preferences', {
        method: 'PUT', auth: true, body: Object.fromEntries(keys.map(key => [key, draft[key]])),
      });
      setDraft(previous => ({ ...previous, ...saved })); setMessage(t('settings.saved'));
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const push = async enable => {
    setBusy(true); setError(''); setMessage('');
    let subscription;
    try {
      if (enable) {
        subscription = await enablePush(resource.data.pushPublicKey);
        await conduit.transmit('/push/subscriptions', { method: 'POST', auth: true, body: {
          endpoint: subscription.endpoint, keys: subscription.toJSON().keys,
        } });
      } else {
        await conduit.transmit('/preferences', { method: 'PUT', auth: true, body: { push: false } });
        const registration = await navigator.serviceWorker?.getRegistration();
        subscription = await registration?.pushManager.getSubscription();
        await subscription?.unsubscribe();
      }
      setDraft(previous => ({ ...previous, push: enable }));
      setMessage(enable ? t('settings.push.enabled') : t('settings.push.disabled'));
    } catch (failure) {
      if (enable && subscription) {
        try { await subscription.unsubscribe(); } catch (cleanupError) { console.error('Push subscription cleanup failed', cleanupError); }
      }
      setError(errorText(failure));
    } finally { setBusy(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow={t('settings.eyebrow')} title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <LanguageSettings />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!draft && !resource.error ? <Spinner label={t('settings.loading')} /> : draft && <>
        <form className="form-stack" onSubmit={save}>
          <fieldset disabled={busy}>
            <legend>{t('settings.preferences.legend')}</legend>
            {keys.map(key => <label className="checkbox-label" key={key}>
              <input type="checkbox" checked={draft[key]} disabled={key === 'platformAnalytics' && !draft.analytics} onChange={event => setDraft(previous => ({
                ...previous, [key]: event.target.checked, ...(key === 'analytics' && !event.target.checked ? { platformAnalytics: false } : {}),
              }))} />{t(`settings.preferences.${key}`)}
            </label>)}
          </fieldset>
          <p className="body-muted">{t('settings.preferences.analyticsNote')}</p>
          <p className="body-muted">{t('settings.preferences.platformNote')}</p>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('common.actions.saving') : t('settings.preferences.save')}</button>
        </form>
        <NotificationPreferences />
        <div className="detail-section"><MessagingKeys /></div>
        <DiscoverySettings />
        <FollowVisibilitySetting />
        <SponsoredSettings />
        <CalendarFeedSettings />
        <section className="detail-section" aria-labelledby="push-heading">
          <h2 className="heading-md" id="push-heading">{t('settings.push.heading')}</h2>
          <p>{t('settings.push.intro')}</p>
          {!resource.data?.pushPublicKey && <p className="status-message">{t('settings.push.notConfigured')}</p>}
          <div className="compact-actions">
            <button className="btn btn-secondary" type="button" disabled={busy || !resource.data?.pushPublicKey} onClick={() => push(true)}>{t('settings.push.enable')}</button>
            {draft.push && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => push(false)}>{t('settings.push.disable')}</button>}
          </div>
        </section>
        <PushDevices />
        <section className="detail-section">
          <h2 className="heading-md">{t('settings.offline.heading')}</h2>
          <p>{t('settings.offline.install')}</p>
          <p>{t('settings.offline.changes')}</p>
        </section>
      </>}
      <SecuritySettings />
      <PrivacySettings />
    </div>
  );
}
