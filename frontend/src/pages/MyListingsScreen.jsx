import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import MarketplaceNav from '../components/marketplace/MarketplaceNav.jsx';
import ListingCard from '../components/marketplace/ListingCard.jsx';
import ListingSaveButton from '../components/marketplace/ListingSaveButton.jsx';

function RenewButton({ listing, days, onRenewed }) {
  const { t, formatDate } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const renew = async () => {
    setBusy(true); setError('');
    try {
      const result = await conduit.transmit(`/marketplace/listings/${listing.id}/renew`, { method: 'POST', auth: true });
      onRenewed(t('marketplace.actions.renewed', { date: formatDate(result.expiresAt) }));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <>
    <button className="btn btn-tertiary" type="button" disabled={busy} onClick={renew}>{t('marketplace.actions.renew', { days })}</button>
    {error && <p className="field-error" role="alert">{error}</p>}
  </>;
}

export default function MyListingsScreen({ mode = 'own' }) {
  const { t } = useI18n();
  const saved = mode === 'saved';
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const resource = useResource(`/marketplace/listings/${saved ? 'saved' : 'mine'}?page=${page}&pageSize=12`, {
    events: saved ? 'marketplace.changed,marketplace.saved.changed' : 'marketplace.changed',
  });
  const settings = useResource(saved ? null : '/marketplace/catalog', { auth: false, reconnect: false });
  const rows = resource.data?.listings || [];
  useEffect(() => {
    if (resource.data && !resource.loading && !rows.length && page > 1) setPage(value => value - 1);
  }, [resource.data, resource.loading, rows.length, page]);
  const changePage = value => { setPage(value); document.getElementById('main-content')?.focus(); };
  const days = settings.data?.listingDays ?? 60;
  const ownActions = listing => <>
    <a className="btn btn-secondary" href={`#listing?id=${listing.id}`} aria-label={t('marketplace.actions.manageLabel', { title: listing.title })}>
      {t('marketplace.actions.manage')}</a>
    {!listing.removedByModeration && <a className="btn btn-secondary" href={`#edit-listing?id=${listing.id}`}
      aria-label={t('marketplace.actions.editLabel', { title: listing.title })}>{t('marketplace.actions.edit')}</a>}
    {!listing.removedByModeration && ['active', 'reserved'].includes(listing.status) && listing.expired && <RenewButton listing={listing} days={days}
      onRenewed={text => { setMessage(text); resource.reload(); }} />}
  </>;
  return (
    <div className="container">
      <PageHeader eyebrow={t('marketplace.header.eyebrow')} title={t(saved ? 'marketplace.saved.title' : 'marketplace.mine.title')}
        subtitle={t(saved ? 'marketplace.saved.subtitle' : 'marketplace.mine.subtitle')} />
      <MarketplaceNav />
      {message && <p className="success" role="status">{message}</p>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t(saved ? 'marketplace.saved.loading' : 'marketplace.mine.loading')} /> : rows.length ? <>
        <div className="grid" aria-busy={resource.loading}>
          {rows.map(listing => <ListingCard key={listing.id} listing={listing} actions={saved
            ? <ListingSaveButton listing={listing} mode="remove" onChanged={resource.reload} />
            : ownActions(listing)} />)}
        </div>
        <Pagination pagination={resource.data?.pagination} onPage={changePage} disabled={resource.loading} />
      </> : !resource.error && <EmptyState title={t(saved ? 'marketplace.saved.empty' : 'marketplace.mine.empty')}
        message={t(saved ? 'marketplace.saved.emptyMessage' : 'marketplace.mine.emptyMessage')}
        actionLabel={t(saved ? 'marketplace.saved.browse' : 'marketplace.toolbar.newListing')} actionHash={saved ? '#marketplace' : '#new-listing'} />}
    </div>
  );
}
