import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Navigation from '../components/Navigation.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import FormField from '../components/FormField.jsx';
import Pagination from '../components/Pagination.jsx';
import ShareButton from '../components/ShareButton.jsx';
import AnnouncementActions from '../components/AnnouncementActions.jsx';
import ManagedImage from '../components/ManagedImage.jsx';

export default function AnnouncementScreen({ route }) {
  const id = route.query.get('id');
  const resource = useResource(`/announcements/${encodeURIComponent(id || 'missing')}`, { events: 'announcements.changed' });
  const [page, setPage] = useState(1);
  const comments = useResource(resource.data ? `/announcements/${id}/comments?page=${page}&pageSize=20` : null, { events: 'comments.changed' });
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const post = resource.data;
  const ownId = nucleus.payload.persona?.userId;
  const mine = post?.userId === ownId;
  useEffect(() => {
    if (!post || mine || post.isPublished === false) return;
    conduit.transmit('/analytics/events', { method: 'POST', auth: true, body: { kind: 'announcement_view', resourceId: post.id } })
      .catch(failure => { console.warn('Announcement view measurement failed', failure); setError(failure.message); });
  }, [post?.id, mine]);
  const action = async (path, method, data, success) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(path, { method, auth: true, body: data });
      setMessage(success);
      return true;
    } catch (failure) { setError(failure.message); return false; }
    finally { setBusy(false); }
  };
  const comment = async event => {
    event.preventDefault();
    if (await action(`/announcements/${id}/comments`, 'POST', { body }, 'Comment posted.')) {
      setBody(''); setPage(1); comments.reload();
    }
  };
  const removeComment = async commentId => {
    if (!window.confirm('Remove this comment?')) return;
    if (await action(`/announcements/${id}/comments/${commentId}`, 'DELETE', undefined, 'Comment removed.')) {
      document.getElementById('comments-heading')?.focus(); comments.reload();
    }
  };
  return (
    <div className="container">
      <PageHeader eyebrow={post?.isPublished === false ? 'Your draft' : 'Open call'} title={post?.title || 'ANNOUNCEMENT'} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!post && !resource.error ? <Spinner label="Loading announcement" /> : post && (
        <>
          <article className="card">
            {post.pictureUrl && <ManagedImage className="content-image" src={post.pictureUrl} authenticated={post.isPublished === false} alt={`Announcement image: ${post.title}`} />}
            <p>Posted by <a href={`#musician?id=${post.userId}`}>{post.creatorName || 'Musician'}</a> on <time dateTime={post.createdAt}>{new Date(post.createdAt).toLocaleDateString()}</time></p>
            <p className="detail-text">{post.description}</p>
            <p>{[post.location.city, post.location.state, post.location.country].filter(Boolean).join(', ') || 'Location flexible'}{post.isRemote ? ' / Remote welcome' : ''}{post.isCoverBand ? ' / Cover band' : ''}</p>
            {!!post.instruments.length && <div><h2 className="heading-md">Instruments needed</h2><div className="tag-list">{post.instruments.map(item => <span className="tag" key={item.instrument_id}>{item.name}</span>)}</div></div>}
            {!!post.genres.length && <div><h2 className="heading-md">Genres</h2><div className="tag-list">{post.genres.map(item => <span className="tag" key={item.genre_id}>{item.name}</span>)}</div></div>}
            <div className="compact-actions">{post.links.map((link, index) => <a key={index} href={link.url} target="_blank" rel="noopener noreferrer">{link.link_type}</a>)}</div>
            <p>{post.stats.likes} likes / {post.stats.dislikes} dislikes</p>
            <div className="compact-actions">
              <AnnouncementActions key={`${post.id}-${post.isSaved}`} post={post} mode={mine ? 'own' : 'feed'} onChanged={() => { window.location.hash = '#my-posts'; }} />
              {!mine && <>
                <a className="btn btn-secondary" href={`#musician?id=${post.userId}`}>Contact musician</a>
                <button className="btn btn-ghost" type="button" disabled={busy} aria-pressed={post.myReaction === 'like'} onClick={async () => {
                  if (await action(`/announcements/${id}/react`, 'POST', { reactionType: 'like' }, 'Like recorded.')) resource.reload();
                }}>Like</button>
                <button className="btn btn-ghost" type="button" disabled={busy} aria-pressed={post.myReaction === 'dislike'} onClick={async () => {
                  if (await action(`/announcements/${id}/react`, 'POST', { reactionType: 'dislike' }, 'Dislike recorded.')) resource.reload();
                }}>Dislike</button>
              </>}
              <ShareButton title={post.title} />
            </div>
          </article>
          <section className="detail-section" aria-labelledby="comments-heading">
            <h2 className="heading-md" id="comments-heading" tabIndex="-1">Comments</h2>
            <form className="form-stack" onSubmit={comment}>
              <FormField id="comment-body" label="Add a comment" required>
                <textarea className="input" value={body} onChange={event => setBody(event.target.value)} maxLength="2000" disabled={busy} />
              </FormField>
              <button className="btn btn-primary" type="submit" disabled={busy || !body.trim()}>{busy ? 'Posting...' : 'Post comment'}</button>
            </form>
            {comments.error && <ErrorState message={comments.error} onRetry={comments.reload} />}
            {!comments.data && !comments.error && <Spinner label="Loading comments" />}
            <div className="stack detail-section">{comments.data?.comments.map(item => (
              <article className="card" key={item.id}>
                <p><a href={`#musician?id=${item.userId}`}>{item.artistName}</a> / <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></p>
                <p className="detail-text">{item.body}</p>
                {(item.userId === ownId || mine) && <button className="text-link" type="button" onClick={() => removeComment(item.id)} disabled={busy}>Remove comment</button>}
              </article>
            ))}</div>
            {comments.data?.comments.length === 0 && <p>No comments yet. Start the conversation.</p>}
            <Pagination pagination={comments.data?.pagination} onPage={setPage} disabled={comments.loading} label="Comment pages" />
          </section>
        </>
      )}
      <Navigation active="feed" />
    </div>
  );
}
