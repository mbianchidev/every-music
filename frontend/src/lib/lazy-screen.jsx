import { useEffect, useState } from 'react';
import { t } from './i18n.js';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';

// Loads a route screen on first use so rarely visited screens stay out of the
// main bundle. Build chunks are precached by the service worker; a failed load
// stays visible with a retry instead of rendering an empty page.
export default function lazyScreen(load) {
  let loaded = null;
  return function LazyScreen(props) {
    const [state, setState] = useState(() => ({ Screen: loaded, error: '' }));
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (state.Screen) return undefined;
      let active = true;
      load().then(module => {
        loaded = module.default;
        if (active) setState({ Screen: module.default, error: '' });
      }).catch(error => {
        console.error('Screen failed to load', error);
        if (active) setState({ Screen: null, error: t('organizations.common.loadFailed') });
      });
      return () => { active = false; };
    }, [attempt]);
    if (state.Screen) return <state.Screen {...props} />;
    if (state.error) {
      return <div className="container"><ErrorState message={state.error} onRetry={() => { setState({ Screen: null, error: '' }); setAttempt(value => value + 1); }} /></div>;
    }
    return <div className="container"><Spinner label={t('organizations.common.loadingScreen')} /></div>;
  };
}
