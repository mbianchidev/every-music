import { mediaUrl } from '../lib/media.js';
import Avatar from './Avatar.jsx';

const links = { spotify_link: 'Spotify', youtube_link: 'YouTube', bandcamp_link: 'Bandcamp', soundcloud_link: 'SoundCloud', website_link: 'Website' };

export default function ProfileDetails({ profile, showName = true }) {
  return (
    <>
      <div className="profile-summary">
        {profile.profilePictureUrl ? <img className="profile-image" src={mediaUrl(profile.profilePictureUrl)} alt={`Profile image for ${profile.artistName || 'this musician'}`} width="88" height="88" />
          : <Avatar name={profile.artistName || 'Musician'} large />}
        <div>{showName && <h2 className="heading-md">{profile.artistName || 'Musician'}</h2>}
          {(profile.firstName || profile.lastName) && <p className="body-muted">{profile.firstName} {profile.lastName}</p>}
          {profile.city && <p className="body-muted">{[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}</p>}
        </div>
      </div>
      {profile.bio && <section className="detail-section"><h2 className="heading-md">About</h2><p className="detail-text">{profile.bio}</p></section>}
      <section className="detail-section">
        <h2 className="heading-md">Instruments</h2>
        {profile.instruments.length ? <ul className="profile-instruments">
          {profile.instruments.map(item => <li key={item.instrument_id}>{item.name}: {item.skill_level}, {item.years_experience} years</li>)}
        </ul> : <p className="body-muted">No instruments selected yet.</p>}
      </section>
      {!!profile.genres.length && <section className="detail-section">
        <h2 className="heading-md">Genres</h2>
        <div className="tag-list">{profile.genres.map(genre => <span className="tag" key={genre.genre_id}>{genre.name}</span>)}</div>
      </section>}
      {profile.contacts?.websiteUrl && <p><a href={profile.contacts.websiteUrl} target="_blank" rel="noopener noreferrer">Musician website</a></p>}
      {!!profile.projects.length && <section className="detail-section">
        <h2 className="heading-md">Musical projects</h2>
        <div className="project-list">{profile.projects.map(project => (
          <article key={project.id} className="card">
            <h3>{project.name}</h3>
            <p>{[project.role, project.years_active].filter(Boolean).join(' / ')}</p>
            {project.description && <p className="detail-text">{project.description}</p>}
            {!!project.collaborators?.length && <ul aria-label="Collaborators">{project.collaborators.map(person => (
              <li key={person.userId}><a href={`#musician?id=${person.userId}`}>{person.artistName || 'Musician'}</a>: {person.role}</li>
            ))}</ul>}
            <div className="compact-actions">{Object.entries(links).filter(([key]) => project[key]).map(([key, label]) => (
              <a key={key} href={project[key]} target="_blank" rel="noopener noreferrer">{label}</a>
            ))}</div>
          </article>
        ))}</div>
      </section>}
    </>
  );
}
