import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { uploadImage } from '../lib/media.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import { errorText } from '../lib/error-text.js';

// Lets the leader of a page ask administrators to verify it. Requests share
// the verification queue with profile verification.
export default function OrganizationVerificationRequest({ organization }) {
  const { t, formatDate } = useI18n();
  const leader = organization.viewer?.role === 'leader';
  const resource = useResource(leader && !organization.verified ? `/organizations/${organization.id}/verification-request` : null,
    { events: 'verification.changed,organizations.changed' });
  const [note, setNote] = useState('');
  const [document, setDocument] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  if (!leader || organization.verified) return null;
  const choose = async changed => {
    const file = changed.target.files[0];
    changed.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError(t('organizationVerification.documentType')); return; }
    setBusy(true); setError('');
    try { setDocument(await uploadImage(file, 'verification')); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const submit = async submitted => {
    submitted.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/verification-request`, {
        method: 'POST', auth: true, body: { note, documentMediaId: document?.id ?? null },
      });
      setNote(''); setDocument(null); setMessage(t('organizationVerification.submitted'));
      resource.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/verification-request/${resource.data.request.id}`, { method: 'DELETE', auth: true });
      setMessage(t('organizationVerification.cancelled'));
      resource.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const request = resource.data?.request;
  return (
    <section className="detail-section organization-verification" aria-labelledby="organization-verification-heading">
      <h2 className="heading-md" id="organization-verification-heading">{t('organizationVerification.heading')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('organizationVerification.loading')} /> : resource.data && <>
        <p>{t('organizationVerification.intro', { name: organization.name })}</p>
        {request?.status === 'pending' ? <>
          <p className="status-message">{t('organizationVerification.pending', { date: formatDate(request.createdAt) })}</p>
          <div><button className="btn btn-secondary" type="button" disabled={busy} onClick={cancel}>{t('organizationVerification.cancel')}</button></div>
        </> : <form className="form-stack" onSubmit={submit}>
          {request?.status === 'rejected' && <p className="status-message">{t('organizationVerification.rejected', { note: request.reviewNote || '' })}</p>}
          <p className="verification-code-inline">{t('organizationVerification.code', { code: resource.data.challengeCode })}</p>
          <p className="field-hint">{t('organizationVerification.codeHint')}</p>
          <FormField id="organization-verification-note" label={t('organizationVerification.note')} hint={t('organizationVerification.noteHint')} required>
            <textarea className="input" value={note} minLength="10" maxLength="2000" disabled={busy} onChange={changed => setNote(changed.target.value)} />
          </FormField>
          <FormField id="organization-verification-document" label={t('organizationVerification.document')} hint={t('organizationVerification.documentHint')}>
            <input className="input" type="file" accept="image/jpeg,image/png" disabled={busy} onChange={choose} />
          </FormField>
          {document && <p role="status">{t('organizationVerification.documentReady')}</p>}
          <div><button className="btn btn-primary" type="submit" disabled={busy || note.trim().length < 10}>
            {busy ? t('organizationVerification.submitting') : t('organizationVerification.submit')}</button></div>
        </form>}
      </>}
      <div role="status">{message && <p className="success">{message}</p>}</div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
