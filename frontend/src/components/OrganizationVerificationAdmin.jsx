import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useDebounced, useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';
import { errorText } from '../lib/error-text.js';

// Administrator verification toggle for pages; every change is audited.
export default function OrganizationVerificationAdmin() {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const debounced = useDebounced(term.trim());
  const resource = useResource(debounced.length >= 2 ? `/organizations?q=${encodeURIComponent(debounced)}&pageSize=10` : null, { events: 'organizations.changed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const toggle = async organization => {
    const verified = !organization.verified;
    if (!window.confirm(t(verified ? 'organizations.admin.confirmVerify' : 'organizations.admin.confirmUnverify', { name: organization.name }))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/admin/organizations/${organization.id}/verification`, { method: 'PUT', auth: true, body: { verified } });
      setMessage(t(verified ? 'organizations.admin.verified' : 'organizations.admin.unverified', { name: organization.name })); resource.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="verification-heading">
      <h2 className="heading-md" id="verification-heading">{t('organizations.admin.verificationTitle')}</h2>
      <p className="body-muted">{t('organizations.admin.verificationIntro')}</p>
      <FormField id="verification-search" label={t('organizations.admin.findPage')}>
        <input className="input" type="search" value={term} maxLength="200" onChange={event => setTerm(event.target.value)} />
      </FormField>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {resource.error && <p className="error" role="alert">{resource.error}</p>}
      {resource.data && (resource.data.organizations.length ? <ul className="stack">{resource.data.organizations.map(organization => (
        <li className="card verification-row" key={organization.id}>
          <span><a href={`#organization?id=${organization.id}`}>{organization.name}</a> ({t(`organizations.kinds.${organization.kind}`)}) <VerifiedBadge verified={organization.verified} /></span>
          <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => toggle(organization)}>
            {organization.verified ? t('organizations.admin.unverify', { name: organization.name }) : t('organizations.admin.verify', { name: organization.name })}
          </button>
        </li>
      ))}</ul> : <p>{t('organizations.admin.noPages')}</p>)}
    </section>
  );
}
