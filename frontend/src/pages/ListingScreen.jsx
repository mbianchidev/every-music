import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { categoryLabel, formatPrice, tabForType } from '../lib/marketplace.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import ShareButton from '../components/ShareButton.jsx';
import ManagedImage from '../components/ManagedImage.jsx';
import MarketplaceNav from '../components/marketplace/MarketplaceNav.jsx';
import ListingSaveButton from '../components/marketplace/ListingSaveButton.jsx';
import ListingReportButton from '../components/marketplace/ListingReportButton.jsx';
import ListingModerationButton from '../components/marketplace/ListingModerationButton.jsx';
import MarketplaceSafetyTips from '../components/marketplace/MarketplaceSafetyTips.jsx';

const transitions = { active: ['reserved', 'sold', 'closed'], reserved: ['active', 'sold', 'closed'], sold: ['active'], closed: ['active'] };
const statusAction = { reserved: 'reserve', sold: 'sold', closed: 'close', active: 'reopen' };

export default function ListingScreen({ route }) {
  const { t, locale, formatDate } = useI18n();
  const id = route.query.get('id');
  const resource = useResource(`/marketplace/listings/${encodeURIComponent(id || 'missing')}`, { events: 'marketplace.changed,marketplace.saved.changed' });
  const account = useResource('/account', { reconnect: false });
  const settings = useResource('/marketplace/catalog', { auth: false, reconnect: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const listing = resource.data;
  const admin = account.data?.role === 'admin';
  const run = async (operation, success) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await operation();
      if (success) setMessage(success(result));
      resource.reload();
      return true;
    } catch (failure) { setError(failure.message); return false; }
    finally { setBusy(false); }
  };
  const contact = () => run(async () => {
    const conversation = await conduit.transmit('/conversations', { method: 'POST', auth: true, body: { recipientUserId: listing.seller.userId } });
    const link = `${window.location.origin}${window.location.pathname}#listing?id=${listing.id}`;
    const draft = t('marketplace.actions.contactDraft', { title: listing.title, link });
    window.location.hash = `#messages?id=${conversation.id}&draft=${encodeURIComponent(draft)}`;
  });
  const changeStatus = status => run(
    () => conduit.transmit(`/marketplace/listings/${listing.id}`, { method: 'PATCH', auth: true, body: { status } }),
    () => t('marketplace.actions.statusChanged', { status: t(`marketplace.statuses.${status}`).toLowerCase() }),
  );
  const renew = () => run(
    () => conduit.transmit(`/marketplace/listings/${listing.id}/renew`, { method: 'POST', auth: true }),
    result => t('marketplace.actions.renewed', { date: formatDate(result.expiresAt) }),
  );
  const remove = async () => {
    if (!window.confirm(t('marketplace.actions.deleteConfirm', { title: listing.title }))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/marketplace/listings/${listing.id}`, { method: 'DELETE', auth: true });
      window.location.hash = '#my-listings';
    } catch (failure) { setError(failure.message); setBusy(false); }
  };
  const open = listing && ['active', 'reserved'].includes(listing.status);
  const location = listing && [listing.locationText, listing.latitude !== null ? `${listing.latitude}, ${listing.longitude}` : null].filter(Boolean);
  return (
    <div className="container">
      <PageHeader eyebrow={listing ? t(`marketplace.types.${listing.type}`) : t('marketplace.header.eyebrow')} title={listing?.title || t('marketplace.routes.listing')} />
      <MarketplaceNav />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!listing && !resource.error ? <Spinner label={t('marketplace.detail.loading')} /> : listing && <>
        {listing.removedByModeration && <p className="status-message">{t('marketplace.detail.removedNotice')}</p>}
        {listing.expired && !listing.removedByModeration && listing.isOwner && <p className="status-message">
          {t('marketplace.detail.expiredNotice', { date: formatDate(listing.expiresAt) })}</p>}
        <div className="listing-layout">
          <article className="card listing-detail">
            {!!listing.photos.length && (listing.isOwner || (!listing.removedByModeration && !listing.expired)) && <section aria-label={t('marketplace.detail.photos')}>
              <ul className="listing-gallery">{listing.photos.map((url, index) => <li key={url}>
                <ManagedImage className="listing-gallery-image" src={url} authenticated={listing.isOwner}
                  alt={t('marketplace.detail.photo', { index: index + 1, total: listing.photos.length, title: listing.title })} />
              </li>)}</ul>
            </section>}
            <p className="listing-price listing-price-large">{formatPrice(listing, locale)}</p>
            <div className="tag-list">
              <span className="tag">{t(`marketplace.statuses.${listing.status}`)}</span>
              {listing.remote && <span className="tag tag-muted">{t('marketplace.card.remote')}</span>}
              {listing.shipping && <span className="tag tag-muted">{t('marketplace.card.shipping')}</span>}
            </div>
            <p className="listing-seller"><span className="body-muted">{t('marketplace.detail.seller')} </span>
              <a href={`#musician?id=${listing.seller.userId}`}>{listing.seller.artistName}</a></p>
            {listing.isOwner ? <section className="listing-manage" aria-labelledby="listing-manage-heading">
              <h2 className="heading-md" id="listing-manage-heading">{t('marketplace.detail.manage')}</h2>
              {(listing.expired || listing.removedByModeration) && <p className="field-hint">{t('marketplace.detail.ownerOnly')}</p>}
              {!listing.removedByModeration && <div className="compact-actions">
                <a className="btn btn-secondary" href={`#edit-listing?id=${listing.id}`}>{t('marketplace.actions.edit')}</a>
                {open && <button className="btn btn-secondary" type="button" disabled={busy} onClick={renew}>
                  {t('marketplace.actions.renew', { days: settings.data?.listingDays ?? 60 })}</button>}
                {transitions[listing.status].filter(status => status !== 'sold' || listing.type === 'sell').map(status => <button key={status} className="btn btn-ghost" type="button" disabled={busy}
                  onClick={() => changeStatus(status)}>{t(`marketplace.actions.${statusAction[status]}`)}</button>)}
                <button className="btn btn-danger" type="button" disabled={busy} onClick={remove}>{t('marketplace.actions.delete')}</button>
              </div>}
            </section> : <div className="compact-actions">
              {open && <button className="btn btn-primary" type="button" disabled={busy} onClick={contact}
                aria-label={t('marketplace.actions.contactSeller', { name: listing.seller.artistName })}>
                {busy ? t('marketplace.actions.contacting') : t('marketplace.actions.contact')}</button>}
              <ListingSaveButton key={`${listing.id}-${listing.isSaved}`} listing={listing} />
              {!listing.removedByModeration && <ListingReportButton listing={listing} />}
              {admin && !listing.removedByModeration && <ListingModerationButton listing={listing} onRemoved={() => {
                setMessage(t('marketplace.moderation.done')); resource.reload();
              }} />}
            </div>}
            {!listing.removedByModeration && !listing.expired && <div className="compact-actions"><ShareButton title={listing.title} /></div>}
            <h2 className="heading-md">{t('marketplace.detail.description')}</h2>
            <p className="detail-text">{listing.description}</p>
            <h2 className="heading-md">{t('marketplace.detail.details')}</h2>
            <dl className="listing-facts">
              <div><dt>{t('marketplace.detail.type')}</dt><dd>{t(`marketplace.types.${listing.type}`)}</dd></div>
              <div><dt>{t('marketplace.detail.category')}</dt><dd>{categoryLabel(listing, locale)}</dd></div>
              {listing.condition && <div><dt>{t('marketplace.detail.condition')}</dt><dd>{t(`marketplace.conditions.${listing.condition}`)}</dd></div>}
              <div><dt>{t('marketplace.detail.location')}</dt><dd>{location.length ? location.join(' / ') : t('marketplace.card.noLocation')}</dd></div>
              <div><dt>{t('marketplace.detail.remote')}</dt><dd>{t(listing.remote ? 'marketplace.detail.yes' : 'marketplace.detail.no')}</dd></div>
              {tabForType(listing.type) === 'gear' && <div><dt>{t('marketplace.detail.shipping')}</dt><dd>{t(listing.shipping ? 'marketplace.detail.yes' : 'marketplace.detail.no')}</dd></div>}
              <div><dt>{t('marketplace.detail.posted')}</dt><dd><time dateTime={listing.createdAt}>{formatDate(listing.createdAt)}</time></dd></div>
              <div><dt>{t('marketplace.detail.expires')}</dt><dd><time dateTime={listing.expiresAt}>{formatDate(listing.expiresAt)}</time></dd></div>
            </dl>
            {!!listing.instruments.length && <><h2 className="heading-md">{t('marketplace.detail.instruments')}</h2>
              <div className="tag-list">{listing.instruments.map(item => <span className="tag" key={item.id}>{item.name}</span>)}</div></>}
            {!!listing.genres.length && <><h2 className="heading-md">{t('marketplace.detail.genres')}</h2>
              <div className="tag-list">{listing.genres.map(item => <span className="tag tag-muted" key={item.id}>{item.name}</span>)}</div></>}
          </article>
          <MarketplaceSafetyTips />
        </div>
      </>}
    </div>
  );
}
