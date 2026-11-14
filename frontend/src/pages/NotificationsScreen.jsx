import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import { notificationText } from '../lib/notification-text.js';
import { errorText } from '../lib/error-text.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import Pagination from '../components/Pagination.jsx';

export default function NotificationsScreen() {
  const i18n = useI18n();
  const { t, formatDate } = i18n;
  const [page, setPage] = useState(1);
  const resource = useResource(`/notifications?page=${page}&pageSize=20`, { events: 'notifications.changed' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const read = async item => {
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/notifications${item ? `/${item.id}` : ''}`, { method: 'PATCH', auth: true, body: { read: true } });
      document.getElementById(item ? `notification-${item.id}` : 'main-content')?.focus();
      resource.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow={t('inbox.eyebrow')} title={t('app.routes.notifications')} subtitle={t('inbox.subtitle')} />
      <div className="compact-actions">
        <button className="btn btn-secondary" type="button" onClick={() => read(null)} disabled={busy || !resource.data?.unreadCount}>{t('inbox.markAll')}</button>
        <a className="text-link" href="#settings?section=notifications">{t('notifications.center.manage')}</a>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('inbox.loading')} /> : resource.data && <>
        <p role="status">{t('inbox.unread', { count: resource.data.unreadCount })}</p>
        {!resource.data.notifications.length && <p>{t('inbox.caughtUp')}</p>}
        <ul className="notification-list">{resource.data.notifications.map(item => {
          const text = notificationText(i18n, item);
          return <li className={`card ${item.readAt ? '' : 'notification-unread'}`} key={item.id}>
            <p className="eyebrow">{item.readAt ? t('inbox.read') : t('inbox.unreadLabel')}</p>
            <h2 className="heading-md"><a id={`notification-${item.id}`} href={item.link}>{text.title}</a></h2>
            {text.detail && <p className="body-muted notification-detail">{text.detail}</p>}
            <time dateTime={item.createdAt}>{formatDate(item.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
            {!item.readAt && <button className="text-link" type="button" disabled={busy} onClick={() => read(item)}>{t('inbox.markRead')}</button>}
          </li>;
        })}</ul>
        <Pagination pagination={resource.data.pagination} onPage={setPage} disabled={resource.loading} />
      </>}
    </div>
  );
}
