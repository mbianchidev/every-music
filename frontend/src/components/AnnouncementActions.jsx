import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import Icon from './Icon.jsx';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

export default function AnnouncementActions({ post, mode = 'feed', onChanged = () => {}, disabled = false }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(post.isSaved);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setSaved(post.isSaved), [post.isSaved]);
  const act = async () => {
    if (mode === 'own' && !window.confirm(t('feed.actions.confirmDelete', { title: post.title }))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/announcements/${post.id}${mode === 'own' ? '' : '/save'}`, {
        method: mode === 'feed' && !saved ? 'POST' : 'DELETE', auth: true,
      });
      if (mode === 'feed') { setSaved(!saved); setMessage(saved ? t('feed.actions.unsavedMessage') : t('feed.actions.savedMessage')); }
      else {
        document.getElementById('main-content')?.focus();
        onChanged();
      }
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const togglePublished = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/announcements/${post.id}`, { method: 'PUT', auth: true, body: { isPublished: !post.isPublished } });
      setMessage(t(post.isPublished ? 'adExtras.publish.unpublished' : 'adExtras.publish.published', { title: post.title }));
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const verb = mode === 'own' ? 'delete' : mode === 'saved' ? 'remove' : saved ? 'saved' : 'save';
  return (
    <>
      {mode === 'own' && <a className="btn btn-secondary" href={`#edit-announcement?id=${post.id}`}>{t('common.actions.edit')}</a>}
      {mode === 'own' && post.isPublished !== undefined && <button className="btn btn-ghost" type="button" disabled={disabled || busy} onClick={togglePublished}
        aria-label={t(post.isPublished ? 'adExtras.publish.unpublishNamed' : 'adExtras.publish.publishNamed', { title: post.title })}>
        {t(post.isPublished ? 'adExtras.publish.unpublish' : 'adExtras.publish.publish')}</button>}
      <button className={`btn ${mode === 'own' ? 'btn-danger' : 'btn-tertiary'}`} type="button" onClick={act}
        disabled={disabled || busy}
        aria-pressed={mode === 'feed' ? Boolean(saved) : undefined}
        aria-label={t(`feed.actions.named.${verb}`, { title: post.title })}>
        {mode !== 'own' && <Icon name="bookmark" size={15} />}
        {busy ? t('feed.actions.working') : t(`feed.actions.${verb}`)}
      </button>
      {error && <p className="field-error" role="alert">{error}</p>}
      {message && <p className="sr-only" role="status">{message}</p>}
    </>
  );
}
