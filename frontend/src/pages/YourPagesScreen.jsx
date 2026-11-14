import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { ORGANIZATION_KINDS, organizationHref } from '../lib/organizations.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Pagination from '../components/Pagination.jsx';
import OrganizationCard from '../components/OrganizationCard.jsx';
import { PostList } from '../components/OrganizationPosts.jsx';
import Icon from '../components/Icon.jsx';
import { errorText } from '../lib/error-text.js';

export default function YourPagesScreen() {
  const { t } = useI18n();
  const resource = useResource('/organizations/mine', { events: 'organizations.changed' });
  const [page, setPage] = useState(1);
  const updates = useResource(`/organizations/updates?page=${page}&pageSize=10`, { events: 'organizations.changed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const run = async (operation, success, focus) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await operation(); setMessage(success); resource.reload();
      document.getElementById(focus)?.focus();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const data = resource.data;
  return (
    <div className="container">
      <PageHeader eyebrow={t('organizations.yours.eyebrow')} title={t('organizations.yours.title')} subtitle={t('organizations.yours.subtitle')}
        actions={<a className="btn btn-primary" href="#create-organization"><Icon name="plus" size={17} />{t('organizations.yours.create')}</a>} />
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!data && !resource.error ? <Spinner label={t('organizations.yours.loading')} /> : data && <>
        <section className="detail-section" aria-labelledby="invitations-heading">
          <h2 className="heading-md" id="invitations-heading" tabIndex="-1">{t('organizations.yours.invitations')}</h2>
          {!data.invitations.length ? <p className="body-muted">{t('organizations.yours.noInvitations')}</p>
            : <ul className="stack">{data.invitations.map(invitation => <li className="card" key={invitation.organization.id}>
              <h3><a href={organizationHref(invitation.organization)}>{invitation.organization.name}</a></h3>
              <p>{t('organizations.yours.invitationText', {
                kind: t(`organizations.kinds.${invitation.organization.kind}`), role: t(`organizations.roles.${invitation.role}`),
                name: invitation.inviterName || t('organizations.page.someone'),
              })}{invitation.title && ` (${invitation.title})`}</p>
              <div className="compact-actions">
                <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(() => conduit.transmit(`/organizations/${invitation.organization.id}/invitation`, {
                  method: 'PATCH', auth: true, body: { response: 'accept' },
                }), t('organizations.yours.accepted', { name: invitation.organization.name }), 'pages-heading')}>{t('organizations.yours.accept', { name: invitation.organization.name })}</button>
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => run(() => conduit.transmit(`/organizations/${invitation.organization.id}/invitation`, {
                  method: 'PATCH', auth: true, body: { response: 'decline' },
                }), t('organizations.yours.declined', { name: invitation.organization.name }), 'invitations-heading')}>{t('organizations.yours.decline', { name: invitation.organization.name })}</button>
              </div>
            </li>)}</ul>}
        </section>
        {!!data.relationRequests.length && <section className="detail-section" aria-labelledby="requests-heading">
          <h2 className="heading-md" id="requests-heading" tabIndex="-1">{t('organizations.yours.requests')}</h2>
          <ul className="stack">{data.relationRequests.map(request => <li className="card" key={request.id}>
            <p>{t(`organizations.yours.request.${request.kind}`, { organization: request.organization.name, band: request.band.name })}</p>
            <div className="compact-actions">
              <a href={organizationHref(request.organization)}>{t('organizations.yours.viewPage', { name: request.organization.name })}</a>
              <button className="btn btn-primary" type="button" disabled={busy} onClick={() => run(() => conduit.transmit(`/organizations/${request.band.id}/relations/${request.id}`, {
                method: 'PATCH', auth: true, body: { response: 'accept' },
              }), t('organizations.yours.requestAccepted'), 'requests-heading')}>{t('organizations.yours.acceptRequest', { name: request.organization.name })}</button>
              <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => run(() => conduit.transmit(`/organizations/${request.band.id}/relations/${request.id}`, {
                method: 'PATCH', auth: true, body: { response: 'decline' },
              }), t('organizations.yours.requestDeclined'), 'requests-heading')}>{t('organizations.yours.declineRequest', { name: request.organization.name })}</button>
            </div>
          </li>)}</ul>
        </section>}
        <section className="detail-section" aria-labelledby="pages-heading">
          <h2 className="heading-md" id="pages-heading" tabIndex="-1">{t('organizations.yours.pages')}</h2>
          {!data.organizations.length ? <div className="card empty-state">
            <p className="body-muted">{t('organizations.yours.noPages')}</p>
            <div className="compact-actions">{ORGANIZATION_KINDS.map(kind => <a key={kind} href={`#create-organization?kind=${kind}`}>{t('organizations.yours.createKind', { kind: t(`organizations.kinds.${kind}`) })}</a>)}</div>
          </div> : <div className="grid">{data.organizations.map(organization => <OrganizationCard key={organization.id} organization={organization}>
            <span className="body-muted">{t(`organizations.roles.${organization.role}`)}{organization.title && ` / ${organization.title}`}</span>
            <span className="card-actions">
              {organization.permissions.includes('manage_profile') && <a className="text-link" href={`#edit-organization?id=${organization.id}`}>{t('organizations.yours.edit', { name: organization.name })}</a>}
              {organization.role !== 'maintainer' && <a className="text-link" href={`#organization-members?id=${organization.id}`}>{t('organizations.yours.members', { name: organization.name })}</a>}
            </span>
          </OrganizationCard>)}</div>}
        </section>
      </>}
      <section className="detail-section" aria-labelledby="updates-heading">
        <h2 className="heading-md" id="updates-heading" tabIndex="-1">{t('organizations.yours.updates')}</h2>
        {updates.error && <ErrorState message={updates.error} onRetry={updates.reload} />}
        {!updates.data && !updates.error ? <Spinner label={t('organizations.posts.loading')} /> : updates.data && <>
          {!updates.data.posts.length && <p className="body-muted">{t('organizations.yours.noUpdates')} <a href="#organizations">{t('organizations.yours.discover')}</a></p>}
          <PostList posts={updates.data.posts} showOrganization />
          <Pagination pagination={updates.data.pagination} disabled={updates.loading} label={t('organizations.posts.pages')}
            onPage={value => { setPage(value); document.getElementById('updates-heading')?.focus(); }} />
        </>}
      </section>
    </div>
  );
}
