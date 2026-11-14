import { useEffect, useState } from 'react';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import AnnouncementActions from '../components/AnnouncementActions.jsx';
import Pagination from '../components/Pagination.jsx';

export default function AnnouncementListScreen({ mode }) {
  const [page, setPage] = useState(1);
  const saved = mode === 'saved';
  const resource = useResource(`/announcements/${saved ? 'saved' : 'me'}?page=${page}&pageSize=12`, { events: 'announcements.changed,saved.changed,profiles.changed' });
  const rows = resource.data?.announcements || [];
  useEffect(() => {
    if (resource.data && !resource.loading && !rows.length && page > 1) setPage(value => value - 1);
  }, [resource.data, resource.loading, rows.length, page]);
  const changePage = value => { setPage(value); document.getElementById('main-content')?.focus(); };
  return (
    <div className="container">
      <PageHeader eyebrow="Your space" title={saved ? 'Saved calls' : 'My calls'} subtitle={saved ? 'Good possibilities. Keep them close.' : 'Your published calls and private drafts, all in one place.'}
        actions={!saved && <a className="btn btn-primary" href="#create">Post a call</a>} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label="Loading announcements" /> : rows.length ? (
        <>
          <div className="grid" aria-busy={resource.loading}>
            {rows.map(post => <AnnouncementCard key={post.id} post={post} actions={<AnnouncementActions post={post} mode={saved ? 'saved' : 'own'} onChanged={resource.reload} />} />)}
          </div>
          <Pagination pagination={resource.data?.pagination} onPage={changePage} disabled={resource.loading} />
        </>
      ) : !resource.error && <EmptyState title={saved ? 'Nothing saved yet' : 'No announcements yet'} message={saved ? 'Save an announcement from the feed.' : 'Publish what you are looking for.'} actionLabel={saved ? 'Go to feed' : 'Create announcement'} actionHash={saved ? '#feed' : '#create'} />}
    </div>
  );
}
