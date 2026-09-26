import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PageHeader from '../components/PageHeader.jsx';

class FeedScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      posts: [],
      loading: true,
      error: '',
      savedIds: new Set(),
      savingId: null,
      message: '',
    };
  }

  componentDidMount() {
    this.loadPosts();
  }

  loadPosts = async () => {
    this.setState({ loading: true, error: '' });
    try {
      const response = await conduit.transmit('/announcements/search', { auth: true });
      this.setState({ posts: response.announcements || [], loading: false });
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  };

  handleSave = async (id) => {
    this.setState({ savingId: id, message: '', error: '' });
    try {
      await conduit.transmit(`/announcements/${id}/save`, { method: 'POST', auth: true });
      this.setState((state) => ({
        savingId: null,
        message: 'Announcement saved.',
        savedIds: new Set([...state.savedIds, id]),
      }));
    } catch (error) {
      this.setState({ savingId: null, error: error.message });
    }
  };

  renderContent() {
    const { posts, loading, error, savedIds, savingId } = this.state;

    if (loading) return <Spinner label="Loading announcements" />;
    if (error && posts.length === 0) {
      return <ErrorState message={error} onRetry={this.loadPosts} />;
    }
    if (posts.length === 0) {
      return (
        <EmptyState
          title="No announcements yet"
          message="Start the scene by publishing the first one."
          actionLabel="CREATE ANNOUNCEMENT"
          actionHash="#create"
        />
      );
    }

    return (
      <div className="grid">
        {posts.map((post) => {
          const saved = savedIds.has(post.id);
          return (
            <AnnouncementCard
              key={post.id}
              post={post}
              actions={(
                <button
                  className="btn btn-tertiary"
                  type="button"
                  aria-pressed={saved}
                  onClick={() => this.handleSave(post.id)}
                  disabled={saved || savingId === post.id}
                >
                  {saved ? 'SAVED' : savingId === post.id ? 'SAVING…' : 'SAVE'}
                </button>
              )}
            />
          );
        })}
      </div>
    );
  }

  render() {
    return (
      <div className="container">
        <PageHeader
          eyebrow="Open calls"
          title="THE FEED"
          subtitle="Musicians looking for collaborators right now."
        />
        {this.state.message && <div className="success" role="status">{this.state.message}</div>}
        {this.state.error && this.state.posts.length > 0 && <div className="error" role="alert">{this.state.error}</div>}
        {this.renderContent()}
        <Navigation active="feed" />
      </div>
    );
  }
}

export default FeedScreen;
