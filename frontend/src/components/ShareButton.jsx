import { useId, useState } from 'react';

export default function ShareButton({ title }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const errorId = useId();
  const share = async () => {
    setError(''); setMessage('');
    try {
      if (navigator.share) await navigator.share({ title, url: window.location.href });
      else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href);
        setMessage('Link copied.');
      } else {
        setError('Copy the address below to share this page.');
      }
    } catch (failure) {
      if (failure.name !== 'AbortError') {
        console.warn('Native sharing unavailable', failure.name);
        setError('Sharing was unavailable. Copy the address below.');
      }
    }
  };
  return (
    <div>
      <button className="btn btn-ghost" type="button" onClick={share}>Share</button>
      {message && <p role="status">{message}</p>}
      {error && <div><p className="field-error" role="alert" id={errorId}>{error}</p><label className="field">Page link<input className="input" aria-describedby={errorId} readOnly value={window.location.href} onFocus={event => event.target.select()} /></label></div>}
    </div>
  );
}
