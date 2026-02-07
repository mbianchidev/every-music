const Navigation = ({ active }) => {
  const items = [
    { id: 'feed', icon: '🎵', label: 'Feed', hash: '#feed' },
    { id: 'create', icon: '📢', label: 'Post', hash: '#create' },
    { id: 'my-posts', icon: '📋', label: 'My Ads', hash: '#my-posts' },
    { id: 'saved', icon: '💾', label: 'Saved', hash: '#saved' },
    { id: 'profile', icon: '👤', label: 'Profile', hash: '#profile' }
  ];
  
  return (
    <nav className="nav">
      {items.map(item => (
        <button key={item.id} className={`nav-item ${active === item.id ? 'nav-item-active' : ''}`} onClick={() => window.location.hash = item.hash}>
          <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default Navigation;
