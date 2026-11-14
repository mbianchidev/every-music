import { useEffect, useState } from 'react';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import AnnouncementActions from '../components/AnnouncementActions.jsx';
import Pagination from '../components/Pagination.jsx';
import ApplicantsLink from '../components/ApplicantsLink.jsx';
import QuotaNotice from '../components/QuotaNotice.jsx';
import { useI18n } from '../lib/i18n.js';
import { PromoteButton } from '../components/monetization/SpendDialog.jsx';

export default function AnnouncementListScreen({ mode }) {
  const { t } = useI18n();
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
      <PageHeader eyebrow={t('app.nav.sections.yourSpace')} title={t(`feed.list.${mode}.title`)} subtitle={t(`feed.list.${mode}.subtitle`)}
        actions={!saved && <a className="btn btn-primary" href="#create">{t('app.nav.postCall')}</a>} />
      <div className="compact-actions"><QuotaNotice kind={saved ? 'savedAnnouncements' : 'activeAnnouncements'} />{saved && <a href="#saved-searches">{t('discoveryExtras.saved.title')}</a>}</div>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('feed.list.loading')} /> : rows.length ? (
        <>
          <div className="grid" aria-busy={resource.loading}>
            {rows.map(post => <AnnouncementCard key={post.id} post={post} actions={<><AnnouncementActions post={post} mode={saved ? 'saved' : 'own'} onChanged={resource.reload} />{!saved && <ApplicantsLink post={post} />}{!saved && post.isPublished && <PromoteButton mode="announcement" announcement={post} />}</>} />)}
          </div>
          <Pagination pagination={resource.data?.pagination} onPage={changePage} disabled={resource.loading} />
        </>
      ) : !resource.error && <EmptyState title={t(`feed.list.${mode}.emptyTitle`)} message={t(`feed.list.${mode}.emptyMessage`)} actionLabel={t(`feed.list.${mode}.emptyAction`)} actionHash={saved ? '#feed' : '#create'} />}
    </div>
  );
}
