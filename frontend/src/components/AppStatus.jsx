import { useEffect, useState } from 'react';
import { useResource } from '../lib/resources.js';
import { connectLiveUpdates } from '../lib/realtime.js';
import { registerPwa } from '../lib/pwa.js';
import Navigation from './Navigation.jsx';
import Brand from './Brand.jsx';
import Icon from './Icon.jsx';
import Avatar from './Avatar.jsx';

export default function AppStatus({ session, routeName, pageTitle }) {
  const [preference, setPreference] = useState(document.documentElement.dataset.themePreference || 'system');
  const [themeError, setThemeError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [live, setLive] = useState('connecting');
  const [install, setInstall] = useState(null);
  const [update, setUpdate] = useState(null);
  const [pwaError, setPwaError] = useState('');
  const notifications = useResource(session.authorized ? '/notifications?pageSize=1' : null, { events: 'notifications.changed' });

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = theme;
      document.documentElement.style.backgroundColor = theme === 'dark' ? '#11131a' : '#f6f7fb';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#11131a' : '#f6f7fb');
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
  useEffect(() => {
    const storage = event => {
      if (event.key === 'everymusic.theme') setPreference(['light', 'dark', 'system'].includes(event.newValue) ? event.newValue : 'system');
    };
    const connection = () => setOnline(navigator.onLine);
    const prompt = event => { event.preventDefault(); setInstall(event); };
    window.addEventListener('storage', storage);
    window.addEventListener('online', connection);
    window.addEventListener('offline', connection);
    window.addEventListener('beforeinstallprompt', prompt);
    void registerPwa(action => setUpdate(() => action), setPwaError);
    return () => {
      window.removeEventListener('storage', storage);
      window.removeEventListener('online', connection);
      window.removeEventListener('offline', connection);
      window.removeEventListener('beforeinstallprompt', prompt);
    };
  }, []);
  useEffect(() => {
    if (!session.authorized) return undefined;
    return connectLiveUpdates(setLive);
  }, [session.authorized, session.persona?.userId]);

  const changeTheme = event => {
    const value = event.target.value;
    setPreference(value);
    try {
      localStorage.setItem('everymusic.theme', value);
      setThemeError('');
    } catch (error) {
      console.warn('Theme preference could not be saved', error);
      setThemeError('Theme changed for this tab, but browser storage is unavailable.');
    }
  };
  const installApp = async () => {
    try {
      await install.prompt();
      await install.userChoice;
      setInstall(null);
    } catch (error) {
      console.error('App installation failed', error);
      setPwaError('Installation could not start. Use your browser menu to install Every.music.');
    }
  };
  return (
    <>
    {session.authorized && <Navigation routeName={routeName} unreadCount={notifications.data?.unreadCount || 0} />}
    <header className="app-tools">
      <div className="header-brand"><Brand href={session.authorized ? '#feed' : '#login'} /></div>
      {session.authorized && <div className="header-context"><span>Workspace</span><Icon name="chevron" size={14} /><span>{pageTitle}</span></div>}
      <div className="header-actions">
      {session.authorized && <p className={`connection-status ${!online ? 'is-offline' : live === 'live' ? 'is-live' : 'is-connecting'}`} role="status">
        <span className="status-dot" aria-hidden="true" /><span className="connection-label" aria-hidden="true">{!online ? 'Offline' : live === 'live' ? 'Live' : 'Connecting'}</span>
        <span className="sr-only">{!online ? 'Offline' : live === 'live' ? 'Live updates connected' : 'Live updates reconnecting. You can still refresh lists.'}</span>
      </p>}
      <div className="theme-control">
        <label className="sr-only" htmlFor="theme-preference">Color theme</label>
        <Icon name="theme" size={16} />
        <select id="theme-preference" value={preference} onChange={changeTheme}>
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </select>
      </div>
      {install && <button className="text-link" type="button" onClick={installApp}>Install app</button>}
      {update && <button className="text-link" type="button" onClick={update}>Update app</button>}
      {session.authorized && <a className="header-profile" href="#profile" aria-label="Open your profile">
        {session.persona?.artistName ? <Avatar name={session.persona.artistName} src={session.persona.profilePictureUrl} /> : <span className="avatar"><Icon name="user" size={18} /></span>}
      </a>}
      </div>
    </header>
    <div className="global-notices">
      {!online && <p className="status-message" role="status">You are offline. Saved calls are read-only. Reconnect to save changes or send messages.</p>}
      {(themeError || pwaError) && <p className="field-error" role="alert">{themeError || pwaError}</p>}
      {online && session.authorized && notifications.error && <p className="field-error" role="alert">Notifications: {notifications.error} <button className="text-link" type="button" onClick={notifications.reload}>Retry notifications</button></p>}
    </div>
    </>
  );
}
