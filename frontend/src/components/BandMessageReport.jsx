import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import FormField from './FormField.jsx';
import ModalDialog from './ModalDialog.jsx';
import { errorText } from '../lib/error-text.js';

const CATEGORIES = ['spam', 'harassment', 'threats', 'inappropriate_language', 'fake_profile', 'other'];

// Reports a decrypted band chat message with its sender-signed record.
export default function BandMessageReport({ organizationId, message, senderName, body, signedEvidence }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('spam');
  const [details, setDetails] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await conduit.transmit(`/organizations/${organizationId}/chat/messages/${message.id}/reports`, {
        method: 'POST', auth: true, body: { category, details, signedEvidence, consent },
      });
      setOpen(false); setDetails(''); setConsent(false); setSuccess(t('bandChat.report.done'));
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return <>
    <button className="text-link" type="button" aria-haspopup="dialog" onClick={() => { setOpen(true); setConsent(false); setError(''); setSuccess(''); }}>
      {t('bandChat.report.open')}
    </button>
    {success && <p className="field-hint" role="status">{success} <a href="#reports">{t('bandChat.report.yourReports')}</a></p>}
    <ModalDialog title={t('bandChat.report.title')} open={open} onClose={() => setOpen(false)} fallbackFocusId={`band-message-${message.id}`}>
      <p>{t('bandChat.report.intro', { name: senderName })}</p>
      {body && <blockquote className="reported-excerpt">{body}</blockquote>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={submit}>
        <FormField id={`band-report-category-${message.id}`} label={t('bandChat.report.reason')} required>
          <select className="input" value={category} disabled={busy} onChange={event => setCategory(event.target.value)}>
            {CATEGORIES.map(value => <option key={value} value={value}>{t(`bandChat.report.categories.${value}`)}</option>)}
          </select>
        </FormField>
        <FormField id={`band-report-details-${message.id}`} label={t('bandChat.report.details')} hint={t('bandChat.report.detailsHint')} required>
          <textarea className="input" value={details} minLength="5" maxLength="2000" disabled={busy} onChange={event => setDetails(event.target.value)} />
        </FormField>
        <label className="checkbox-label"><input type="checkbox" checked={consent} required disabled={busy} onChange={event => setConsent(event.target.checked)} />
          {t('bandChat.report.consent')}</label>
        <button className="btn btn-primary" type="submit" disabled={busy || !consent || details.trim().length < 5}>
          {busy ? t('bandChat.report.submitting') : t('bandChat.report.submit')}
        </button>
      </form>
    </ModalDialog>
  </>;
}
