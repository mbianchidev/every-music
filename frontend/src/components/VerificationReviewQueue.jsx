import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import Spinner from './Spinner.jsx';
import ErrorState from './ErrorState.jsx';
import FormField from './FormField.jsx';
import Pagination from './Pagination.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';

// Loads evidence through the audited administrator media route.
function EvidenceImage({ requestId, mediaId, alt }) {
  const { t } = useI18n();
  const [state, setState] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    let url;
    conduit.transmit(`/admin/verification-requests/${requestId}/media/${mediaId}`, { auth: true, stream: true, signal: controller.signal })
      .then(response => response.blob())
      .then(blob => { if (!controller.signal.aborted) { url = URL.createObjectURL(blob); setState({ url }); } })
      .catch(failure => { if (!controller.signal.aborted) setState({ error: failure.message }); });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [requestId, mediaId]);
  if (state.error) return <p className="field-error" role="alert">{t('profileVerification.admin.imageError', { message: state.error })}</p>;
  if (!state.url) return <p role="status">{t('profileVerification.admin.loadingPhoto')}</p>;
  return <img src={state.url} alt={alt} width="240" height="180" />;
}

function RequestCard({ request, onDecided }) {
  const { t, formatDate } = useI18n();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const name = request.artistName;
  const decide = decision => async () => {
    setBusy(true); setError('');
    try {
      const result = await conduit.transmit(`/admin/verification-requests/${request.id}`, { method: 'PATCH', auth: true, body: { decision, note } });
      onDecided(t(`profileVerification.admin.decided.${result.status}`, { name }));
    } catch (failure) { setError(failure.message); setBusy(false); }
  };
  const revoke = async () => {
    if (!window.confirm(t('profileVerification.admin.revokeConfirm', { name }))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/admin/users/${request.subjectId}/verification`, { method: 'DELETE', auth: true });
      onDecided(t('profileVerification.admin.revoked', { name }));
    } catch (failure) { setError(failure.message); setBusy(false); }
  };
  const photos = [[request.selfieMediaId, 'selfieAlt'], [request.documentMediaId, 'documentAlt']].filter(([id]) => id);
  return (
    <li className="card account-trust-card">
      <h4><a href={`#musician?id=${request.subjectId}`}>{name}</a><VerifiedBadge verifiedAt={request.verifiedAt} /></h4>
      <p className="body-muted">{t('profileVerification.admin.requested', { date: formatDate(request.createdAt) })}
        {' / '}{t('profileVerification.admin.statusLine', { status: t(`profileVerification.admin.statuses.${request.status}`) })}</p>
      <p className="verification-code-inline">{t('profileVerification.admin.code', { code: request.challengeCode })}</p>
      {request.reviewNote && <p className="detail-text">{request.reviewNote}</p>}
      {photos.length ? <>
        <div><button className="btn btn-secondary" type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
          {open ? t('profileVerification.admin.hidePhotos') : t('profileVerification.admin.showPhotos', { name })}
        </button></div>
        {open && <div className="verification-photos">{photos.map(([id, altKey]) => (
          <EvidenceImage key={id} requestId={request.id} mediaId={id} alt={t(`profileVerification.admin.${altKey}`, { name })} />
        ))}</div>}
      </> : <p className="body-muted">{t('profileVerification.admin.noPhotos')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {request.status === 'pending' && <form className="form-stack" onSubmit={event => event.preventDefault()}>
        <FormField id={`verification-note-${request.id}`} label={t('profileVerification.admin.noteLabel')} hint={t('profileVerification.admin.noteHint')} required>
          <textarea className="input" value={note} onChange={event => setNote(event.target.value)} minLength="5" maxLength="2000" disabled={busy} />
        </FormField>
        <div className="compact-actions">
          <button className="btn btn-primary" type="button" disabled={busy || note.trim().length < 5} onClick={decide('approve')}>{busy ? t('profileVerification.admin.deciding') : t('profileVerification.admin.approve')}</button>
          <button className="btn btn-danger" type="button" disabled={busy || note.trim().length < 5} onClick={decide('reject')}>{t('profileVerification.admin.reject')}</button>
        </div>
      </form>}
      {request.status === 'approved' && request.verifiedAt && <div>
        <button className="btn btn-secondary" type="button" disabled={busy} onClick={revoke}>{t('profileVerification.admin.revoke')}</button>
      </div>}
    </li>
  );
}

export default function VerificationReviewQueue() {
  const { t } = useI18n();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const resource = useResource(`/admin/verification-requests?status=${status}&page=${page}&pageSize=10`, { events: 'admin.changed' });
  const decided = text => { setMessage(text); resource.reload(); document.getElementById('verification-queue-heading')?.focus(); };
  return (
    <section className="detail-section account-trust" aria-labelledby="verification-queue-heading">
      <h2 className="heading-md" id="verification-queue-heading" tabIndex="-1">{t('profileVerification.admin.heading')}</h2>
      <p className="body-muted">{t('profileVerification.admin.intro')}</p>
      <FormField id="verification-status" label={t('profileVerification.admin.status')}>
        <select className="input" value={status} onChange={event => { setStatus(event.target.value); setPage(1); setMessage(''); }}>
          {['pending', 'approved', 'rejected', 'cancelled'].map(value => <option key={value} value={value}>{t(`profileVerification.admin.statuses.${value}`)}</option>)}
          <option value="">{t('profileVerification.admin.statuses.all')}</option>
        </select>
      </FormField>
      <div role="status">{message && <p className="success">{message}</p>}</div>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('profileVerification.admin.loading')} /> : resource.data && <>
        {!resource.data.requests.length ? <p>{t('profileVerification.admin.empty')}</p>
          : <ul className="verification-queue">{resource.data.requests.map(request => <RequestCard key={request.id} request={request} onDecided={decided} />)}</ul>}
        <Pagination pagination={resource.data.pagination} disabled={resource.loading} onPage={setPage} label={t('profileVerification.admin.pages')} />
      </>}
    </section>
  );
}
