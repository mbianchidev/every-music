import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';
import FormField from '../FormField.jsx';
import ModalDialog from '../ModalDialog.jsx';
import { errorText } from '../../lib/error-text.js';

// Organizer tools on the event page: status changes (which post an official
// update for cancellations and postponements) and deletion.
export default function EventManageActions({ event, onChanged }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(event.scheduledStatus === 'scheduled' ? 'postponed' : 'scheduled');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const change = async submitted => {
    submitted.preventDefault();
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/gigs/${event.id}`, { method: 'PATCH', auth: true, body: { status, statusNote: note.trim() || null } });
      setOpen(false); setNote(''); setMessage(t('events.status.done'));
      onChanged();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(t('events.detail.deleteConfirm', { title: event.title }))) return;
    setBusy(true); setMessage('');
    try {
      await conduit.transmit(`/gigs/${event.id}`, { method: 'DELETE', auth: true });
      window.location.hash = '#my-events?tab=organizing';
    } catch (failure) { setMessage(''); setError(errorText(failure)); setBusy(false); }
  };
  const statuses = ['scheduled', 'postponed', 'cancelled'].filter(value => value !== event.scheduledStatus);
  return <>
    <div className="compact-actions">
      <a className="btn btn-secondary" href={`#edit-event?id=${event.id}`}>{t('events.detail.edit')}</a>
      {event.status !== 'completed' && <button className="btn btn-secondary" type="button" aria-haspopup="dialog" disabled={busy}
        onClick={() => { setOpen(true); setError(''); setStatus(statuses[0]); }}>{t('events.status.change')}</button>}
      <button className="btn btn-danger" type="button" disabled={busy} onClick={remove}>{t('events.detail.delete')}</button>
    </div>
    <div role="status">{message && <p className="success">{message}</p>}</div>
    {error && !open && <p className="error" role="alert">{error}</p>}
    <ModalDialog title={t('events.status.title')} open={open} onClose={() => setOpen(false)}>
      <p>{t('events.status.intro')}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={change}>
        <FormField id="event-status-choice" label={t('events.status.choose')} required>
          <select className="input" value={status} disabled={busy} onChange={changed => setStatus(changed.target.value)}>
            {statuses.map(value => <option key={value} value={value}>{t(`events.statuses.${value}`)}</option>)}
          </select>
        </FormField>
        <FormField id="event-status-note" label={t('events.status.note')} hint={t('events.status.noteHint')}>
          <textarea className="input" value={note} maxLength="4000" disabled={busy} onChange={changed => setNote(changed.target.value)} />
        </FormField>
        <button className={`btn ${status === 'cancelled' ? 'btn-danger' : 'btn-primary'}`} type="submit" disabled={busy}>
          {busy ? t('events.status.saving') : t('events.status.save')}</button>
      </form>
    </ModalDialog>
  </>;
}
