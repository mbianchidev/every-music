import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { organizationHref } from '../lib/organizations.js';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';

export default function ProfileFollows({ userId }) {
  const { t } = useI18n();
  const resource = useResource(`/users/${encodeURIComponent(userId)}/follows`, { events: 'profiles.changed,organizations.changed' });
  const data = resource.data;
  return (
    <section className="detail-section" aria-labelledby="follows-heading">
      <h2 className="heading-md" id="follows-heading">{t('organizations.profile.follows')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!data && !resource.error ? <Spinner label={t('organizations.profile.loadingFollows')} /> : data && (!data.visible && !data.artists.length && !data.organizations.length
        ? <p className="body-muted">{t('organizations.profile.followsPrivate')}</p> : <div className="form-grid">
          <div>
            <h3>{t('organizations.profile.followedBands')}</h3>
            {data.organizations.length ? <ul className="inline-list">{data.organizations.map(organization => <li key={organization.id}>
              <a href={organizationHref(organization)}>{organization.name}</a> <VerifiedBadge verified={organization.verified} />
            </li>)}</ul> : <p className="body-muted">{t('organizations.profile.noBands')}</p>}
          </div>
          <div>
            <h3>{t('organizations.profile.followedArtists')}</h3>
            {data.artists.length ? <ul className="inline-list">{data.artists.map(artist => <li key={artist.userId}>
              <a href={`#musician?id=${artist.userId}`}>{artist.name}</a>
            </li>)}</ul> : <p className="body-muted">{t('organizations.profile.noArtists')}</p>}
          </div>
        </div>)}
      {data && !data.visible && (data.artists.length > 0 || data.organizations.length > 0) && <p className="field-hint">{t('organizations.profile.followsOnlyYou')}</p>}
    </section>
  );
}
