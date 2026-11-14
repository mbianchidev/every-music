import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';
import { COMMUNICATION_KINDS } from '../../lib/events.js';
import FormField from '../FormField.jsx';
import { errorText } from '../../lib/error-text.js';

// Official updates from the organizers, shown near the top of the event page.
export default function EventCommunications({ event }) {
  const { t, formatDate } = useI18n();
  const items = event.communications || [];
  if (!items.length) return null;
  return (
    <section className="detail-section event-communications" aria-labelledby="event-communications-heading">
      <h2 className="heading-md" id="event-communications-heading">{t('events.communications.heading')}</h2>
      <ol className="communication-list">
        {items.map(item => <li key={item.id} className={`communication communication-${item.kind}`}>
          <p className="eyebrow">{t(`events.communications.kinds.${item.kind}`)}
            {' / '}<time dateTime={item.createdAt}>{formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></p>
          {item.automatic && <p><strong>{t(`events.communications.automatic.${item.kind}`)}</strong></p>}
          {item.body && <p className="detail-text">{item.body}</p>}
          {item.authorName && <p className="body-muted">{t('events.communications.by', { name: item.authorName })}</p>}
        </li>)}
      </ol>
    </section>
  );
}

// Organizers send official updates to everyone going or interested.
export function EventCommunicationForm({ event, onChanged }) {
  const { t } = useI18n();
  const [kind, setKind] = useState('door_open');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (!event.viewer.canEdit || event.visibility !== 'published') return null;
  const send = async submitted => {
    submitted.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/gigs/${event.id}/communications`, { method: 'POST', auth: true, body: { kind, body } });
      setBody(''); setMessage(t('events.communications.sent'));
      onChanged();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="event-communication-form-heading">
      <h2 className="heading-md" id="event-communication-form-heading">{t('events.communications.compose')}</h2>
      <form className="form-stack communication-form" onSubmit={send}>
        <FormField id="communication-kind" label={t('events.communications.kind')}>
          <select className="input" value={kind} disabled={busy} onChange={changed => setKind(changed.target.value)}>
            {COMMUNICATION_KINDS.map(value => <option key={value} value={value}>{t(`events.communications.kinds.${value}`)}</option>)}
          </select>
        </FormField>
        <FormField id="communication-body" label={t('events.communications.body')} hint={t('events.communications.bodyHint')} required>
          <textarea className="input" value={body} maxLength="4000" disabled={busy} onChange={changed => setBody(changed.target.value)} />
        </FormField>
        <div><button className="btn btn-primary" type="submit" disabled={busy || !body.trim()}>
          {busy ? t('events.communications.sending') : t('events.communications.send')}</button></div>
      </form>
      <div role="status">{message && <p className="success">{message}</p>}</div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
