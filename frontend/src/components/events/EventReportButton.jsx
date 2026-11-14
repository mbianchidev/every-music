import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';
import FormField from '../FormField.jsx';
import ModalDialog from '../ModalDialog.jsx';

const REASONS = ['spam', 'harassment', 'threats', 'inappropriate_language', 'other'];

// Reports an event (`post` omitted) or one discussion message to the
// administrators through the shared report queue.
export default function EventReportButton({ event, post }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('spam');
  const [details, setDetails] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const id = post ? `post-${post.id}` : `event-${event.id}`;
  const submit = async submitted => {
    submitted.preventDefault(); setBusy(true); setError('');
    try {
      await conduit.transmit(post ? `/gigs/${event.id}/posts/${post.id}/reports` : `/gigs/${event.id}/reports`, {
        method: 'POST', auth: true, body: { category, details, consent },
      });
      setOpen(false); setDetails(''); setConsent(false); setSuccess(t('events.report.success'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const title = t(post ? 'events.report.postTitle' : 'events.report.title');
  return <>
    <button className="text-link" type="button" aria-haspopup="dialog" onClick={() => { setOpen(true); setConsent(false); setError(''); setSuccess(''); }}>
      {post ? t('events.report.post', { name: post.author.name }) : t('events.report.event')}</button>
    {success && <p className="field-hint" role="status">{success} <a href="#reports">{t('events.report.yourReports')}</a></p>}
    <ModalDialog title={title} open={open} onClose={() => setOpen(false)}>
      <p>{post ? t('events.report.postIntro', { name: post.author.name }) : t('events.report.intro', { title: event.title })}</p>
      {post && <blockquote className="reported-excerpt">{post.body}</blockquote>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={submit}>
        <FormField id={`report-reason-${id}`} label={t('events.report.reason')} required>
          <select className="input" value={category} onChange={changed => setCategory(changed.target.value)} disabled={busy}>
            {REASONS.map(value => <option key={value} value={value}>{t(`events.report.reasons.${value}`)}</option>)}
          </select>
        </FormField>
        <FormField id={`report-details-${id}`} label={t('events.report.details')} required hint={t('events.report.detailsHint')}>
          <textarea className="input" value={details} onChange={changed => setDetails(changed.target.value)} minLength="5" maxLength="2000" disabled={busy} />
        </FormField>
        <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={changed => setConsent(changed.target.checked)} required disabled={busy} />
          {t(post ? 'events.report.postConsent' : 'events.report.consent')}</label>
        <button className="btn btn-primary" type="submit" disabled={busy || !consent || details.trim().length < 5}>
          {busy ? t('events.report.submitting') : t('events.report.submit')}</button>
      </form>
    </ModalDialog>
  </>;
}
