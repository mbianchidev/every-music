import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { feedLinks } from '../lib/calendar.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import { errorText } from '../lib/error-text.js';

// Private ICS subscription link. The token is shown once after creation; the
// server keeps only its hash, so a lost link is replaced, not recovered.
export default function CalendarFeedSettings() {
  const { t, formatDate } = useI18n();
  const status = useResource('/calendar/feed', { reconnect: false });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (new URLSearchParams(window.location.hash.split('?')[1] || '').get('section') === 'calendar') {
      document.getElementById('calendar-feed-heading')?.scrollIntoView({ block: 'start' });
    }
  }, []);
  const create = async replacing => {
    if (replacing && !window.confirm(t('calendar.feed.replaceConfirm'))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await conduit.transmit('/calendar/feed', { method: 'POST', auth: true });
      setCreated(feedLinks(result.token)); status.reload();
      requestAnimationFrame(() => document.getElementById('calendar-feed-link')?.focus());
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    if (!window.confirm(t('calendar.feed.revokeConfirm'))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit('/calendar/feed', { method: 'DELETE', auth: true });
      setCreated(null); setMessage(t('calendar.feed.revoked')); status.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(created.https); setMessage(t('calendar.feed.copied')); }
    catch { setMessage(t('calendar.feed.copyFailed')); document.getElementById('calendar-feed-link')?.select(); }
  };
  const feed = status.data;
  return (
    <section className="detail-section" aria-labelledby="calendar-feed-heading">
      <h2 className="heading-md" id="calendar-feed-heading">{t('calendar.feed.title')}</h2>
      <p>{t('calendar.feed.intro')}</p>
      <p className="status-message">{t('calendar.feed.warning')}</p>
      {status.error && <ErrorState message={status.error} onRetry={status.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!feed && !status.error ? <Spinner label={t('calendar.feed.loading')} /> : feed && <>
        <p>{feed.active
          ? `${t('calendar.feed.active', { date: formatDate(feed.createdAt) })} ${feed.lastUsedAt ? t('calendar.feed.lastUsed', { date: formatDate(feed.lastUsedAt, { dateStyle: 'medium', timeStyle: 'short' }) }) : t('calendar.feed.neverUsed')}`
          : t('calendar.feed.inactive')}</p>
        {created && <div className="form-stack calendar-feed-link">
          <FormField id="calendar-feed-link" label={t('calendar.feed.link')} hint={t('calendar.feed.linkHint')}>
            <input className="input" value={created.https} readOnly onFocus={event => event.target.select()} />
          </FormField>
          <div className="compact-actions">
            <button className="btn btn-secondary" type="button" onClick={copy}>{t('calendar.feed.copy')}</button>
            <a className="btn btn-ghost" href={created.google} target="_blank" rel="noopener noreferrer">{t('calendar.feed.google')}</a>
            <a className="btn btn-ghost" href={created.webcal}>{t('calendar.feed.apple')}</a>
          </div>
          <p className="field-hint">{t('calendar.feed.publicServer')}</p>
        </div>}
        <div className="compact-actions">
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => create(feed.active)}>
            {feed.active ? t('calendar.feed.replace') : t('calendar.feed.create')}
          </button>
          {feed.active && <button className="btn btn-ghost" type="button" disabled={busy} onClick={revoke}>{t('calendar.feed.revoke')}</button>}
        </div>
      </>}
    </section>
  );
}
