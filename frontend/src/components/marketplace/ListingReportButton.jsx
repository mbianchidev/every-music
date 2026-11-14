import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';
import FormField from '../FormField.jsx';
import ModalDialog from '../ModalDialog.jsx';

export default function ListingReportButton({ listing }) {
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
      await conduit.transmit(`/marketplace/listings/${listing.id}/reports`, { method: 'POST', auth: true, body: { category, details, consent } });
      setOpen(false); setDetails(''); setConsent(false);
      setSuccess(t('marketplace.report.success'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <>
    <button className="text-link" type="button" aria-haspopup="dialog" onClick={() => {
      setOpen(true); setConsent(false); setError(''); setSuccess('');
    }}>{t('marketplace.report.button')}</button>
    {success && <p className="field-hint" role="status">{success} <a href="#reports">{t('marketplace.report.yourReports')}</a></p>}
    <ModalDialog title={t('marketplace.report.title')} open={open} onClose={() => setOpen(false)}>
      <p>{t('marketplace.report.intro', { title: listing.title })}</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={submit}>
        <FormField id={`listing-report-reason-${listing.id}`} label={t('marketplace.report.reason')} required>
          <select className="input" value={category} onChange={event => setCategory(event.target.value)} disabled={busy}>
            {['spam', 'harassment', 'threats', 'other'].map(value => <option key={value} value={value}>{t(`marketplace.report.reasons.${value}`)}</option>)}
          </select>
        </FormField>
        <FormField id={`listing-report-details-${listing.id}`} label={t('marketplace.report.details')} required hint={t('marketplace.report.detailsHint')}>
          <textarea className="input" value={details} onChange={event => setDetails(event.target.value)} minLength="5" maxLength="2000" disabled={busy} />
        </FormField>
        <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={busy} />
          {t('marketplace.report.consent')}
        </label>
        <button className="btn btn-primary" type="submit" disabled={busy || !consent || details.trim().length < 5}>
          {busy ? t('marketplace.report.submitting') : t('marketplace.report.submit')}
        </button>
      </form>
    </ModalDialog>
  </>;
}
