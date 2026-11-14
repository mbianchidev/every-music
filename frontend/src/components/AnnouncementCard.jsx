import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import ManagedImage from './ManagedImage.jsx';

const AnnouncementCard = ({ post, actions, expanded = false }) => {
  const city = post.location?.city;

  return (
    <article className="card announcement-card">
      {post.creatorName && <div className="card-author"><Avatar name={post.creatorName} src={post.creatorPictureUrl} />
        <a href={`#musician?id=${post.userId}`} aria-label={`Musician: ${post.creatorName}`}>{post.creatorName}</a>
        {post.isCoverBand && <span className="tag tag-muted">Covers</span>}
      </div>}
      <div className="call-card-heading">
        <h2 className="heading-md"><a href={`#announcement?id=${post.id}`}>{post.title}</a></h2>
        {post.pictureUrl && <ManagedImage className="call-thumbnail" src={post.pictureUrl} authenticated={post.isPublished === false} alt={`Announcement image: ${post.title}`} width="72" height="72" loading="lazy" />}
      </div>
      {post.isPublished === false && <p className="eyebrow">Draft, visible only to you</p>}
      <p className={expanded ? 'detail-text' : 'announcement-description'}>{post.description}</p>

      <div className="card-taxonomy">{post.instruments?.length > 0 && (
        <div className="tag-list" aria-label="Instruments">
          {post.instruments.slice(0, 3).map((instrument) => (
            <span key={instrument.instrumentId || instrument.instrument_id} className="tag">
              {instrument.name}
            </span>
          ))}
        </div>
      )}
      {!!post.genres?.length && <div className="tag-list" aria-label="Genres">
        {post.genres.slice(0, 2).map(genre => <span className="tag tag-muted" key={genre.genre_id}>{genre.name}</span>)}
      </div>}</div>

      <p className="announcement-meta">
        <span><Icon name="location" size={14} />{city || 'Location flexible'}</span>
        {post.isRemote && <span><Icon name="globe" size={14} />Remote welcome</span>}
      </p>

      <div className="card-footer">
        <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time>
        {actions && <div className="card-actions">{actions}</div>}
      </div>
    </article>
  );
};

export default AnnouncementCard;
