import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import ManagedImage from './ManagedImage.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';
import { useI18n } from '../lib/i18n.js';
import OrganizationByline from './OrganizationByline.jsx';
import PromotedLabel from './monetization/PromotedLabel.jsx';

const AnnouncementCard = ({ post, actions, expanded = false }) => {
  const { t, formatNumber, formatDate } = useI18n();
  const city = post.location?.city;

  return (
    <article className="card announcement-card">
      {post.creatorName && <div className="card-author"><Avatar name={post.creatorName} src={post.creatorPictureUrl} />
        <a href={`#musician?id=${post.userId}`} aria-label={t('feed.card.musician', { name: post.creatorName })}>{post.creatorName}</a>
        <VerifiedBadge verifiedAt={post.creatorVerifiedAt} />
        {post.isCoverBand && <span className="tag tag-muted">{t('feed.card.covers')}</span>}
      </div>}
      <OrganizationByline organization={post.organization} />
      <PromotedLabel promotion={post.promotion} />
      <div className="call-card-heading">
        <h2 className="heading-md"><a href={`#announcement?id=${post.id}`}>{post.title}</a></h2>
        {post.pictureUrl && <ManagedImage className="call-thumbnail" src={post.pictureUrl} authenticated={post.isPublished === false} alt={t('feed.card.image', { title: post.title })} width="72" height="72" loading="lazy" />}
      </div>
      {post.isPublished === false && <p className="eyebrow">{t('feed.card.draft')}</p>}
      <p className={expanded ? 'detail-text' : 'announcement-description'}>{post.description}</p>

      <div className="card-taxonomy">{post.instruments?.length > 0 && (
        <div className="tag-list" aria-label={t('ui.catalog.instruments')}>
          {post.instruments.slice(0, 3).map((instrument) => (
            <span key={instrument.instrumentId || instrument.instrument_id} className="tag">
              {instrument.name}
            </span>
          ))}
        </div>
      )}
      {!!post.genres?.length && <div className="tag-list" aria-label={t('ui.catalog.genres')}>
        {post.genres.slice(0, 2).map(genre => <span className="tag tag-muted" key={genre.genre_id}>{genre.name}</span>)}
      </div>}</div>

      <p className="announcement-meta">
        <span><Icon name="location" size={14} />{city || t('feed.card.flexible')}</span>
        {post.distanceKm !== null && post.distanceKm !== undefined && <span>{t('places.distanceAway', { distance: formatNumber(post.distanceKm) })}</span>}
        {post.isRemote && <span><Icon name="globe" size={14} />{t('feed.search.remote')}</span>}
      </p>

      <div className="card-footer">
        <time dateTime={post.createdAt}>{formatDate(post.createdAt, { month: 'short', day: 'numeric' })}</time>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
    </article>
  );
};

export default AnnouncementCard;
