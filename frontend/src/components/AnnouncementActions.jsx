import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import Icon from './Icon.jsx';

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
        method: mode === 'feed' && !saved ? 'POST' : 'DELETE', auth: true,
      });
      if (mode === 'feed') { setSaved(!saved); setMessage(saved ? 'Announcement removed from saved.' : 'Announcement saved.'); }
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
      <button className={`btn ${mode === 'own' ? 'btn-danger' : 'btn-tertiary'}`} type="button" onClick={act}
        disabled={disabled || busy}
        aria-pressed={mode === 'feed' ? Boolean(saved) : undefined}
        aria-label={`${mode === 'own' ? 'Delete' : mode === 'saved' ? 'Remove saved' : saved ? 'Saved' : 'Save'} ${post.title}`}>
        {mode !== 'own' && <Icon name="bookmark" size={15} />}
        {busy ? 'Working...' : mode === 'own' ? 'Delete' : mode === 'saved' ? 'Remove' : saved ? 'Saved' : 'Save'}
      </button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {message && <p className="sr-only" role="status">{message}</p>}
    </>
  );
}
