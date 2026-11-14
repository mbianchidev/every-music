import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { can, organizationHref } from '../lib/organizations.js';
import EntityPicker from './EntityPicker.jsx';
import { errorText } from '../lib/error-text.js';

// Booking agency rosters and label signings. Agencies and labels propose a
// band; a band manager accepts or declines from "Your pages".
export default function OrganizationRelations({ organization, onChanged }) {
  const { t } = useI18n();
  const agency = ['booking_agency', 'label'].includes(organization.kind);
  const manage = can(organization, 'manage_profile') && organization.managed;
  const managed = useResource(manage ? `/organizations/${organization.id}/relations` : null, { events: 'organizations.changed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const relations = organization.relations ?? [];
  const pending = (managed.data?.relations ?? []).filter(item => item.status === 'pending' && item.organization.id === organization.id);
  if (!agency && organization.kind !== 'band') return null;
  if (!agency && !relations.length) return null;
  const run = async (operation, success) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setMessage(success); onChanged(); managed.reload(); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const title = organization.kind === 'booking_agency' ? t('organizations.relations.roster')
    : organization.kind === 'label' ? t('organizations.relations.signed') : t('organizations.relations.partners');
  return (
    <section className="detail-section" aria-labelledby="relations-heading">
      <h2 className="heading-md" id="relations-heading" tabIndex="-1">{title}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {relations.length ? <ul className="inline-list">{relations.map(relation => {
        const other = relation.organization.id === organization.id ? relation.band : relation.organization;
        return <li key={relation.id}>
          <a href={organizationHref(other)}>{other.name}</a>{' '}
          <span className="body-muted">({t(`organizations.relations.kinds.${relation.kind}`)})</span>
          {manage && <button className="text-link" type="button" disabled={busy} onClick={() => {
            if (window.confirm(t('organizations.relations.confirmEnd', { name: other.name }))) {
              run(() => conduit.transmit(`/organizations/${organization.id}/relations/${relation.id}`, { method: 'DELETE', auth: true }), t('organizations.relations.ended'));
            }
          }}>{t('organizations.relations.end', { name: other.name })}</button>}
        </li>;
      })}</ul> : <p className="body-muted">{t('organizations.relations.empty')}</p>}
      {manage && managed.error && <p className="error" role="alert">{managed.error} <button className="text-link" type="button" onClick={managed.reload}>{t('organizations.common.retry')}</button></p>}
      {manage && agency && managed.data && <>
        {!!pending.length && <><h3>{t('organizations.relations.pending')}</h3><ul className="inline-list">{pending.map(relation => <li key={relation.id}>
          {relation.band.name} <span className="body-muted">({t('organizations.relations.awaiting')})</span>
          <button className="text-link" type="button" disabled={busy} onClick={() => run(() => conduit.transmit(`/organizations/${organization.id}/relations/${relation.id}`, { method: 'DELETE', auth: true }), t('organizations.relations.cancelled'))}>
            {t('organizations.relations.cancel', { name: relation.band.name })}
          </button>
        </li>)}</ul></>}
        <EntityPicker id="relation-picker" type="band" label={t('organizations.relations.find')} disabled={busy}
          exclude={[...relations.map(item => item.band.id), ...pending.map(item => item.band.id)]} actionLabel={t('organizations.relations.request')}
          onPick={bandId => run(() => conduit.transmit(`/organizations/${organization.id}/relations`, { method: 'POST', auth: true, body: { bandId } }), t('organizations.relations.requested'))} />
        <p className="field-hint">{t('organizations.relations.hint')}</p>
      </>}
    </section>
  );
}
