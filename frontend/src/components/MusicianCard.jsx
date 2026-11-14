import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';

export default function MusicianCard({ musician }) {
  const name = musician.artistName || [musician.firstName, musician.lastName].filter(Boolean).join(' ') || 'Musician';
  return (
    <article className="card musician-card">
      <div className="musician-summary">
        <Avatar name={name} src={musician.profilePictureUrl} />
        <div><h2 className="heading-md"><a href={`#musician?id=${musician.userId}`}>{name}</a></h2>
          <p><Icon name="location" size={13} /> {musician.city || 'Location not specified'}</p></div>
      </div>
      {musician.bio && <p className="announcement-description">{musician.bio}</p>}
      <div className="card-taxonomy">{!!musician.instruments?.length && <div className="tag-list" aria-label="Instruments">
        {musician.instruments.slice(0, 3).map(item => <span className="tag" key={item.instrument_id}>{item.name}</span>)}
      </div>}
      {!!musician.genres?.length && <div className="tag-list" aria-label="Genres">
        {musician.genres.slice(0, 3).map(item => <span className="tag tag-muted" key={item.genre_id}>{item.name}</span>)}
      </div>}</div>
      <div className="card-footer"><a className="text-link" href={`#musician?id=${musician.userId}`} aria-label={`View profile for ${name}`}>View profile <Icon name="arrow" size={15} /></a></div>
    </article>
  );
}
