import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';
import { useI18n } from '../lib/i18n.js';
import PromotedLabel from './monetization/PromotedLabel.jsx';

export default function MusicianCard({ musician }) {
  const { t, formatNumber } = useI18n();
  const name = musician.artistName || [musician.firstName, musician.lastName].filter(Boolean).join(' ') || t('app.routes.musician');
  return (
    <article className="card musician-card">
      <div className="musician-summary">
        <Avatar name={name} src={musician.profilePictureUrl} />
        <div><h2 className="heading-md"><a href={`#musician?id=${musician.userId}`}>{name}</a><VerifiedBadge verifiedAt={musician.verifiedAt} /></h2>
          <p><Icon name="location" size={13} /> {musician.place?.label || musician.city || t('musicians.card.noLocation')}
            {musician.distanceKm !== null && musician.distanceKm !== undefined && <span className="distance"> · {t('places.distanceAway', { distance: formatNumber(musician.distanceKm) })}</span>}</p>
          {musician.openToProjects && <span className="tag tag-open">{t('profileExtras.openToProjects')}</span>}
          <PromotedLabel promotion={musician.promotion} /></div>
      </div>
      {musician.bio && <p className="announcement-description">{musician.bio}</p>}
      <div className="card-taxonomy">{!!musician.instruments?.length && <div className="tag-list" aria-label={t('ui.catalog.instruments')}>
        {musician.instruments.slice(0, 3).map(item => <span className="tag" key={item.instrument_id}>{item.name}</span>)}
      </div>}
      {!!musician.genres?.length && <div className="tag-list" aria-label={t('ui.catalog.genres')}>
        {musician.genres.slice(0, 3).map(item => <span className="tag tag-muted" key={item.genre_id}>{item.name}</span>)}
      </div>}</div>
      <div className="card-footer"><a className="text-link" href={`#musician?id=${musician.userId}`} aria-label={t('musicians.card.viewNamed', { name })}>{t('musicians.card.view')} <Icon name="arrow" size={15} /></a></div>
    </article>
  );
}
