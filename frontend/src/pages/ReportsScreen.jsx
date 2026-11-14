import { useState } from 'react';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Pagination from '../components/Pagination.jsx';
import { useI18n } from '../lib/i18n.js';
import { reportCategory, reportStatus } from '../lib/report-labels.js';

export default function ReportsScreen() {
  const { t, formatDate } = useI18n();
  const when = value => formatDate(value, { dateStyle: 'medium', timeStyle: 'short' });
  const [page, setPage] = useState(1);
  const resource = useResource(`/reports/me?page=${page}&pageSize=20`, { events: 'reports.changed' });
  return <div className="container">
    <PageHeader eyebrow={t('reports.eyebrow')} title={t('app.routes.reports')} subtitle={t('reports.subtitle')} />
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {!resource.data && !resource.error ? <Spinner label={t('reports.loading')} /> : resource.data && <>
      {!resource.data.reports.length ? <p>{t('reports.none')}</p> : <div className="stack">
        {resource.data.reports.map(report => <article className="card" key={report.id}>
          <h2 className="heading-md">{report.reportedName}</h2>
          <p><strong>{t('reports.statusLine', { status: reportStatus(report.status) })}</strong> / {reportCategory(report.category)}</p>
          <p className="detail-text">{report.details}</p>
          <p className="field-hint">{t('reports.submitted')} <time dateTime={report.createdAt}>{when(report.createdAt)}</time></p>
          {report.reviewedAt && <p className="field-hint">{t('reports.reviewed')} <time dateTime={report.reviewedAt}>{when(report.reviewedAt)}</time></p>}
        </article>)}
      </div>}
      <Pagination pagination={resource.data.pagination} disabled={resource.loading} onPage={setPage} label={t('reports.pages')} />
    </>}
  </div>;
}
