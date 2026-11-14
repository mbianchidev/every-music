import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { enablePush } from '../lib/pwa.js';
import { useResource } from '../lib/resources.js';
import Navigation from '../components/Navigation.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';

const labels = {
  messages: 'New messages',
  announcements: 'New announcements from musicians I follow',
  engagements: 'Comments and reactions on my announcements',
  profileViews: 'Daily profile-view notifications (only with analytics consent)',
  analytics: 'Opt in to privacy-friendly engagement analytics',
};

export default function SettingsScreen() {
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
        method: 'PUT', auth: true, body: Object.fromEntries(Object.keys(labels).map(key => [key, draft[key]])),
      });
      setDraft(previous => ({ ...previous, ...saved })); setMessage('Preferences saved.');
    } catch (failure) { setError(failure.message); }
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
      setMessage(enable ? 'Browser push enabled. Notifications do not contain message text.' : 'Push disabled on all devices.');
    } catch (failure) {
      if (enable && subscription) {
        try { await subscription.unsubscribe(); } catch (cleanupError) { console.error('Push subscription cleanup failed', cleanupError); }
      }
      setError(failure.message);
    } finally { setBusy(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow="Make it yours" title="SETTINGS" subtitle="Choose your notifications and control what is measured." />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!draft && !resource.error ? <Spinner label="Loading preferences" /> : draft && <>
        <form className="form-stack" onSubmit={save}>
          <fieldset disabled={busy}>
            <legend>Notifications and analytics</legend>
            {Object.entries(labels).map(([key, label]) => <label className="checkbox-label" key={key}>
              <input type="checkbox" checked={draft[key]} onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.checked }))} />{label}
            </label>)}
          </fieldset>
          <p className="body-muted">Analytics is off by default. When both you and the content owner opt in, we count views, likes, saves, and messages as daily totals. No visitor IDs, IP addresses, message text, or third-party trackers are stored in analytics. Daily reports expire after 30 days; opting out deletes those totals. Public announcement counters, messages, reactions, and bookmarks are retained.</p>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save preferences'}</button>
        </form>
        <section className="detail-section" aria-labelledby="push-heading">
          <h2 className="heading-md" id="push-heading">Browser push</h2>
          <p>Push uses your browser's notification permission and this server's configured push service. It is optional and disabled by default.</p>
          {!resource.data?.pushPublicKey && <p className="status-message">Browser push is not configured on this server. In-app notifications still work.</p>}
          <div className="compact-actions">
            <button className="btn btn-secondary" type="button" disabled={busy || !resource.data?.pushPublicKey} onClick={() => push(true)}>Enable push on this browser</button>
            {draft.push && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => push(false)}>Disable push on all devices</button>}
          </div>
        </section>
        <section className="detail-section">
          <h2 className="heading-md">Install and use offline</h2>
          <p>Use Install app above when offered, or your browser's Install / Add to Home Screen menu. The production web app saves its shell and your latest matching feed results for this browser tab, for up to 24 hours. Private conversations, profiles, and API responses are never saved by the service worker.</p>
          <p>Offline changes stay in the open form and are not sent automatically. Reconnect and submit again. Signing out clears the saved feed and unsubscribes this browser from push.</p>
        </section>
      </>}
      <Navigation active="profile" />
    </div>
  );
}
