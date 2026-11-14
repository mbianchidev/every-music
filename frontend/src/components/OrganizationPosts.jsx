import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { can } from '../lib/organizations.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import Pagination from './Pagination.jsx';

export function PostList({ posts, onRemove, busy, showOrganization = false }) {
  const { t, formatDate } = useI18n();
  return (
    <ol className="post-list">{posts.map(post => (
      <li className="card" key={post.id}>
        <p className="eyebrow">{t(`organizations.posts.sources.${post.source}`)}{showOrganization && post.organization && <> / <a href={`#organization?id=${post.organization.id}`}>{post.organization.name}</a></>}</p>
        {post.title && <h3>{post.url ? <a href={post.url} target="_blank" rel="noopener noreferrer">{post.title}</a> : post.title}</h3>}
        {post.body && <p className="detail-text">{post.body}</p>}
        {post.url && !post.title && <p><a href={post.url} target="_blank" rel="noopener noreferrer">{t('organizations.posts.openLink')}</a></p>}
        <p className="body-muted"><time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>{post.authorName && ` / ${post.authorName}`}</p>
        {onRemove && post.source !== 'release' && <button className="text-link" type="button" disabled={busy} onClick={() => onRemove(post)}>
          {t('organizations.posts.remove', { title: post.title || formatDate(post.publishedAt) })}
        </button>}
      </li>
    ))}</ol>
  );
}

export default function OrganizationPosts({ organization }) {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const resource = useResource(`/organizations/${organization.id}/posts?page=${page}&pageSize=10`, { events: 'organizations.changed' });
  const [draft, setDraft] = useState({ title: '', body: '', url: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const allowed = can(organization, 'post_announcements') && organization.managed;
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/posts`, { method: 'POST', auth: true, body: draft });
      setDraft({ title: '', body: '', url: '' }); setPage(1); setMessage(t('organizations.posts.published')); resource.reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const remove = async post => {
    if (!window.confirm(t('organizations.posts.confirmRemove'))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/posts/${post.id}`, { method: 'DELETE', auth: true });
      setMessage(t('organizations.posts.removed')); resource.reload();
      document.getElementById('posts-heading')?.focus();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="posts-heading">
      <h2 className="heading-md" id="posts-heading" tabIndex="-1">{t('organizations.posts.title')}</h2>
      <p className="body-muted">{t('organizations.posts.intro')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {allowed && <form className="form-stack" onSubmit={submit}>
        <FormField id="post-title" label={t('organizations.posts.fields.title')}>
          <input className="input" value={draft.title} maxLength="255" disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} />
        </FormField>
        <FormField id="post-body" label={t('organizations.posts.fields.body')}>
          <textarea className="input" value={draft.body} maxLength="4000" disabled={busy} onChange={event => setDraft({ ...draft, body: event.target.value })} />
        </FormField>
        <FormField id="post-url" label={t('organizations.posts.fields.url')}>
          <input className="input" type="url" value={draft.url} maxLength="2048" disabled={busy} onChange={event => setDraft({ ...draft, url: event.target.value })} />
        </FormField>
        <button className="btn btn-primary" type="submit" disabled={busy || (!draft.title.trim() && !draft.body.trim())}>{busy ? t('organizations.common.saving') : t('organizations.posts.publish')}</button>
      </form>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('organizations.posts.loading')} /> : resource.data && <>
        {!resource.data.posts.length && <p>{t('organizations.posts.empty')}</p>}
        <PostList posts={resource.data.posts} busy={busy} onRemove={can(organization, 'post_announcements') ? remove : null} />
        <Pagination pagination={resource.data.pagination} onPage={setPage} disabled={resource.loading} label={t('organizations.posts.pages')} />
      </>}
    </section>
  );
}
