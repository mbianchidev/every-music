import { useEffect, useState } from 'react';
import nucleus from '../lib/nucleus.js';
import { useResource } from '../lib/resources.js';
import { connectLiveUpdates } from '../lib/realtime.js';
import { registerPwa } from '../lib/pwa.js';

export default function AppStatus() {
  const [session, setSession] = useState(nucleus.snapshot());
  const [preference, setPreference] = useState(document.documentElement.dataset.themePreference || 'system');
  const [themeError, setThemeError] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [live, setLive] = useState('connecting');
  const [install, setInstall] = useState(null);
  const [update, setUpdate] = useState(null);
  const [pwaError, setPwaError] = useState('');
  const notifications = useResource(session.authorized ? '/notifications?pageSize=1' : null, { events: 'notifications.changed' });

  useEffect(() => nucleus.subscribe(setSession), []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const theme = preference === 'system' ? (media.matches ? 'dark' : 'light') : preference;
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.themePreference = preference;
      document.documentElement.style.colorScheme = theme;
      document.documentElement.style.backgroundColor = theme === 'dark' ? '#090a0d' : '#f6f5f0';
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#090a0d' : '#f6f5f0');
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
    <header className="app-tools">
      <a className="brand-link" href={session.authorized ? '#feed' : '#login'}>Every.music</a>
      {session.authorized && (
        <nav className="community-nav" aria-label="Community">
          <a href="#musicians">Musicians</a>
          <a href="#messages">Messages</a>
          <a href="#notifications">Notifications{notifications.data?.unreadCount ? ` (${notifications.data.unreadCount})` : ''}</a>
          <a href="#analytics">Analytics</a>
          <a href="#settings">Settings</a>
        </nav>
      )}
      <div className="theme-control">
        <label htmlFor="theme-preference">Color theme</label>
        <select id="theme-preference" value={preference} onChange={changeTheme}>
          <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
        </select>
      </div>
      {install && <button className="text-link" type="button" onClick={installApp}>Install app</button>}
      {update && <button className="text-link" type="button" onClick={update}>Update app</button>}
      <p className="connection-status" role="status">
        {!online ? 'Offline. Saved feed results are read-only; edits stay in the form until you reconnect.' : session.authorized
          ? live === 'live' ? 'Live updates connected' : 'Live updates reconnecting. You can still refresh lists.' : ''}
      </p>
      {(themeError || pwaError) && <p className="field-error" role="alert">{themeError || pwaError}</p>}
      {online && session.authorized && notifications.error && <p className="field-error" role="alert">Notifications: {notifications.error} <button className="text-link" type="button" onClick={notifications.reload}>Retry notifications</button></p>}
    </header>
  );
}
