import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';
import { useResource } from '../../lib/resources.js';
import FormField from '../FormField.jsx';
import Spinner from '../Spinner.jsx';
import ErrorState from '../ErrorState.jsx';
import Pagination from '../Pagination.jsx';
import Avatar from '../Avatar.jsx';
import EventReportButton from './EventReportButton.jsx';

// Attendee board: people going or interested and the organizers can read and
// post; authors, organizers, and administrators can delete messages.
export default function EventDiscussion({ event }) {
  const { t, formatDate } = useI18n();
  const [page, setPage] = useState(1);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const allowed = event.viewer.canDiscuss && event.visibility === 'published';
  const resource = useResource(allowed ? `/gigs/${event.id}/posts?page=${page}&pageSize=20` : null, { events: 'gigs.posts.changed' });
  const post = async submitted => {
    submitted.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/gigs/${event.id}/posts`, { method: 'POST', auth: true, body: { body } });
      setBody(''); setPage(1); setMessage(t('events.discussion.posted'));
      resource.reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const remove = async item => {
    if (!window.confirm(t('events.discussion.deleteConfirm'))) return;
    setError(''); setMessage('');
    try {
      await conduit.transmit(`/gigs/${event.id}/posts/${item.id}`, { method: 'DELETE', auth: true });
      setMessage(t('events.discussion.deleted'));
      resource.reload();
      document.getElementById('event-discussion-heading')?.focus();
    } catch (failure) { setError(failure.message); }
  };
  return (
    <section className="detail-section event-discussion" aria-labelledby="event-discussion-heading">
      <h2 className="heading-md" id="event-discussion-heading" tabIndex="-1">{t('events.discussion.heading')}</h2>
      {!allowed ? <p className="body-muted">{t(event.visibility === 'published' ? 'events.discussion.locked' : 'events.discussion.draft')}</p> : <>
        <p className="body-muted">{t('events.discussion.intro')}</p>
        <form className="form-stack" onSubmit={post}>
          <FormField id="event-post-body" label={t('events.discussion.label')} hint={t('events.discussion.hint')}>
            <textarea className="input" value={body} maxLength="2000" disabled={busy} onChange={changed => setBody(changed.target.value)} />
          </FormField>
          <div><button className="btn btn-primary" type="submit" disabled={busy || !body.trim()}>
            {busy ? t('events.discussion.posting') : t('events.discussion.post')}</button></div>
        </form>
        <div role="status">{message && <p className="success">{message}</p>}</div>
        {error && <p className="error" role="alert">{error}</p>}
        {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
        {!resource.data && !resource.error ? <Spinner label={t('events.discussion.loading')} /> : resource.data && <>
          {!resource.data.posts.length ? <p className="body-muted">{t('events.discussion.empty')}</p>
            : <ul className="post-list event-posts">{resource.data.posts.map(item => <li className="card" key={item.id}>
              <div className="card-author"><Avatar name={item.author.name} src={item.author.pictureUrl} />
                <a href={`#musician?id=${item.author.userId}`}>{item.isOwn ? t('events.discussion.you') : item.author.name}</a>
                <time dateTime={item.createdAt}>{formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </div>
              <p className="detail-text">{item.body}</p>
              <div className="compact-actions">
                {item.canDelete && <button className="text-link" type="button" onClick={() => remove(item)}>
                  {t('events.discussion.delete', { name: item.isOwn ? t('events.discussion.you') : item.author.name })}</button>}
                {!item.isOwn && <EventReportButton event={event} post={item} />}
              </div>
            </li>)}</ul>}
          <Pagination pagination={resource.data.pagination} onPage={setPage} disabled={resource.loading} label={t('events.discussion.pages')} />
        </>}
      </>}
    </section>
  );
}
