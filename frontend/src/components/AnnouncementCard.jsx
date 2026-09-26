const AnnouncementCard = ({ post, actions }) => {
  const city = post.location?.city;

  return (
    <article className="card announcement-card">
      <h2 className="heading-md">{post.title}</h2>
      <p className="announcement-description">{post.description}</p>

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
