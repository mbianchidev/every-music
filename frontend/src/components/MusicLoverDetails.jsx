import { useI18n } from '../lib/i18n.js';
import { mediaUrl } from '../lib/media.js';
import Avatar from './Avatar.jsx';
import ProfileFollows from './ProfileFollows.jsx';
import PastAndNextEvents from './PastAndNextEvents.jsx';

// Profile body for music-lover accounts: no instruments or projects, but
// contacts and the bands and artists they follow (if they share them).
export default function MusicLoverDetails({ profile, showName = true }) {
  const { t } = useI18n();
  const name = profile.artistName || [profile.firstName, profile.lastName].filter(Boolean).join(' ') || t('organizations.profile.kinds.music_lover');
  const contacts = profile.contacts ?? {};
  return (
    <>
      <div className="profile-summary">
        {profile.profilePictureUrl ? <img className="profile-image" src={mediaUrl(profile.profilePictureUrl)} alt={t('organizations.profile.pictureAlt', { name })} width="88" height="88" />
          : <Avatar name={name} large />}
        <div>{showName && <h2 className="heading-md">{name}</h2>}
          <p className="body-muted">{t('organizations.profile.kinds.music_lover')}</p>
          {profile.city && <p className="body-muted">{[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}</p>}
        </div>
      </div>
      {profile.bio && <section className="detail-section"><h2 className="heading-md">{t('organizations.page.about')}</h2><p className="detail-text">{profile.bio}</p></section>}
      {(contacts.websiteUrl || contacts.telegramId) && <section className="detail-section">
        <h2 className="heading-md">{t('organizations.profile.contacts')}</h2>
        <ul className="inline-list">
          {contacts.websiteUrl && <li><a href={contacts.websiteUrl} target="_blank" rel="noopener noreferrer">{t('organizations.profile.websiteLink')}</a></li>}
          {contacts.telegramId && <li>{t('organizations.profile.telegram')}: {contacts.telegramId}</li>}
        </ul>
      </section>}
      <ProfileFollows userId={profile.userId} />
      <PastAndNextEvents subject={{ type: 'profile', id: profile.userId }} />
    </>
  );
}
