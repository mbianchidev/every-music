import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import EmptyState from '../components/EmptyState.jsx';

class FeedScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { posts: [], loading: true };
  }
  
  componentDidMount() {
    this.loadPosts();
  }
  
  loadPosts = async () => {
    try {
      const resp = await conduit.transmit('/announcements/search');
      this.setState({ posts: resp.announcements || [], loading: false });
    } catch {
      this.setState({ loading: false });
    }
  };
  
  handleSave = async (id) => {
    try {
      await conduit.transmit(`/announcements/${id}/save`, { method: 'POST', auth: true });
    } catch {}
  };
  
  render() {
    const { posts, loading } = this.state;
    
    return (
      <div className="container">
        <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
          <h1 className="heading-lg">🎸 THE FEED</h1>
          <p style={{ opacity: 0.7 }}>Musicians looking for bandmates</p>
        </div>
        
        {loading ? <Spinner /> : posts.length === 0 ? (
          <EmptyState title="No announcements yet!" message="Be the first to post one" actionLabel="CREATE ANNOUNCEMENT" actionHash="#create" />
        ) : (
          <div className="grid">
            {posts.map(post => (
              <AnnouncementCard key={post.id} post={post} actions={
                <button className="btn btn-tertiary" onClick={() => this.handleSave(post.id)}>💾 SAVE</button>
              } />
            ))}
          </div>
        )}
        
        <Navigation active="feed" />
      </div>
    );
  }
}

export default FeedScreen;
