import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import styles from './lib/styles.js';
import nucleus from './lib/nucleus.js';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import BootScreen from './pages/BootScreen.jsx';
import AuthScreen from './pages/AuthScreen.jsx';
import RegisterScreen from './pages/RegisterScreen.jsx';
import ForgotPasswordScreen from './pages/ForgotPasswordScreen.jsx';
import VerifyEmailScreen from './pages/VerifyEmailScreen.jsx';
import ResetPasswordScreen from './pages/ResetPasswordScreen.jsx';
import FeedScreen from './pages/FeedScreen.jsx';
import ProfileScreen from './pages/ProfileScreen.jsx';
import EditProfileScreen from './pages/EditProfileScreen.jsx';
import CreatePostScreen from './pages/CreatePostScreen.jsx';
import MyPostsScreen from './pages/MyPostsScreen.jsx';
import SavedPostsScreen from './pages/SavedPostsScreen.jsx';

const ROUTES = {
  boot: { screen: BootScreen, title: 'Starting' },
  login: { screen: AuthScreen, title: 'Sign in' },
  register: { screen: RegisterScreen, title: 'Create account' },
  'forgot-password': { screen: ForgotPasswordScreen, title: 'Forgot password' },
  'verify-email': { screen: VerifyEmailScreen, title: 'Verify email' },
  'reset-password': { screen: ResetPasswordScreen, title: 'Reset password' },
  feed: { screen: FeedScreen, title: 'Feed', protected: true },
  profile: { screen: ProfileScreen, title: 'Profile', protected: true },
  'edit-profile': { screen: EditProfileScreen, title: 'Edit profile', protected: true },
  create: { screen: CreatePostScreen, title: 'Create announcement', protected: true },
  'my-posts': { screen: MyPostsScreen, title: 'My announcements', protected: true },
  saved: { screen: SavedPostsScreen, title: 'Saved announcements', protected: true },
};

function readRoute() {
  const rawHash = window.location.hash.slice(1) || 'boot';
  const [name, query = ''] = rawHash.split('?');
  return {
    name,
    query: new URLSearchParams(query),
  };
}

class Orchestrator extends Component {
  constructor(props) {
    super(props);
    this.state = {
      route: readRoute(),
      session: nucleus.snapshot(),
    };
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.handleRoute);
    window.addEventListener('everymusic:session-expired', this.handleSessionExpired);
    this.unsubscribe = nucleus.subscribe((session) => {
      this.setState({ session }, this.enforceRoute);
    });
    this.enforceRoute();
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleRoute);
    window.removeEventListener('everymusic:session-expired', this.handleSessionExpired);
    this.unsubscribe?.();
  }

  handleRoute = () => {
    this.setState({ route: readRoute() }, this.enforceRoute);
  };

  handleSessionExpired = () => {
    window.location.hash = '#login';
  };

  enforceRoute = () => {
    const { route, session } = this.state;
    const definition = ROUTES[route.name];

    if (definition?.protected && !session.authorized) {
      window.location.replace('#login');
      return;
    }

    if (route.name === 'boot') {
      window.location.replace(session.authorized ? '#feed' : '#login');
      return;
    }

    document.title = `${definition?.title || 'Page not found'} · Every.music`;
    requestAnimationFrame(() => document.getElementById('main-content')?.focus());
  };

  render() {
    const { route } = this.state;
    const definition = ROUTES[route.name];

    if (!definition) {
      return (
        <main className="container-narrow center-content" id="main-content" tabIndex="-1">
          <div className="card">
            <p className="eyebrow">404</p>
            <h1 className="heading-lg">PAGE NOT FOUND</h1>
            <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#feed'; }}>
              RETURN HOME
            </button>
          </div>
        </main>
      );
    }

    const Screen = definition.screen;
    return (
      <main id="main-content" tabIndex="-1">
        <Screen route={route} />
      </main>
    );
  }
}

const styleTag = document.createElement('style');
styleTag.textContent = styles;
document.head.appendChild(styleTag);

const root = createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <Orchestrator />
  </ErrorBoundary>,
);
