import { useI18n } from '../lib/i18n.js';
import { mediaUrl } from '../lib/media.js';
import Avatar from './Avatar.jsx';
import ProfileFollows from './ProfileFollows.jsx';
import ProfileExtras from './ProfileExtras.jsx';
import VerifiedBadge from './VerifiedBadge.jsx';
import PastAndNextEvents from './PastAndNextEvents.jsx';

// Profile body for music-lover accounts: no instruments or projects, but
// the shared profile extras and the bands and artists they follow (if shared).
export default function MusicLoverDetails({ profile, showName = true }) {
  const { t } = useI18n();
  const name = profile.artistName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || t('organizations.profile.kinds.music_lover');
  return (
    <>
      <div className="profile-summary">
        {profile.profilePictureUrl ? <img className="profile-image" src={mediaUrl(profile.profilePictureUrl)} alt={t('organizations.profile.pictureAlt', { name })} width="88" height="88" />
          : <Avatar name={name} large />}
        <div>{showName && <h2 className="heading-md">{name}</h2>}
          {profile.verifiedAt && <p><VerifiedBadge verifiedAt={profile.verifiedAt} label /></p>}
          <p className="body-muted">{t('organizations.profile.kinds.music_lover')}</p>
          {profile.city && <p className="body-muted">{[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}</p>}
        </div>
      </div>
      {profile.bio && <section className="detail-section"><h2 className="heading-md">{t('organizations.page.about')}</h2><p className="detail-text">{profile.bio}</p></section>}
      <ProfileExtras profile={{ ...profile, openToProjects: false }} />
      <ProfileFollows userId={profile.userId} />
      <PastAndNextEvents subject={{ type: 'profile', id: profile.userId }} />
    </>
  );
}
