import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { uploadImage } from '../lib/media.js';
import Spinner from './Spinner.jsx';
import ErrorState from './ErrorState.jsx';
import ImageInput from './ImageInput.jsx';
import ManagedImage from './ManagedImage.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';

export default function VerificationRequest() {
  const { t, formatDate } = useI18n();
  const resource = useResource('/verification/me', { events: 'verification.changed,profiles.changed' });
  const [selfie, setSelfie] = useState(null);
  const [documentScan, setDocumentScan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const data = resource.data;
  const request = data?.request;
  const submit = async event => {
    event.preventDefault();
    if (!selfie && !documentScan) { setError(t('profileVerification.needImage')); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      const [selfieMedia, documentMedia] = await Promise.all([selfie, documentScan].map(file => (file ? uploadImage(file, 'verification') : null)));
      await conduit.transmit('/verification/requests', { method: 'POST', auth: true, body: {
        challengeCode: data.challengeCode,
        ...(selfieMedia ? { selfieMediaId: selfieMedia.id } : {}),
        ...(documentMedia ? { documentMediaId: documentMedia.id } : {}),
      } });
      setSelfie(null); setDocumentScan(null); setRevision(value => value + 1);
      setMessage(t('profileVerification.submitted')); resource.reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/verification/requests/${request.id}`, { method: 'DELETE', auth: true });
      setMessage(t('profileVerification.cancelled')); resource.reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section account-trust" aria-labelledby="verification-heading">
      <h2 className="heading-md" id="verification-heading">{t('profileVerification.heading')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      <div role="status">{message && <p className="success">{message}</p>}</div>
      {!data && !resource.error ? <Spinner label={t('profileVerification.loading')} /> : data && (data.verifiedAt ? <div className="card account-trust-card">
        <p><VerifiedBadge verifiedAt={data.verifiedAt} label /></p>
        <p>{t('profileVerification.verified')} {t('profileVerification.verifiedOn', { date: formatDate(data.verifiedAt) })}</p>
      </div> : request?.status === 'pending' ? <div className="card account-trust-card">
        <p><strong>{t('profileVerification.status.pending', { date: formatDate(request.createdAt) })}</strong></p>
        {(request.selfieUrl || request.documentUrl) && <div className="verification-photos" role="group" aria-label={t('profileVerification.yourPhotos')}>
          {request.selfieUrl && <ManagedImage src={request.selfieUrl} authenticated alt={t('profileVerification.selfie')} width="160" height="120" />}
          {request.documentUrl && <ManagedImage src={request.documentUrl} authenticated alt={t('profileVerification.document')} width="160" height="120" />}
        </div>}
        <div><button className="btn btn-secondary" type="button" onClick={cancel} disabled={busy}>{t('profileVerification.cancel')}</button></div>
      </div> : <div className="card account-trust-card">
        {request && request.status !== 'cancelled' && <p><strong>{t(`profileVerification.status.${request.status}`, { date: formatDate(request.reviewedAt || request.createdAt) })}</strong></p>}
        {request?.reviewNote && <p>{t('profileVerification.note', { note: request.reviewNote })}</p>}
        {request && <p className="body-muted">{t('profileVerification.again')}</p>}
        <p>{t('profileVerification.intro')}</p>
        <p className="verification-code-block"><span className="field-label">{t('profileVerification.codeLabel')}</span>
          <span className="verification-code">{data.challengeCode}</span></p>
        <p className="field-hint">{t('profileVerification.codeHint')}</p>
        <form className="form-stack" onSubmit={submit} key={revision}>
          <ImageInput id="verification-selfie" label={t('profileVerification.selfie')} value={null} onChange={() => setSelfie(null)} onFile={setSelfie} disabled={busy} />
          <ImageInput id="verification-document" label={t('profileVerification.document')} value={null} onChange={() => setDocumentScan(null)} onFile={setDocumentScan} disabled={busy} />
          <p className="field-hint">{t('profileVerification.documentHint')} {t('profileVerification.privacy', { count: data.retentionDays })}</p>
          <button className="btn btn-primary" type="submit" disabled={busy || (!selfie && !documentScan)}>{busy ? t('profileVerification.submitting') : t('profileVerification.submit')}</button>
        </form>
      </div>)}
    </section>
  );
}
