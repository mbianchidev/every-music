import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PageHeader from '../components/PageHeader.jsx';

class SavedPostsScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      posts: [],
      loading: true,
      error: '',
      removingId: null,
    };
  }

  componentDidMount() {
    this.loadPosts();
  }

  loadPosts = async () => {
    this.setState({ loading: true, error: '' });
    try {
      const response = await conduit.transmit('/announcements/saved', { auth: true });
      this.setState({ posts: response.announcements || [], loading: false });
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  };

  handleRemove = async (id) => {
    this.setState({ removingId: id, error: '' });
    try {
      await conduit.transmit(`/announcements/${id}/save`, {
        method: 'DELETE',
        auth: true,
      });
      this.setState((state) => ({
        posts: state.posts.filter((post) => post.id !== id),
        removingId: null,
      }));
    } catch (error) {
      this.setState({ error: error.message, removingId: null });
    }
  };

  renderContent() {
    const { posts, loading, error, removingId } = this.state;

    if (loading) return <Spinner label="Loading saved announcements" />;
    if (error && posts.length === 0) {
      return <ErrorState message={error} onRetry={this.loadPosts} />;
    }
    if (posts.length === 0) {
      return (
        <EmptyState
          title="Nothing saved yet"
          message="Keep the best opportunities within reach."
          actionLabel="GO TO FEED"
          actionHash="#feed"
        />
      );
    }

    return (
      <div className="grid">
        {posts.map((post) => (
          <AnnouncementCard
            key={post.id}
            post={post}
            actions={(
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => this.handleRemove(post.id)}
                disabled={removingId === post.id}
              >
                {removingId === post.id ? 'REMOVING…' : 'REMOVE'}
              </button>
            )}
          />
        ))}
      </div>
    );
  }

  render() {
    return (
      <div className="container">
        <PageHeader eyebrow="Bookmarks" title="SAVED" subtitle="Opportunities you want to revisit." />
        {this.state.error && this.state.posts.length > 0 && <div className="error" role="alert">{this.state.error}</div>}
        {this.renderContent()}
        <Navigation active="saved" />
      </div>
    );
  }
}

export default SavedPostsScreen;
