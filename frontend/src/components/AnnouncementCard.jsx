import { mediaUrl } from '../lib/media.js';

const AnnouncementCard = ({ post, actions, expanded = false }) => {
  const city = post.location?.city;

  return (
    <article className="card announcement-card">
      {post.pictureUrl && <img className="content-image" src={mediaUrl(post.pictureUrl)} alt={`Announcement image: ${post.title}`} width="480" height="300" loading="lazy" />}
      <h2 className="heading-md"><a href={`#announcement?id=${post.id}`}>{post.title}</a></h2>
      {post.isPublished === false && <p className="eyebrow">Draft, visible only to you</p>}
      <p className={expanded ? 'detail-text' : 'announcement-description'}>{post.description}</p>

      {post.instruments?.length > 0 && (
        <div className="tag-list" aria-label="Instruments">
          {post.instruments.slice(0, 3).map((instrument) => (
            <span key={instrument.instrumentId || instrument.instrument_id} className="tag">
              {instrument.name}
            </span>
          ))}
        </div>
      )}

      <p className="announcement-meta">
        <span aria-hidden="true">⌖ </span>
        {city || 'Location flexible'}
        {post.isRemote && <span> · Remote friendly</span>}
      </p>

      {actions && <div className="card-actions">{actions}</div>}
    </article>
  );
};

export default AnnouncementCard;
