import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import FormField from './FormField.jsx';
import ModalDialog from './ModalDialog.jsx';
import { errorText } from '../lib/error-text.js';

export default function ClaimVenue({ organization, onChanged }) {
  const { t, formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const claim = organization.viewer?.claim;
  if (organization.managed) return null;
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/claims`, { method: 'POST', auth: true, body: { message: text } });
      setOpen(false); setText(''); onChanged();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <div className="claim-venue">
      <p>{t('organizations.claim.explanation')}</p>
      {claim?.status === 'pending' ? <p className="status-message" role="status">{t('organizations.claim.pending', { date: formatDate(claim.createdAt) })}</p> : <>
        {claim?.status === 'rejected' && <p className="body-muted">{t('organizations.claim.rejected')}</p>}
        <button className="btn btn-secondary" type="button" aria-haspopup="dialog" onClick={() => { setOpen(true); setError(''); }}>{t('organizations.claim.button')}</button>
      </>}
      <ModalDialog title={t('organizations.claim.title')} open={open} onClose={() => setOpen(false)}>
        <p>{t('organizations.claim.dialogIntro', { name: organization.name })}</p>
        {error && <p className="field-error" role="alert">{error}</p>}
        <form className="form-stack" onSubmit={submit}>
          <FormField id="claim-message" label={t('organizations.claim.message')} required hint={t('organizations.claim.hint')}>
            <textarea className="input" value={text} minLength="10" maxLength="2000" disabled={busy} onChange={event => setText(event.target.value)} />
          </FormField>
          <button className="btn btn-primary" type="submit" disabled={busy || text.trim().length < 10}>{busy ? t('organizations.common.saving') : t('organizations.claim.submit')}</button>
        </form>
      </ModalDialog>
    </div>
  );
}
