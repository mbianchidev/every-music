import { useId, useState } from 'react';
import { useI18n } from '../lib/i18n.js';

export default function ShareButton({ title }) {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const errorId = useId();
  const share = async () => {
    setError(''); setMessage('');
    try {
      if (navigator.share) await navigator.share({ title, url: window.location.href });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setMessage(t('ui.share.copied'));
      } else {
        setError(t('ui.share.copyBelow'));
      }
    } catch (failure) {
      if (failure.name !== 'AbortError') {
        console.warn('Native sharing unavailable', failure.name);
        setError(t('ui.share.unavailable'));
      }
    }
  };
  return (
    <div>
      <button className="btn btn-ghost" type="button" onClick={share}>{t('ui.share.button')}</button>
      {message && <p role="status">{message}</p>}
      {error && <div><p className="field-error" role="alert" id={errorId}>{error}</p><label className="field">{t('ui.share.link')}<input className="input" aria-describedby={errorId} readOnly value={window.location.href} onFocus={event => event.target.select()} /></label></div>}
    </div>
  );
}
