import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import Pagination from '../components/Pagination.jsx';

export default function NotificationsScreen() {
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
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow="Stay in the loop" title="Notifications" subtitle="New conversations, a little feedback, and calls worth knowing about." />
      <div className="compact-actions">
        <button className="btn btn-secondary" type="button" onClick={() => read(null)} disabled={busy || !resource.data?.unreadCount}>Mark all read</button>
        <a className="text-link" href="#settings">Notification preferences</a>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label="Loading notifications" /> : resource.data && <>
        <p role="status">{resource.data.unreadCount} unread notifications</p>
        {!resource.data.notifications.length && <p>You are all caught up.</p>}
        <ul className="notification-list">{resource.data.notifications.map(item => (
          <li className={`card ${item.readAt ? '' : 'notification-unread'}`} key={item.id}>
            <p className="eyebrow">{item.readAt ? 'Read' : 'Unread'}</p>
            <h2 className="heading-md"><a id={`notification-${item.id}`} href={item.link}>{item.title}</a></h2>
            <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
            {!item.readAt && <button className="text-link" type="button" disabled={busy} onClick={() => read(item)}>Mark read</button>}
          </li>
        ))}</ul>
        <Pagination pagination={resource.data.pagination} onPage={setPage} disabled={resource.loading} />
      </>}
    </div>
  );
}
