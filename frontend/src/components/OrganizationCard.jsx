import { useI18n } from '../lib/i18n.js';
import { organizationHref, placeLabel } from '../lib/organizations.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';

export default function OrganizationCard({ organization, children }) {
  const { t } = useI18n();
  const place = placeLabel(organization.location);
  return (
    <article className="card organization-card">
      <div className="musician-summary">
        <Avatar name={organization.name} src={organization.pictureUrl} />
        <div>
          <h2 className="heading-md"><a href={organizationHref(organization)}>{organization.name}</a></h2>
          <p>{t(`organizations.kinds.${organization.kind}`)}{!organization.managed && ` / ${t('organizations.card.unmanaged')}`}</p>
        </div>
      </div>
      <div className="card-taxonomy">
        <VerifiedBadge verified={organization.verified} />
        {!!organization.genres?.length && <div className="tag-list" aria-label={t('organizations.fields.genres')}>
          {organization.genres.slice(0, 3).map(genre => <span className="tag tag-muted" key={genre.id}>{genre.name}</span>)}
        </div>}
      </div>
      {organization.bio && <p className="announcement-description">{organization.bio}</p>}
      <p className="announcement-meta">
        <span><Icon name="location" size={14} />{place || t('organizations.card.noLocation')}</span>
        <span><Icon name="people" size={14} />{t('organizations.followers', { count: organization.followerCount ?? 0 })}</span>
      </p>
      {children && <div className="card-footer">{children}</div>}
    </article>
  );
}
