import { mediaUrl } from '../lib/media.js';
import { useI18n } from '../lib/i18n.js';
import Avatar from './Avatar.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';
import ProfileExtras from './ProfileExtras.jsx';
import MusicLoverDetails from './MusicLoverDetails.jsx';
import ProfileOrganizations from './ProfileOrganizations.jsx';
import PastAndNextEvents from './PastAndNextEvents.jsx';
import ProfileReviews from './ProfileReviews.jsx';

const links = { spotify_link: 'spotifyLink', youtube_link: 'youtubeLink', bandcamp_link: 'bandcampLink', soundcloud_link: 'soundcloudLink', website_link: 'websiteLink' };

export default function ProfileDetails({ profile, showName = true }) {
  const { t } = useI18n();
  if (profile.accountKind === 'music_lover') return <MusicLoverDetails profile={profile} showName={showName} />;
  const name = profile.artistName || t('profileDetails.musician');
  const level = value => (value ? t(`profileDetails.levels.${value}`) : '');
  const instrument = item => (Number.isInteger(item.years_experience)
    ? t('profileDetails.instrument', { name: item.name, level: level(item.skill_level), count: item.years_experience })
    : [item.name, level(item.skill_level)].filter(Boolean).join(': '));
  return (
    <>
      <div className="profile-summary">
        {profile.profilePictureUrl ? <img className="profile-image" src={mediaUrl(profile.profilePictureUrl)} alt={profile.artistName ? t('profileDetails.image', { name: profile.artistName }) : t('profileDetails.imageFallback')} width="88" height="88" />
          : <Avatar name={name} large />}
        <div>{showName && <h2 className="heading-md">{name}</h2>}
          {profile.verifiedAt && <p><VerifiedBadge verifiedAt={profile.verifiedAt} label /></p>}
          {(profile.firstName || profile.lastName) && <p className="body-muted">{profile.firstName} {profile.lastName}</p>}
          {profile.city && <p className="body-muted">{[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}</p>}
        </div>
      </div>
      <ProfileExtras profile={profile} />
      {profile.bio && <section className="detail-section"><h2 className="heading-md">{t('profileDetails.about')}</h2><p className="detail-text">{profile.bio}</p></section>}
      <section className="detail-section">
        <h2 className="heading-md">{t('profileDetails.instruments')}</h2>
        {profile.instruments.length ? <ul className="profile-instruments">
          {profile.instruments.map(item => <li key={item.instrument_id}>{instrument(item)}</li>)}
        </ul> : <p className="body-muted">{t('profileDetails.noInstruments')}</p>}
      </section>
      {!!profile.genres.length && <section className="detail-section">
        <h2 className="heading-md">{t('profileDetails.genres')}</h2>
        <div className="tag-list">{profile.genres.map(genre => <span className="tag" key={genre.genre_id}>{genre.name}</span>)}</div>
      </section>}
      {profile.contacts?.websiteUrl && <p><a href={profile.contacts.websiteUrl} target="_blank" rel="noopener noreferrer">{t('profileDetails.website')}</a></p>}
      {!!profile.projects.length && <section className="detail-section">
        <h2 className="heading-md">{t('musicianProjects.heading')}</h2>
        <div className="project-list">{profile.projects.map(project => (
          <article key={project.id} className="card">
            <h3>{project.name}</h3>
            <p>{[project.role, project.years_active].filter(Boolean).join(' / ')}</p>
            {!!project.instruments?.length && <ul className="tag-list" aria-label={t('musicianProjects.played')}>
              {project.instruments.map(item => <li className="tag" key={item.instrument_id}>{item.name}</li>)}
            </ul>}
            {project.description && <p className="detail-text">{project.description}</p>}
            {!!project.collaborators?.length && <ul aria-label={t('musicianProjects.collaboratorList')}>{project.collaborators.map(person => (
              <li key={person.userId}><a href={`#musician?id=${person.userId}`}>{person.artistName || t('profileDetails.musician')}</a>: {person.role}</li>
            ))}</ul>}
            <div className="compact-actions">{Object.entries(links).filter(([key]) => project[key]).map(([key, label]) => (
              <a key={key} href={project[key]} target="_blank" rel="noopener noreferrer">{t(`musicianProjects.linkLabels.${label}`)}</a>
            ))}</div>
          </article>
        ))}</div>
      </section>}
      <ProfileOrganizations userId={profile.userId} />
      <PastAndNextEvents subject={{ type: 'profile', id: profile.userId }} />
      <ProfileReviews profile={profile} />
    </>
  );
}
