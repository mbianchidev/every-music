import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { t as translate, useI18n } from '../lib/i18n.js';
import { queryString, useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import EmptyState from '../components/EmptyState.jsx';
import Pagination from '../components/Pagination.jsx';
import FormField from '../components/FormField.jsx';
import ApplicantCard, { OWNER_STATUSES } from '../components/ApplicantCard.jsx';
import ApplicationDetails from '../components/ApplicationDetails.jsx';
import { errorText } from '../lib/error-text.js';

const PAGE_SIZE = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const focusMain = () => document.getElementById('main-content')?.focus();
const routeValue = (query, key, allowed) => {
  const value = query?.get(key) ?? '';
  return allowed(value) ? value : '';
};

function usePageClamp(resource, rows, page, setPage) {
  useEffect(() => {
    if (resource.data && !resource.loading && !rows.length && page > 1) setPage(value => value - 1);
  }, [resource.data, resource.loading, rows.length, page, setPage]);
}

function ReceivedApplications({ route }) {
  const { t, formatDate } = useI18n();
  const [filters, setFilters] = useState(() => ({
    announcement: routeValue(route.query, 'announcement', value => UUID.test(value)),
    status: routeValue(route.query, 'status', value => OWNER_STATUSES.includes(value)),
    instrument: routeValue(route.query, 'instrument', value => UUID.test(value)),
    sort: routeValue(route.query, 'sort', value => value === 'oldest') || 'newest',
  }));
  const [page, setPage] = useState(() => Math.max(1, Number.parseInt(route.query.get('page'), 10) || 1));
  useEffect(() => {
    history.replaceState(null, '', `#applications?${queryString({
      view: 'received', ...filters, sort: filters.sort === 'newest' ? '' : filters.sort, page: page > 1 ? page : '',
    })}`);
  }, [filters, page]);
  const calls = useResource('/applications/announcements?pageSize=100', { events: 'applications.changed,announcements.changed' });
  const instruments = useResource('/catalog/instruments', { auth: false, reconnect: false });
  const resource = useResource(`/applications/received?${queryString({
    announcementId: filters.announcement, status: filters.status, instrumentId: filters.instrument,
    sort: filters.sort === 'newest' ? '' : filters.sort, page, pageSize: PAGE_SIZE,
  })}`, { events: 'applications.changed,announcements.changed,profiles.changed' });
  const rows = resource.data?.applications || [];
  usePageClamp(resource, rows, page, setPage);
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  const counts = resource.data?.counts;
  const selected = resource.data?.announcement;
  const filtered = Boolean(filters.status || filters.instrument);
  const changePage = value => { setPage(value); focusMain(); };
  return (
    <div>
      <form className="filters application-filters" aria-label={t('applications.received.filters')} onSubmit={event => event.preventDefault()}>
        <FormField id="applications-announcement" label={t('applications.received.announcement')}>
          <select className="input" value={filters.announcement} onChange={event => update('announcement', event.target.value)}>
            <option value="">{t('applications.received.allAnnouncements')}</option>
            {filters.announcement && !calls.data?.announcements.some(item => item.id === filters.announcement) && selected && (
              <option value={selected.id}>{selected.isOpen ? selected.title : t('applications.received.closedOption', { title: selected.title })}</option>
            )}
            {calls.data?.announcements.map(item => (
              <option key={item.id} value={item.id}>
                {`${item.isOpen ? item.title : t('applications.received.closedOption', { title: item.title })} (${item.counts.total})`}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="applications-status" label={t('applications.received.status')}>
          <select className="input" value={filters.status} onChange={event => update('status', event.target.value)}>
            <option value="">{t('applications.received.allStatuses', { count: counts?.total ?? 0 })}</option>
            {OWNER_STATUSES.map(status => (
              <option key={status} value={status}>{t('applications.received.statusOption', { status: t(`applications.status.${status}`), count: counts?.[status] ?? 0 })}</option>
            ))}
          </select>
        </FormField>
        <FormField id="applications-instrument" label={t('applications.received.instrument')}>
          <select className="input" value={filters.instrument} disabled={!instruments.data} onChange={event => update('instrument', event.target.value)}>
            <option value="">{t('applications.received.allInstruments')}</option>
            {instruments.data?.instruments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </FormField>
        <FormField id="applications-sort" label={t('applications.received.sort')}>
          <select className="input" value={filters.sort} onChange={event => update('sort', event.target.value)}>
            <option value="newest">{t('applications.received.newest')}</option>
            <option value="oldest">{t('applications.received.oldest')}</option>
          </select>
        </FormField>
      </form>
      {calls.error && <ErrorState title={t('applications.loadError')} message={calls.error} onRetry={calls.reload} />}
      {resource.error && <ErrorState title={t('applications.loadError')} message={resource.error} onRetry={resource.reload} />}
      {selected && !selected.isOpen && (
        <p className="status-message">{t('applications.received.closedNotice', { date: formatDate(selected.retentionEndsAt) })}</p>
      )}
      {counts && <p className="results-summary" role="status">{t('applications.received.counts', counts)}</p>}
      {!resource.data && !resource.error ? <Spinner label={t('applications.received.loading')} /> : resource.data && (rows.length ? (
        <>
          <div className="stack" aria-busy={resource.loading}>
            {rows.map(item => <ApplicantCard key={item.id} application={item} showAnnouncement={!filters.announcement} onChanged={resource.reload} />)}
          </div>
          <Pagination pagination={resource.data.pagination} onPage={changePage} disabled={resource.loading} label={t('applications.received.pages')} />
        </>
      ) : filtered || counts.total ? <p className="card">{t('applications.received.emptyFiltered')}</p> : (
        <EmptyState title={t('applications.received.emptyTitle')} message={t('applications.received.emptyMessage')}
          actionLabel={t('applications.received.emptyAction')} actionHash="#create" />
      ))}
    </div>
  );
}

function SentApplication({ application, onChanged }) {
  const { t, formatDate } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { announcement } = application;
  const withdraw = async () => {
    if (!window.confirm(t('applications.apply.withdrawConfirm'))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/applications/${application.id}`, { method: 'DELETE', auth: true });
      focusMain();
      onChanged();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <article className="card application-card" aria-labelledby={`sent-${application.id}`}>
      <div className="application-summary">
        <h2 className="heading-md" id={`sent-${application.id}`}>
          {announcement.isOpen ? <a href={`#announcement?id=${announcement.id}`}>{announcement.title}</a> : announcement.title}
        </h2>
        <span className={`tag application-status ${['withdrawn', 'closed'].includes(application.status) ? 'tag-muted' : ''}`}>
          {t(`applications.applicantStatus.${application.status}`)}
        </span>
      </div>
      <p className="application-meta">
        <a href={`#musician?id=${announcement.ownerId}`}>{t('applications.sent.to', { name: announcement.ownerName })}</a>
        <time className="field-hint" dateTime={application.createdAt}>{t('applications.sent.sentOn', { date: formatDate(application.createdAt) })}</time>
      </p>
      {application.status === 'closed' && <p className="field-hint">{t('applications.sent.closedHint')}</p>}
      <ApplicationDetails application={application} messageLabel={t('applications.apply.yourMessage')} />
      {application.status !== 'withdrawn' && <div className="compact-actions">
        <button className="btn btn-danger" type="button" disabled={busy} onClick={withdraw}
          aria-label={t('applications.sent.withdrawNamed', { title: announcement.title })}>
          {busy ? t('applications.apply.withdrawing') : t('applications.apply.withdraw')}
        </button>
      </div>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </article>
  );
}

function SentApplications() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const resource = useResource(`/applications/me?page=${page}&pageSize=${PAGE_SIZE}`, { events: 'applications.changed,announcements.changed' });
  const rows = resource.data?.applications || [];
  usePageClamp(resource, rows, page, setPage);
  const changePage = value => { setPage(value); focusMain(); };
  return (
    <div>
      {resource.error && <ErrorState title={t('applications.loadError')} message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('applications.sent.loading')} /> : resource.data && (rows.length ? (
        <>
          <div className="stack" aria-busy={resource.loading}>
            {rows.map(item => <SentApplication key={item.id} application={item} onChanged={resource.reload} />)}
          </div>
          <Pagination pagination={resource.data.pagination} onPage={changePage} disabled={resource.loading} label={t('applications.sent.pages')} />
        </>
      ) : (
        <EmptyState title={t('applications.sent.emptyTitle')} message={t('applications.sent.emptyMessage')}
          actionLabel={t('applications.sent.emptyAction')} actionHash="#feed" />
      ))}
    </div>
  );
}

export default function ApplicationsScreen({ route }) {
  const { t } = useI18n();
  const view = route?.query.get('view') === 'sent' ? 'sent' : 'received';
  return (
    <div className="container">
      <PageHeader eyebrow={t('applications.eyebrow')} title={t('applications.title')} subtitle={t('applications.subtitle')} />
      <nav className="discovery-tabs" aria-label={t('applications.tabs.label')}>
        <a href="#applications?view=received" aria-current={view === 'received' ? 'page' : undefined}>{t('applications.tabs.received')}</a>
        <a href="#applications?view=sent" aria-current={view === 'sent' ? 'page' : undefined}>{t('applications.tabs.sent')}</a>
      </nav>
      {view === 'sent' ? <SentApplications /> : <ReceivedApplications route={route} />}
    </div>
  );
}

export const applicationsRoute = {
  screen: ApplicationsScreen,
  protected: true,
  get title() { return translate('applications.title'); },
};
