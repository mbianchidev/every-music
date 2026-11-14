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
import SearchScreen from './pages/SearchScreen.jsx';
import ProfileScreen from './pages/ProfileScreen.jsx';
import EditProfileScreen from './pages/EditProfileScreen.jsx';
import CreatePostScreen from './pages/CreatePostScreen.jsx';
import AnnouncementListScreen from './pages/AnnouncementListScreen.jsx';
import MusicianScreen from './pages/MusicianScreen.jsx';
import AnnouncementScreen from './pages/AnnouncementScreen.jsx';
import MessagesScreen from './pages/MessagesScreen.jsx';
import NotificationsScreen from './pages/NotificationsScreen.jsx';
import SettingsScreen from './pages/SettingsScreen.jsx';
import AnalyticsScreen from './pages/AnalyticsScreen.jsx';
import AppStatus from './components/AppStatus.jsx';

const ROUTES = {
  boot: { screen: BootScreen, title: 'Starting' },
  login: { screen: AuthScreen, title: 'Sign in' },
  register: { screen: RegisterScreen, title: 'Create account' },
  'forgot-password': { screen: ForgotPasswordScreen, title: 'Forgot password' },
  'verify-email': { screen: VerifyEmailScreen, title: 'Verify email' },
  'reset-password': { screen: ResetPasswordScreen, title: 'Reset password' },
  feed: { screen: SearchScreen, title: 'Feed', protected: true },
  musicians: { screen: SearchScreen, props: { kind: 'profiles' }, title: 'Find musicians', protected: true },
  musician: { screen: MusicianScreen, title: 'Musician', protected: true },
  announcement: { screen: AnnouncementScreen, title: 'Announcement', protected: true },
  profile: { screen: ProfileScreen, title: 'Profile', protected: true },
  'edit-profile': { screen: EditProfileScreen, title: 'Edit profile', protected: true },
  create: { screen: CreatePostScreen, title: 'Create announcement', protected: true },
  'edit-announcement': { screen: CreatePostScreen, title: 'Edit announcement', protected: true },
  'my-posts': { screen: AnnouncementListScreen, props: { mode: 'own' }, title: 'My announcements', protected: true },
  saved: { screen: AnnouncementListScreen, props: { mode: 'saved' }, title: 'Saved announcements', protected: true },
  messages: { screen: MessagesScreen, title: 'Messages', protected: true },
  notifications: { screen: NotificationsScreen, title: 'Notifications', protected: true },
  settings: { screen: SettingsScreen, title: 'Settings', protected: true },
  analytics: { screen: AnalyticsScreen, title: 'Analytics', protected: true },
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
      navigation: 0,
      session: nucleus.snapshot(),
    };
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.handleRoute);
    window.addEventListener('everymusic:session-expired', this.handleSessionExpired);
    this.unsubscribe = nucleus.subscribe((session) => {
      this.setState({ session }, this.enforceRoute);
    });
    this.enforceRoute(true);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleRoute);
    window.removeEventListener('everymusic:session-expired', this.handleSessionExpired);
    this.unsubscribe?.();
  }

  handleRoute = () => {
    this.setState(state => ({ route: readRoute(), navigation: state.navigation + 1 }), () => this.enforceRoute(true));
  };

  handleSessionExpired = () => {
    window.location.hash = '#login';
  };

  enforceRoute = (focus = false) => {
    const { route, session } = this.state;
    const definition = Object.hasOwn(ROUTES, route.name) ? ROUTES[route.name] : undefined;

    if (definition?.protected && !session.authorized) {
      try { sessionStorage.setItem('everymusic.return-to', window.location.hash); }
      catch (error) { console.warn('Could not preserve the requested page', error); }
      window.location.replace('#login');
      return;
    }

    if (route.name === 'boot') {
      window.location.replace(session.authorized ? '#feed' : '#login');
      return;
    }

    document.title = `${definition?.title || 'Page not found'} · Every.music`;
    if (focus) window.requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      document.getElementById('main-content')?.focus({ preventScroll: true });
    });
  };

  render() {
    const { route } = this.state;
    const definition = Object.hasOwn(ROUTES, route.name) ? ROUTES[route.name] : undefined;

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
        <Screen key={this.state.navigation} route={route} {...definition.props} />
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
    <a className="skip-link" href="#main-content" onClick={event => {
      event.preventDefault();
      document.getElementById('main-content')?.focus();
    }}>Skip to main content</a>
    <AppStatus />
    <Orchestrator />
  </ErrorBoundary>,
);
