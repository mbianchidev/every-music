import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';

export default function AnnouncementActions({ post, mode = 'feed', onChanged = () => {}, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(post.isSaved);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setSaved(post.isSaved), [post.isSaved]);
  const act = async () => {
    if (mode === 'own' && !window.confirm(`Delete "${post.title}"?`)) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/announcements/${post.id}${mode === 'own' ? '' : '/save'}`, {
        method: mode === 'feed' ? 'POST' : 'DELETE', auth: true,
      });
      if (mode === 'feed') { setSaved(true); setMessage('Announcement saved.'); }
      else {
        document.getElementById('main-content')?.focus();
        onChanged();
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {mode === 'own' && <a className="btn btn-secondary" href={`#edit-announcement?id=${post.id}`}>Edit</a>}
      <button className={`btn ${mode === 'own' ? 'btn-primary' : 'btn-tertiary'}`} type="button" onClick={act}
        disabled={disabled || busy || (mode === 'feed' && saved)}
        aria-label={`${mode === 'own' ? 'Delete' : mode === 'saved' ? 'Remove saved' : 'Save'} ${post.title}`}>
        {busy ? 'Working...' : mode === 'own' ? 'Delete' : mode === 'saved' ? 'Remove' : saved ? 'Saved' : 'Save'}
      </button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
    </>
  );
}
