import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { can, organizationHref } from '../lib/organizations.js';
import EntityPicker from './EntityPicker.jsx';

function reasonText(t, reason) {
  return t(`organizations.similar.reasons.${reason.reason}`, { count: reason.count ?? 0 });
}

// "For fans of": picks chosen by the band plus explained suggestions from
// shared genres, shared members, and proximity. Spotify data is not used.
export default function SimilarBands({ organization, onChanged }) {
  const { t } = useI18n();
  const suggestions = useResource(`/organizations/${organization.id}/suggestions`, { events: 'organizations.changed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const manage = can(organization, 'manage_profile');
  const picks = organization.similar ?? [];
  const save = async (ids, success) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/similar`, { method: 'PUT', auth: true, body: { bandIds: ids } });
      setMessage(success); onChanged(); suggestions.reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="similar-heading">
      <h2 className="heading-md" id="similar-heading" tabIndex="-1">{t('organizations.similar.title')}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {picks.length ? <ul className="inline-list">{picks.map(band => <li key={band.id}>
        <a href={organizationHref(band)}>{band.name}</a>
        {manage && <button className="text-link" type="button" disabled={busy} onClick={() => save(picks.filter(item => item.id !== band.id).map(item => item.id), t('organizations.similar.removed'))}>
          {t('organizations.similar.remove', { name: band.name })}
        </button>}
      </li>)}</ul> : <p className="body-muted">{t('organizations.similar.empty')}</p>}
      {manage && picks.length < 10 && <EntityPicker id="similar-picker" type="band" label={t('organizations.similar.find')} disabled={busy}
        exclude={[organization.id, ...picks.map(item => item.id)]} actionLabel={t('organizations.similar.add')}
        onPick={id => save([...picks.map(item => item.id), id], t('organizations.similar.added'))} />}
      <h3>{t('organizations.similar.suggested')}</h3>
      <p className="body-muted">{t('organizations.similar.explanation')}</p>
      {suggestions.error && <p className="field-error" role="alert">{suggestions.error} <button className="text-link" type="button" onClick={suggestions.reload}>{t('organizations.common.retry')}</button></p>}
      {suggestions.data && (suggestions.data.suggestions.length ? <ul className="inline-list">{suggestions.data.suggestions.map(band => <li key={band.id}>
        <a href={organizationHref(band)}>{band.name}</a> <span className="body-muted">({band.reasons.map(reason => reasonText(t, reason)).join(', ')})</span>
        {manage && picks.length < 10 && <button className="text-link" type="button" disabled={busy} onClick={() => save([...picks.map(item => item.id), band.id], t('organizations.similar.added'))}>
          {t('organizations.similar.pick', { name: band.name })}
        </button>}
      </li>)}</ul> : <p className="body-muted">{t('organizations.similar.noSuggestions')}</p>)}
    </section>
  );
}
