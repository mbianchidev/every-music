import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PageHeader from '../components/PageHeader.jsx';

class MyPostsScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      posts: [],
      loading: true,
      error: '',
      deletingId: null,
    };
  }

  componentDidMount() {
    this.loadPosts();
  }

  loadPosts = async () => {
    this.setState({ loading: true, error: '' });
    try {
      const response = await conduit.transmit('/announcements/me', { auth: true });
      this.setState({ posts: response.announcements || [], loading: false });
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  };

  handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement permanently?')) return;

    this.setState({ deletingId: id, error: '' });
    try {
      await conduit.transmit(`/announcements/${id}`, { method: 'DELETE', auth: true });
      this.setState((state) => ({
        posts: state.posts.filter((post) => post.id !== id),
        deletingId: null,
      }));
    } catch (error) {
      this.setState({ error: error.message, deletingId: null });
    }
  };

  renderContent() {
    const { posts, loading, error, deletingId } = this.state;

    if (loading) return <Spinner label="Loading your announcements" />;
    if (error && posts.length === 0) {
      return <ErrorState message={error} onRetry={this.loadPosts} />;
    }
    if (posts.length === 0) {
      return (
        <EmptyState
          title="No announcements yet"
          message="Publish what you are looking for."
          actionLabel="CREATE ANNOUNCEMENT"
          actionHash="#create"
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
                className="btn btn-primary"
                type="button"
                onClick={() => this.handleDelete(post.id)}
                disabled={deletingId === post.id}
              >
                {deletingId === post.id ? 'DELETING…' : 'DELETE'}
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
        <PageHeader eyebrow="Your calls" title="MY ANNOUNCEMENTS" subtitle="Manage the opportunities you published." />
        {this.state.error && this.state.posts.length > 0 && <div className="error" role="alert">{this.state.error}</div>}
        {this.renderContent()}
        <Navigation active="my-posts" />
      </div>
    );
  }
}

export default MyPostsScreen;
