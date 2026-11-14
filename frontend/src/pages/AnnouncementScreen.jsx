import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import FormField from '../components/FormField.jsx';
import Pagination from '../components/Pagination.jsx';
import ShareButton from '../components/ShareButton.jsx';
import AnnouncementActions from '../components/AnnouncementActions.jsx';
import ManagedImage from '../components/ManagedImage.jsx';
import ApplicationPanel from '../components/ApplicationPanel.jsx';
import VerifiedBadge from '../components/VerifiedBadge.jsx';
import AnnouncementStats from '../components/AnnouncementStats.jsx';
import OrganizationByline from '../components/OrganizationByline.jsx';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';
import { richText } from '../lib/rich-text.jsx';

export default function AnnouncementScreen({ route }) {
  const { t, formatDate } = useI18n();
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
      .catch(failure => { console.warn('Announcement view measurement failed', failure); setError(errorText(failure)); });
  }, [post?.id, mine]);
  const action = async (path, method, data, success) => {
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(path, { method, auth: true, body: data });
      setMessage(success);
      return true;
    } catch (failure) { setError(errorText(failure)); return false; }
    finally { setBusy(false); }
  };
  const comment = async event => {
    event.preventDefault();
    if (await action(`/announcements/${id}/comments`, 'POST', { body }, t('feed.announcement.commentPosted'))) {
      setBody(''); setPage(1); comments.reload();
    }
  };
  const removeComment = async commentId => {
    if (!window.confirm(t('feed.announcement.confirmRemoveComment'))) return;
    if (await action(`/announcements/${id}/comments/${commentId}`, 'DELETE', undefined, t('feed.announcement.commentRemoved'))) {
      document.getElementById('comments-heading')?.focus(); comments.reload();
    }
  };
  return (
    <div className="container">
      <PageHeader eyebrow={post?.isPublished === false ? t('feed.announcement.draft') : t('feed.announcement.openCall')} title={post?.title || t('app.routes.announcement')} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!post && !resource.error ? <Spinner label={t('feed.announcement.loading')} /> : post && (
        <>
          <article className="card">
            {post.pictureUrl && <ManagedImage className="content-image" src={post.pictureUrl} authenticated={post.isPublished === false} alt={t('feed.card.image', { title: post.title })} />}
            <p>{richText(t('feed.announcement.postedBy'), {
              name: <><a href={`#musician?id=${post.userId}`}>{post.creatorName || t('app.routes.musician')}</a><VerifiedBadge verifiedAt={post.creatorVerifiedAt} /></>,
              date: <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>,
            })}</p>
            <OrganizationByline organization={post.organization} />
            <p className="detail-text">{post.description}</p>
            <p>{[[post.location.city, post.location.state, post.location.country].filter(Boolean).join(', ') || t('feed.card.flexible'),
              post.isRemote && t('feed.search.remote'), post.isCoverBand && t('feed.announcement.coverBand')].filter(Boolean).join(' / ')}</p>
            {!!post.instruments.length && <div><h2 className="heading-md">{t('feed.announcement.instruments')}</h2><div className="tag-list">{post.instruments.map(item => <span className="tag" key={item.instrument_id}>{item.name}</span>)}</div></div>}
            {!!post.genres.length && <div><h2 className="heading-md">{t('ui.catalog.genres')}</h2><div className="tag-list">{post.genres.map(item => <span className="tag" key={item.genre_id}>{item.name}</span>)}</div></div>}
            <div className="compact-actions">{post.links.map((link, index) => <a key={index} href={link.url} target="_blank" rel="noopener noreferrer">{t(`applications.linkTypes.${link.link_type}`)}</a>)}</div>
            <AnnouncementStats post={post} />
            <div className="compact-actions">
              <AnnouncementActions key={`${post.id}-${post.isSaved}`} post={post} mode={mine ? 'own' : 'feed'} onChanged={() => { window.location.hash = '#my-posts'; }} />
              {!mine && <>
                <a className="btn btn-secondary" href={`#musician?id=${post.userId}`}>{t('feed.announcement.contact')}</a>
                <button className="btn btn-ghost" type="button" disabled={busy} aria-pressed={post.myReaction === 'like'} onClick={async () => {
                  if (await action(`/announcements/${id}/react`, 'POST', { reactionType: 'like' }, t('feed.announcement.likeRecorded'))) resource.reload();
                }}>{t('feed.announcement.like')}</button>
                <button className="btn btn-ghost" type="button" disabled={busy} aria-pressed={post.myReaction === 'dislike'} onClick={async () => {
                  if (await action(`/announcements/${id}/react`, 'POST', { reactionType: 'dislike' }, t('feed.announcement.dislikeRecorded'))) resource.reload();
                }}>{t('feed.announcement.dislike')}</button>
              </>}
              <ShareButton title={post.title} />
            </div>
          </article>
          <ApplicationPanel post={post} mine={mine} />
          <section className="detail-section" aria-labelledby="comments-heading">
            <h2 className="heading-md" id="comments-heading" tabIndex="-1">{t('feed.announcement.comments')}</h2>
            <form className="form-stack" onSubmit={comment}>
              <FormField id="comment-body" label={t('feed.announcement.addComment')} required>
                <textarea className="input" value={body} onChange={event => setBody(event.target.value)} maxLength="2000" disabled={busy} />
              </FormField>
              <button className="btn btn-primary" type="submit" disabled={busy || !body.trim()}>{busy ? t('feed.announcement.posting') : t('feed.announcement.postComment')}</button>
            </form>
            {comments.error && <ErrorState message={comments.error} onRetry={comments.reload} />}
            {!comments.data && !comments.error && <Spinner label={t('feed.announcement.loadingComments')} />}
            <div className="stack detail-section">{comments.data?.comments.map(item => (
              <article className="card" key={item.id}>
                <p><a href={`#musician?id=${item.userId}`}>{item.artistName}</a> / <time dateTime={item.createdAt}>{formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></p>
                <p className="detail-text">{item.body}</p>
                {(item.userId === ownId || mine) && <button className="text-link" type="button" onClick={() => removeComment(item.id)} disabled={busy}>{t('feed.announcement.removeComment')}</button>}
              </article>
            ))}</div>
            {comments.data?.comments.length === 0 && <p>{t('feed.announcement.noComments')}</p>}
            <Pagination pagination={comments.data?.pagination} onPage={setPage} disabled={comments.loading} label={t('feed.announcement.commentPages')} />
          </section>
        </>
      )}
    </div>
  );
}
