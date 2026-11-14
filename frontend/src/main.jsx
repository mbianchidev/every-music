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
import AdministrationScreen from './pages/AdministrationScreen.jsx';
import ReportsScreen from './pages/ReportsScreen.jsx';
import { applicationsRoute } from './pages/ApplicationsScreen.jsx';
import { onLocaleChange, t, useI18n } from './lib/i18n.js';
import localePreference from './lib/locale-preference.js';
import MarketplaceScreen from './pages/MarketplaceScreen.jsx';
import ListingScreen from './pages/ListingScreen.jsx';
import ListingEditorScreen from './pages/ListingEditorScreen.jsx';
import MyListingsScreen from './pages/MyListingsScreen.jsx';
import SavedSearchesScreen from './pages/SavedSearchesScreen.jsx';
import HelpScreen from './pages/HelpScreen.jsx';
import LegalScreen from './pages/LegalScreen.jsx';
import ShellGate from './components/ShellGate.jsx';
import BackButton from './components/BackButton.jsx';
import SiteFooter from './components/SiteFooter.jsx';
import lazyScreen from './lib/lazy-screen.jsx';

const OrganizationSearchScreen = lazyScreen(() => import('./pages/OrganizationSearchScreen.jsx'));
const OrganizationScreen = lazyScreen(() => import('./pages/OrganizationScreen.jsx'));
const OrganizationEditorScreen = lazyScreen(() => import('./pages/OrganizationEditorScreen.jsx'));
const OrganizationMembersScreen = lazyScreen(() => import('./pages/OrganizationMembersScreen.jsx'));
const YourPagesScreen = lazyScreen(() => import('./pages/YourPagesScreen.jsx'));
const StoreScreen = lazyScreen(() => import('./pages/StoreScreen.jsx'));
const WalletScreen = lazyScreen(() => import('./pages/WalletScreen.jsx'));
const InviteScreen = lazyScreen(() => import('./pages/InviteScreen.jsx'));
const EventsScreen = lazyScreen(() => import('./pages/EventsScreen.jsx'));
const EventScreen = lazyScreen(() => import('./pages/EventScreen.jsx'));
const EventEditorScreen = lazyScreen(() => import('./pages/EventEditorScreen.jsx'));
const MyEventsScreen = lazyScreen(() => import('./pages/MyEventsScreen.jsx'));
const CalendarScreen = lazyScreen(() => import('./pages/CalendarScreen.jsx'));
const CalendarEntryScreen = lazyScreen(() => import('./pages/CalendarEntryScreen.jsx'));

const ROUTES = {
  boot: { screen: BootScreen, get title() { return t('app.routes.starting'); } },
  login: { screen: AuthScreen, get title() { return t('app.routes.signIn'); } },
  register: { screen: RegisterScreen, get title() { return t('app.routes.register'); } },
  'forgot-password': { screen: ForgotPasswordScreen, get title() { return t('app.routes.forgotPassword'); } },
  'verify-email': { screen: VerifyEmailScreen, get title() { return t('app.routes.verifyEmail'); } },
  'reset-password': { screen: ResetPasswordScreen, get title() { return t('app.routes.resetPassword'); } },
  feed: { screen: SearchScreen, get title() { return t('app.routes.feed'); }, protected: true },
  musicians: { screen: SearchScreen, props: { kind: 'profiles' }, get title() { return t('app.routes.musicians'); }, protected: true },
  musician: { screen: MusicianScreen, get title() { return t('app.routes.musician'); }, protected: true },
  announcement: { screen: AnnouncementScreen, get title() { return t('app.routes.announcement'); }, protected: true },
  profile: { screen: ProfileScreen, get title() { return t('app.routes.profile'); }, protected: true },
  'edit-profile': { screen: EditProfileScreen, get title() { return t('app.routes.editProfile'); }, protected: true },
  create: { screen: CreatePostScreen, get title() { return t('app.routes.create'); }, protected: true },
  'edit-announcement': { screen: CreatePostScreen, get title() { return t('app.routes.editAnnouncement'); }, protected: true },
  'my-posts': { screen: AnnouncementListScreen, props: { mode: 'own' }, get title() { return t('app.routes.myPosts'); }, protected: true },
  saved: { screen: AnnouncementListScreen, props: { mode: 'saved' }, get title() { return t('app.routes.saved'); }, protected: true },
  messages: { screen: MessagesScreen, get title() { return t('app.routes.messages'); }, protected: true },
  notifications: { screen: NotificationsScreen, get title() { return t('app.routes.notifications'); }, protected: true },
  settings: { screen: SettingsScreen, get title() { return t('app.routes.settings'); }, protected: true },
  analytics: { screen: AnalyticsScreen, get title() { return t('app.routes.analytics'); }, protected: true },
  reports: { screen: ReportsScreen, get title() { return t('app.routes.reports'); }, protected: true },
  admin: { screen: AdministrationScreen, get title() { return t('app.routes.admin'); }, protected: true },
  applications: applicationsRoute,
  marketplace: { screen: MarketplaceScreen, get title() { return t('marketplace.routes.marketplace'); }, protected: true },
  listing: { screen: ListingScreen, get title() { return t('marketplace.routes.listing'); }, protected: true },
  'new-listing': { screen: ListingEditorScreen, get title() { return t('marketplace.routes.newListing'); }, protected: true },
  'edit-listing': { screen: ListingEditorScreen, get title() { return t('marketplace.routes.editListing'); }, protected: true },
  'my-listings': { screen: MyListingsScreen, props: { mode: 'own' }, get title() { return t('marketplace.routes.myListings'); }, protected: true },
  'saved-listings': { screen: MyListingsScreen, props: { mode: 'saved' }, get title() { return t('marketplace.routes.savedListings'); }, protected: true },
  'saved-searches': { screen: SavedSearchesScreen, get title() { return t('app.routes.savedSearches'); }, protected: true },
  help: { screen: HelpScreen, get title() { return t('app.routes.help'); } },
  legal: { screen: LegalScreen, get title() { return t('app.routes.legal'); } },
  organizations: { screen: OrganizationSearchScreen, get title() { return t('organizations.routes.discover'); }, protected: true },
  organization: { screen: OrganizationScreen, get title() { return t('organizations.routes.page'); }, protected: true },
  'create-organization': { screen: OrganizationEditorScreen, get title() { return t('organizations.routes.create'); }, protected: true },
  'edit-organization': { screen: OrganizationEditorScreen, get title() { return t('organizations.routes.edit'); }, protected: true },
  'organization-members': { screen: OrganizationMembersScreen, get title() { return t('organizations.routes.members'); }, protected: true },
  'your-pages': { screen: YourPagesScreen, get title() { return t('organizations.routes.yours'); }, protected: true },
  store: { screen: StoreScreen, get title() { return t('monetization.routes.store'); }, protected: true },
  wallet: { screen: WalletScreen, get title() { return t('monetization.routes.wallet'); }, protected: true },
  invite: { screen: InviteScreen, get title() { return t('monetization.routes.invite'); }, protected: true },
  events: { screen: EventsScreen, get title() { return t('events.routes.discover'); }, protected: true },
  event: { screen: EventScreen, get title() { return t('events.routes.event'); }, protected: true },
  'new-event': { screen: EventEditorScreen, get title() { return t('events.routes.create'); }, protected: true },
  'edit-event': { screen: EventEditorScreen, get title() { return t('events.routes.edit'); }, protected: true },
  'my-events': { screen: MyEventsScreen, get title() { return t('events.routes.mine'); }, protected: true },
  calendar: { screen: CalendarScreen, get title() { return t('calendar.routes.calendar'); }, protected: true },
  'calendar-entry': { screen: CalendarEntryScreen, get title() { return t('calendar.routes.entry'); }, protected: true },
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
    this.unsubscribeLocale = onLocaleChange(locale => this.setState({ locale }, this.enforceRoute));
    this.enforceRoute(true);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleRoute);
    window.removeEventListener('everymusic:session-expired', this.handleSessionExpired);
    this.unsubscribe?.();
    this.unsubscribeLocale?.();
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
      try {
        if (readRoute().name === route.name) sessionStorage.setItem('everymusic.return-to', window.location.hash);
      }
      catch (error) { console.warn('Could not preserve the requested page', error); }
      window.location.replace('#login');
      return;
    }

    if (route.name === 'boot') {
      window.location.replace(session.authorized ? '#feed' : '#login');
      return;
    }

    document.title = `${definition?.title || t('app.notFound.title')} · Every.music`;
    if (focus) {
      window.scrollTo(0, 0);
      document.getElementById('main-content')?.focus({ preventScroll: true });
    }
  };

  render() {
    const { route, session } = this.state;
    const definition = Object.hasOwn(ROUTES, route.name) ? ROUTES[route.name] : undefined;
    const Screen = definition?.screen;
    const waitingForSignIn = definition?.protected && !session.authorized;
    return (
      <div className={`application ${session.authorized ? 'is-authenticated' : 'is-guest'}`}>
        <AppStatus session={session} routeName={route.name} pageTitle={definition?.title || t('app.notFound.title')} />
        <main id="main-content" tabIndex="-1">
        {waitingForSignIn ? <BootScreen /> : Screen ? <ShellGate route={route} session={session}>
          <BackButton route={route} authorized={session.authorized} />
          <Screen key={this.state.navigation} route={route} {...definition.props} />
        </ShellGate> : <div className="container-narrow center-content">
          <div className="card">
            <p className="eyebrow">404</p>
            <h1 className="heading-lg">{t('app.notFound.title')}</h1>
            <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#feed'; }}>
              {t('app.notFound.home')}
            </button>
          </div>
        </div>}
        </main>
        <SiteFooter routeName={route.name} page={route.query.get('page')} />
      </div>
    );
  }
}

const styleTag = document.createElement('style');
styleTag.textContent = styles;
document.head.appendChild(styleTag);

function SkipLink() {
  const { t: translate } = useI18n();
  return <a className="skip-link" href="#main-content" onClick={event => {
    event.preventDefault();
    document.getElementById('main-content')?.focus();
  }}>{translate('app.skipLink')}</a>;
}

localePreference.start();
const root = createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <SkipLink />
    <Orchestrator />
  </ErrorBoundary>,
);
