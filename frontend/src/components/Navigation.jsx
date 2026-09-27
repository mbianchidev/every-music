const Navigation = ({ active }) => {
  const items = [
    { id: 'feed', icon: '♪', label: 'Feed', hash: '#feed' },
    { id: 'create', icon: '+', label: 'Post', hash: '#create' },
    { id: 'my-posts', icon: '▤', label: 'My ads', hash: '#my-posts' },
    { id: 'saved', icon: '◇', label: 'Saved', hash: '#saved' },
    { id: 'profile', icon: '●', label: 'Profile', hash: '#profile' },
  ];

  return (
    <nav className="nav" aria-label="Primary">
      {items.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${active === item.id ? 'nav-item-active' : ''}`}
          type="button"
          aria-current={active === item.id ? 'page' : undefined}
          onClick={() => { window.location.hash = item.hash; }}
        >
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

export default Navigation;
