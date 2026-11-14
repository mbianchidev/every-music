import { useI18n } from '../../lib/i18n.js';
import { categoryLabel, formatPrice } from '../../lib/marketplace.js';
import Icon from '../Icon.jsx';
import ManagedImage from '../ManagedImage.jsx';

export default function ListingCard({ listing, actions, headingLevel = 2 }) {
  const { t, locale, formatDate } = useI18n();
  const Heading = `h${headingLevel}`;
  const cover = listing.photos[0];
  return (
    <article className="card listing-card">
      <div className="listing-card-labels">
        <span className="tag">{t(`marketplace.types.${listing.type}`)}</span>
        {listing.status !== 'active' && <span className="tag tag-muted">{t(`marketplace.statuses.${listing.status}`)}</span>}
        {listing.isOwner && listing.expired && !listing.removedByModeration && <span className="tag tag-warning">{t('marketplace.card.expired')}</span>}
        {listing.removedByModeration && <span className="tag tag-warning">{t('marketplace.card.removed')}</span>}
      </div>
      <div className="call-card-heading">
        <Heading className="heading-md"><a href={`#listing?id=${listing.id}`}>{listing.title}</a></Heading>
        {cover && <ManagedImage className="call-thumbnail" src={cover} authenticated={listing.isOwner}
          alt={t('marketplace.card.photo', { title: listing.title })} width="72" height="72" loading="lazy" />}
      </div>
      <p className="listing-price">{formatPrice(listing, locale)}</p>
      <p className="listing-category">{categoryLabel(listing, locale)}{listing.condition ? ` / ${t(`marketplace.conditions.${listing.condition}`)}` : ''}</p>
      <p className="announcement-description">{listing.description}</p>
      <p className="announcement-meta">
        <span><Icon name="location" size={14} />{listing.locationText || t('marketplace.card.noLocation')}</span>
        {listing.remote && <span><Icon name="globe" size={14} />{t('marketplace.card.remote')}</span>}
        {listing.shipping && <span><Icon name="tag" size={14} />{t('marketplace.card.shipping')}</span>}
      </p>
      <div className="card-footer">
        <span className="listing-card-seller">
          {listing.isOwner ? t('marketplace.card.expires', { date: formatDate(listing.expiresAt) })
            : t('marketplace.card.seller', { name: listing.seller.artistName })}
        </span>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
    </article>
  );
}
