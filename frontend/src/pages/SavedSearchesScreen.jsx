import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import { describeFilters, savedSearchLink } from '../lib/discovery.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import QuotaNotice, { useQuotas } from '../components/QuotaNotice.jsx';
import { errorText } from '../lib/error-text.js';

function NotifyToggle({ search, disabled, onToggle, label }) {
  const [checked, setChecked] = useState(search.notify);
  useEffect(() => setChecked(search.notify), [search.notify]);
  return (
    <label className="checkbox-label">
      <input type="checkbox" checked={checked} disabled={disabled} aria-describedby={`saved-search-${search.id}`}
        onChange={async event => {
          const next = event.target.checked;
          setChecked(next);
          if (!await onToggle(next)) setChecked(!next);
        }} />
      {label}
    </label>
  );
}

export default function SavedSearchesScreen() {
  const { t, formatDate } = useI18n();
  const resource = useResource('/saved-searches', { events: 'saved-searches.changed' });
  const quotas = useQuotas();
  const instruments = useResource('/catalog/instruments', { auth: false, reconnect: false });
  const genres = useResource('/catalog/genres', { auth: false, reconnect: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const catalogs = { instruments: instruments.data?.instruments, genres: genres.data?.genres };
  const act = async (search, request, success) => {
    setBusy(search.id); setError(''); setMessage('');
    try {
      await request();
      setMessage(success);
      resource.reload();
      return true;
    } catch (failure) { setError(errorText(failure)); return false; }
    finally { setBusy(''); }
  };
  const rows = resource.data?.searches || [];
  return (
    <div className="container">
      <PageHeader eyebrow={t('discoveryExtras.saved.eyebrow')} title={t('discoveryExtras.saved.title')} subtitle={t('discoveryExtras.saved.subtitle')}
        actions={<a className="btn btn-primary" href="#feed">{t('discoveryExtras.saved.browse')}</a>} />
      <QuotaNotice kind="savedSearches" quotas={quotas} />
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('discoveryExtras.saved.loading')} /> : resource.data && (rows.length
        ? <ul className="saved-search-list">{rows.map(search => <li className="card" key={search.id}>
          <h2 className="heading-md" id={`saved-search-${search.id}`}>{search.name}</h2>
          <p className="body-muted">{describeFilters(search.filters, catalogs, t) || t('discoveryExtras.saved.allCalls')}</p>
          <p className="field-hint">{t('discoveryExtras.saved.created', { date: formatDate(search.createdAt) })}</p>
          <NotifyToggle search={search} disabled={busy === search.id} label={t('discoveryExtras.saved.notify')}
            onToggle={notify => act(search, () => conduit.transmit(`/saved-searches/${search.id}`, {
              method: 'PATCH', auth: true, body: { notify },
            }), t(notify ? 'discoveryExtras.saved.notifyOn' : 'discoveryExtras.saved.notifyOff', { name: search.name }))} />
          <div className="compact-actions">
            <a className="btn btn-secondary" href={savedSearchLink(search)} aria-label={t('discoveryExtras.saved.openNamed', { name: search.name })}>{t('discoveryExtras.saved.open')}</a>
            <button className="btn btn-danger" type="button" disabled={busy === search.id}
              aria-label={t('discoveryExtras.saved.deleteNamed', { name: search.name })}
              onClick={() => {
                if (!window.confirm(t('discoveryExtras.saved.confirmDelete', { name: search.name }))) return;
                act(search, async () => {
                  await conduit.transmit(`/saved-searches/${search.id}`, { method: 'DELETE', auth: true });
                  document.getElementById('main-content')?.focus();
                }, t('discoveryExtras.saved.deleted', { name: search.name }));
              }}>{t('common.actions.delete')}</button>
          </div>
        </li>)}</ul>
        : <EmptyState title={t('discoveryExtras.saved.emptyTitle')} message={t('discoveryExtras.saved.emptyMessage')}
          actionLabel={t('discoveryExtras.saved.browse')} actionHash="#feed" />)}
    </div>
  );
}
