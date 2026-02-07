import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import EmptyState from '../components/EmptyState.jsx';

class SavedPostsScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { posts: [], loading: true };
  }
  
  componentDidMount() {
    this.loadPosts();
  }
  
  loadPosts = async () => {
    try {
      const resp = await conduit.transmit('/announcements/saved', { auth: true });
      this.setState({ posts: resp.announcements || [], loading: false });
    } catch {
      this.setState({ loading: false });
    }
  };
  
  render() {
    const { posts, loading } = this.state;
    
    return (
      <div className="container">
        <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
          <h1 className="heading-lg">SAVED ANNOUNCEMENTS</h1>
        </div>
        
        {loading ? <Spinner /> : posts.length === 0 ? (
          <EmptyState title="No saved announcements!" message="Start saving announcements from the feed" actionLabel="GO TO FEED" actionHash="#feed" />
        ) : (
          <div className="grid">
            {posts.map(post => (
              <AnnouncementCard key={post.id} post={post} />
            ))}
          </div>
        )}
        
        <Navigation active="saved" />
      </div>
    );
  }
}

export default SavedPostsScreen;
