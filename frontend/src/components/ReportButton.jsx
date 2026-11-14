import { useState } from 'react';
import conduit from '../lib/conduit.js';
import FormField from './FormField.jsx';
import ModalDialog from './ModalDialog.jsx';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

export default function ReportButton({ userId, name, message, label }) {
  const { t } = useI18n();
  const title = label || (message ? t('ui.report.message') : t('ui.report.musician'));
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
      await conduit.transmit('/reports', { method: 'POST', auth: true, body: {
        reportedUserId: userId, category, details, consent,
        ...(message ? { messageId: message.id, ...(message.signedEvidence ? { signedEvidence: message.signedEvidence } : {}) } : {}),
      } });
      setOpen(false); setDetails(''); setConsent(false);
      setSuccess(t('ui.report.submitted'));
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return <>
    <button className="text-link" type="button" aria-haspopup="dialog" onClick={() => { setOpen(true); setConsent(false); setError(''); setSuccess(''); }}>{title}</button>
    {success && <p className="field-hint" role="status">{success} <a href="#reports">{t('app.nav.reports')}</a></p>}
    <ModalDialog title={title} open={open} onClose={() => setOpen(false)}>
      <p>{t('ui.report.intro', { name: name || t('ui.report.thisMusician') })}</p>
      {message && <blockquote className="reported-excerpt">{message.body}</blockquote>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={submit}>
        <FormField id={`report-category-${message?.id || userId}`} label={t('ui.report.reason')} required>
          <select className="input" value={category} onChange={event => setCategory(event.target.value)} disabled={busy}>
            <option value="spam">{t('ui.report.categories.spam')}</option><option value="harassment">{t('ui.report.categories.harassment')}</option><option value="threats">{t('ui.report.categories.threats')}</option>
            <option value="inappropriate_language">{t('profileExtras.reports.inappropriateLanguage')}</option>
            <option value="fake_profile">{t('profileExtras.reports.fakeProfile')}</option><option value="other">{t('ui.report.categories.other')}</option>
          </select>
        </FormField>
        <FormField id={`report-details-${message?.id || userId}`} label={t('ui.report.details')} required hint={t('ui.report.detailsHint')}>
          <textarea className="input" value={details} onChange={event => setDetails(event.target.value)} minLength="5" maxLength="2000" disabled={busy} />
        </FormField>
        <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={busy} />
          {message ? t('ui.report.consentMessage') : t('ui.report.consent')}
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy || !consent || details.trim().length < 5}>{busy ? t('ui.report.submitting') : t('ui.report.submit')}</button>
      </form>
    </ModalDialog>
  </>;
}
