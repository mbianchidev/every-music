import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';
import FormField from '../FormField.jsx';
import ModalDialog from '../ModalDialog.jsx';

// Administrator removal of a listing. The API rechecks the live admin role,
// resolves open listing reports, notifies people, and writes the audit log.
export default function ListingModerationButton({ listing, onRemoved = () => {}, className = 'btn btn-danger' }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await conduit.transmit(`/admin/marketplace/listings/${listing.id}`, { method: 'DELETE', auth: true, body: { note } });
      setOpen(false); setNote('');
      onRemoved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <>
    <button className={className} type="button" aria-haspopup="dialog" aria-label={t('marketplace.moderation.removeLabel', { title: listing.title })}
      onClick={() => { setOpen(true); setError(''); }}>{t('marketplace.moderation.remove')}</button>
    <ModalDialog title={t('marketplace.moderation.dialogTitle')} open={open} onClose={() => setOpen(false)}>
      <p>{t('marketplace.moderation.dialogIntro', { title: listing.title })}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={submit}>
        <FormField id={`listing-moderation-note-${listing.id}`} label={t('marketplace.moderation.note')} hint={t('marketplace.moderation.noteHint')} required>
          <textarea className="input" value={note} onChange={event => setNote(event.target.value)} minLength="5" maxLength="2000" disabled={busy} />
        </FormField>
        <button className="btn btn-primary" type="submit" disabled={busy || note.trim().length < 5}>
          {busy ? t('marketplace.moderation.removing') : t('marketplace.moderation.confirm')}
        </button>
      </form>
    </ModalDialog>
  </>;
}
