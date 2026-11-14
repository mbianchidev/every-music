import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';
import Pagination from './Pagination.jsx';
import { errorText } from '../lib/error-text.js';

// Administrator queue for claims on community-maintained venues. Decisions
// are audited by the API and notify every affected claimant.
export default function OrganizationClaimReview() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const resource = useResource(`/admin/organization-claims?status=${status}&page=${page}&pageSize=10`, { events: 'admin.changed,organizations.changed' });
  const [notes, setNotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const decide = async (claim, decision) => {
    if (!window.confirm(t(`organizations.admin.confirm.${decision}`, { name: claim.claimant.name, venue: claim.organization.name }))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/admin/organization-claims/${claim.id}`, { method: 'PATCH', auth: true, body: { decision, note: notes[claim.id]?.trim() || null } });
      setMessage(t(`organizations.admin.decided.${decision}`, { venue: claim.organization.name })); resource.reload();
      document.getElementById('claims-heading')?.focus();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="claims-heading">
      <h2 className="heading-md" id="claims-heading" tabIndex="-1">{t('organizations.admin.claimsTitle')}</h2>
      <p className="body-muted">{t('organizations.admin.claimsIntro')}</p>
      <FormField id="claim-status" label={t('organizations.admin.status')}>
        <select className="input" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          {['pending', 'approved', 'rejected', ''].map(value => <option key={value} value={value}>{t(`organizations.admin.statuses.${value || 'all'}`)}</option>)}
        </select>
      </FormField>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {resource.error && <p className="error" role="alert">{resource.error} <button className="text-link" type="button" onClick={resource.reload}>{t('organizations.common.retry')}</button></p>}
      {resource.data && (!resource.data.claims.length ? <p>{t('organizations.admin.noClaims')}</p> : <ul className="stack">{resource.data.claims.map(claim => (
        <li className="card" key={claim.id}>
          <h3><a href={`#organization?id=${claim.organization.id}`}>{claim.organization.name}</a></h3>
          <p>{t('organizations.admin.claimBy', { name: claim.claimant.name, date: formatDate(claim.createdAt) })} <a href={`#musician?id=${claim.claimant.userId}`}>{t('organizations.admin.viewProfile')}</a></p>
          <blockquote className="reported-excerpt">{claim.message}</blockquote>
          <p className="body-muted">{t(`organizations.admin.statuses.${claim.status}`)}{claim.reviewNote && ` / ${claim.reviewNote}`}</p>
          {claim.status === 'pending' && <div className="form-stack">
            <FormField id={`claim-note-${claim.id}`} label={t('organizations.admin.note')} hint={t('organizations.admin.noteHint')}>
              <textarea className="input" value={notes[claim.id] ?? ''} maxLength="2000" disabled={busy} onChange={event => setNotes({ ...notes, [claim.id]: event.target.value })} />
            </FormField>
            <div className="button-row">
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => decide(claim, 'approve')}>{t('organizations.admin.approve', { venue: claim.organization.name })}</button>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => decide(claim, 'reject')}>{t('organizations.admin.reject', { venue: claim.organization.name })}</button>
            </div>
          </div>}
        </li>
      ))}</ul>)}
      <Pagination pagination={resource.data?.pagination} onPage={setPage} disabled={resource.loading} label={t('organizations.admin.claimPages')} />
    </section>
  );
}
