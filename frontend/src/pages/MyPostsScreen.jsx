import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import EmptyState from '../components/EmptyState.jsx';

class MyPostsScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { posts: [], loading: true };
  }
  
  componentDidMount() {
    this.loadPosts();
  }
  
  loadPosts = async () => {
    try {
      const resp = await conduit.transmit('/announcements/me', { auth: true });
      this.setState({ posts: resp.announcements || [], loading: false });
    } catch {
      this.setState({ loading: false });
    }
  };
  
  handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    
    try {
      await conduit.transmit(`/announcements/${id}`, { method: 'DELETE', auth: true });
      this.setState({ posts: this.state.posts.filter(p => p.id !== id) });
    } catch {}
  };
  
  render() {
    const { posts, loading } = this.state;
    
    return (
      <div className="container">
        <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
          <h1 className="heading-lg">MY ANNOUNCEMENTS</h1>
        </div>
        
        {loading ? <Spinner /> : posts.length === 0 ? (
          <EmptyState title="No announcements yet!" message="Create your first announcement" actionLabel="CREATE ANNOUNCEMENT" actionHash="#create" />
        ) : (
          <div className="grid">
            {posts.map(post => (
              <div key={post.id} className="card">
                <h3 className="heading-md">{post.title}</h3>
                <p style={{ opacity: 0.8, marginBottom: '1rem' }}>{post.description}</p>
                
                <div style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1rem' }}>
                  <span>📍 {post.location?.city || 'Remote'}</span>
                  {post.isRemote && <span style={{ marginLeft: '0.5rem' }}>🌐 Remote</span>}
                </div>
                
                <button className="btn btn-primary" onClick={() => this.handleDelete(post.id)}>🗑️ DELETE</button>
              </div>
            ))}
          </div>
        )}
        
        <Navigation active="my-posts" />
      </div>
    );
  }
}

export default MyPostsScreen;
