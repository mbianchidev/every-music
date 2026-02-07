const AnnouncementCard = ({ post, actions }) => (
  <div className="card">
    <h3 className="heading-md">{post.title}</h3>
    <p style={{ opacity: 0.8, marginBottom: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
      {post.description}
    </p>
    
    {post.instruments && post.instruments.length > 0 && (
      <div style={{ marginBottom: '1rem' }}>
        {post.instruments.slice(0, 3).map((inst, i) => (
          <span key={i} className="tag">{inst.name}</span>
        ))}
      </div>
    )}
    
    <div style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1rem' }}>
      <span>📍 {post.location?.city || 'Remote'}</span>
      {post.isRemote && <span style={{ marginLeft: '0.5rem' }}>🌐 Remote</span>}
    </div>
    
    {actions}
  </div>
);

export default AnnouncementCard;
