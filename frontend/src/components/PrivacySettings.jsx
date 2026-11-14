import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { MAX_CONTACTS, contactPickerAvailable, extractEmails, hashEmails, pickContactEmails } from '../lib/contacts.js';
import Spinner from './Spinner.jsx';
import ErrorState from './ErrorState.jsx';
import FormField from './FormField.jsx';
import MusicianCard from './MusicianCard.jsx';

function FindPeople() {
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [results, setResults] = useState(null);
  const emails = extractEmails(text);
  const pick = async () => {
    setError(''); setStatus('');
    try {
      const picked = await pickContactEmails();
      setText(previous => [...new Set([...extractEmails(previous), ...picked])].join('\n'));
      setStatus(t('accountPrivacy.picked', { count: picked.length }));
    } catch (failure) { if (failure.name !== 'AbortError') setError(failure.message); }
  };
  const search = async event => {
    event.preventDefault();
    if (!emails.length) { setError(t('accountPrivacy.none')); return; }
    if (emails.length > MAX_CONTACTS) { setError(t('accountPrivacy.tooMany')); return; }
    setBusy(true); setError(''); setStatus('');
    try {
      const hashes = await hashEmails(emails);
      const result = await conduit.transmit('/contacts/match', { method: 'POST', auth: true, body: { hashes } });
      setResults(result.musicians);
      setStatus(result.musicians.length ? t('accountPrivacy.results', { count: result.musicians.length }) : t('accountPrivacy.noResults'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="card account-trust-card" aria-labelledby="find-people-heading">
      <h3 id="find-people-heading">{t('accountPrivacy.findHeading')}</h3>
      <p>{t('accountPrivacy.findIntro')}</p>
      <form className="form-stack" onSubmit={search}>
        {contactPickerAvailable() && <div>
          <button className="btn btn-secondary" type="button" onClick={pick} disabled={busy}>{t('accountPrivacy.pick')}</button>
          <p className="field-hint">{t('accountPrivacy.contactsText')}</p>
        </div>}
        <FormField id="find-people-emails" label={t('accountPrivacy.pasteLabel')} hint={t('accountPrivacy.pasteHint')}>
          <textarea className="input" value={text} onChange={event => setText(event.target.value)} disabled={busy} spellCheck="false" autoComplete="off" />
        </FormField>
        <p className="field-hint" aria-live="polite">{t('accountPrivacy.ready', { count: emails.length })}</p>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('accountPrivacy.searching') : t('accountPrivacy.search')}</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      <div role="status">{status && <p>{status}</p>}</div>
      {!!results?.length && <div className="grid" role="region" aria-label={t('accountPrivacy.resultsLabel')}>
        {results.map(musician => <MusicianCard key={musician.userId} musician={musician} />)}
      </div>}
    </section>
  );
}

export default function PrivacySettings() {
  const { t } = useI18n();
  const resource = useResource('/account/privacy', { events: 'privacy.changed' });
  const [discoverable, setDiscoverable] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (resource.data) setDiscoverable(resource.data.discoverableByEmail); }, [resource.data]);
  const toggle = async event => {
    const value = event.target.checked;
    setDiscoverable(value); setBusy(true); setError(''); setMessage('');
    try {
      const saved = await conduit.transmit('/account/privacy', { method: 'PUT', auth: true, body: { discoverableByEmail: value } });
      setDiscoverable(saved.discoverableByEmail); setMessage(t('accountPrivacy.saved'));
    } catch (failure) { setDiscoverable(!value); setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section account-trust" aria-labelledby="privacy-heading">
      <h2 className="heading-md" id="privacy-heading">{t('accountPrivacy.heading')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {discoverable === null && !resource.error ? <Spinner label={t('accountPrivacy.loading')} /> : discoverable !== null && <div className="card account-trust-card">
        <label className="checkbox-label"><input type="checkbox" checked={discoverable} onChange={toggle} disabled={busy} aria-describedby="discoverable-hint" />
          {t('accountPrivacy.discoverable')}</label>
        <p className="field-hint" id="discoverable-hint">{t('accountPrivacy.discoverableHint')}</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div role="status">{message && <p className="success">{message}</p>}</div>
      </div>}
      <FindPeople />
      <section className="card account-trust-card" aria-labelledby="media-permissions-heading">
        <h3 id="media-permissions-heading">{t('accountPrivacy.mediaHeading')}</h3>
        <p>{t('accountPrivacy.mediaText')}</p>
      </section>
    </section>
  );
}
