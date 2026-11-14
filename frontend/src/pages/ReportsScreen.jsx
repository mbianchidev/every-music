import { useState } from 'react';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Pagination from '../components/Pagination.jsx';

export default function ReportsScreen() {
  const [page, setPage] = useState(1);
  const resource = useResource(`/reports/me?page=${page}&pageSize=20`, { events: 'reports.changed' });
  return <div className="container">
    <PageHeader eyebrow="Safety" title="Your reports" subtitle="Concerns you chose to share with administrators and their review status." />
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {!resource.data && !resource.error ? <Spinner label="Loading your reports" /> : resource.data && <>
      {!resource.data.reports.length ? <p>You have not submitted any reports. Use Report musician on a profile or Report message in a conversation.</p> : <div className="stack">
        {resource.data.reports.map(report => <article className="card" key={report.id}>
          <h2 className="heading-md">{report.reportedName}</h2>
          <p><strong>Status: {report.status}</strong> / {report.category}</p>
          <p className="detail-text">{report.details}</p>
          <p className="field-hint">Submitted <time dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time></p>
          {report.reviewedAt && <p className="field-hint">Reviewed <time dateTime={report.reviewedAt}>{new Date(report.reviewedAt).toLocaleString()}</time></p>}
        </article>)}
      </div>}
      <Pagination pagination={resource.data.pagination} disabled={resource.loading} onPage={setPage} label="Report pages" />
    </>}
  </div>;
}
