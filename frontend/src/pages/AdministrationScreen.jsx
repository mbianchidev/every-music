import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import FormField from '../components/FormField.jsx';
import Pagination from '../components/Pagination.jsx';
import ActivityReport from '../components/ActivityReport.jsx';

const operations = { review: 'Mark reviewed', dismiss: 'Dismiss report', remove_message: 'Remove reported message', suspend_user: 'Suspend reported account' };

export default function AdministrationScreen({ route }) {
  const tab = ['overview', 'reports', 'audit'].includes(route.query.get('tab')) ? route.query.get('tab') : 'overview';
  const id = route.query.get('id');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('open');
  const [action, setAction] = useState('review');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path = tab === 'overview' ? '/admin/analytics' : tab === 'audit' ? `/admin/audit?page=${page}&pageSize=20`
    : id ? `/admin/reports/${encodeURIComponent(id)}` : `/admin/reports?status=${status}&page=${page}&pageSize=20`;
  const resource = useResource(path, { events: id ? 'account.changed' : 'admin.changed,account.changed' });
  const data = resource.data;
  const resolve = async event => {
    event.preventDefault();
    if (['remove_message', 'suspend_user'].includes(action) && !window.confirm(`${operations[action]} for ${data.reportedName}? This action is recorded in the administrator audit log.`)) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/admin/reports/${id}`, { method: 'PATCH', auth: true, body: { action, note } });
      window.location.hash = '#admin?tab=reports';
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <div className="container">
    <PageHeader eyebrow="Administration" title="Platform and safety" subtitle="Aggregate activity and report-based moderation. Private conversations are not available for browsing." />
    <nav className="discovery-tabs" aria-label="Administration sections">
      {Object.entries({ overview: 'Overview', reports: 'Reports', audit: 'Audit log' }).map(([value, label]) =>
        <a key={value} href={`#admin?tab=${value}`} aria-current={tab === value ? 'page' : undefined}>{label}</a>)}
    </nav>
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {error && <p className="error" role="alert">{error}</p>}
    {tab === 'reports' && !id && <FormField id="admin-report-status" label="Report status"><select className="input" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
      <option value="open">Open</option><option value="reviewed">Reviewed</option><option value="actioned">Action taken</option><option value="dismissed">Dismissed</option><option value="">All statuses</option>
    </select></FormField>}
    {!data && !resource.error ? <Spinner label="Loading administration" /> : data && <>
      {tab === 'overview' && <>
        <h2 className="heading-md">Operational account totals</h2>
        <dl className="metric-grid">{Object.entries({ accounts: 'Accounts', activeAccounts: 'Active accounts', administrators: 'Administrators', platformOptIns: 'Platform analytics opt-ins', openReports: 'Open reports' }).map(([key, label]) =>
          <div className="card" key={key}><dt>{label}</dt><dd>{data.totals[key]}</dd></div>)}</dl>
        <h2 className="heading-md">Consented platform activity</h2>
        <p className="body-muted">Activity appears only when both participants separately opt in to platform aggregates. Counts are not unique visitors or all platform traffic. No visitor identities or message text are included. Historical personal analytics is not imported.</p>
        <ActivityReport daily={data.daily} content={data.content} caption="Reach of opted-in public calls (last 30 days)" />
      </>}
      {tab === 'reports' && !id && <>
        {!data.reports.length ? <p className="detail-section">No reports match this status.</p> : <div className="table-wrap"><table>
          <caption>Report queue</caption>
          <thead><tr><th scope="col">Musician</th><th scope="col">Reason</th><th scope="col">Content</th><th scope="col">Status</th><th scope="col">Review</th></tr></thead>
          <tbody>{data.reports.map(report => <tr key={report.id}>
            <th scope="row">{report.reportedName}</th><td>{report.category}</td><td>{report.hasMessage ? 'Selected message' : 'Profile concern'}</td><td>{report.status}</td>
            <td><a href={`#admin?tab=reports&id=${report.id}`} aria-label={`Review report about ${report.reportedName}`}>Review</a></td>
          </tr>)}</tbody>
        </table></div>}
        <Pagination pagination={data.pagination} disabled={resource.loading} onPage={setPage} label="Moderation pages" />
      </>}
      {tab === 'reports' && id && <article className="card report-detail">
        <h2 className="heading-md">Report about {data.reportedName}</h2>
        <p><strong>Status: {data.status}</strong> / {data.category}</p>
        <h3>Reporter-provided details</h3><p className="detail-text">{data.details}</p>
        {data.evidence && <>
          <h3>Selected message shared by the reporter</h3><blockquote className="reported-excerpt">{data.evidence}</blockquote>
          <p className="field-hint">{data.evidenceVerified ? 'The signature matches the sender key recorded for this message. This does not independently verify a real-world identity.' : 'Legacy server-stored message. No end-to-end sender signature is available.'}</p>
        </>}
        <p className="field-hint">Viewing this report is audited. No other messages are disclosed.</p>
        {data.status === 'open' ? <form className="form-stack detail-section" onSubmit={resolve}>
          <FormField id="moderation-action" label="Decision" required><select className="input" value={action} onChange={event => setAction(event.target.value)} disabled={busy}>
            {Object.entries(operations).filter(([key]) => key !== 'remove_message' || data.messageId).map(([key, label]) => <option value={key} key={key}>{label}</option>)}
          </select></FormField>
          <FormField id="moderation-note" label="Internal decision note" hint="This note is visible to administrators, not the reporter." required>
            <textarea className="input" value={note} onChange={event => setNote(event.target.value)} minLength="5" maxLength="2000" disabled={busy} />
          </FormField>
          <button className="btn btn-primary" type="submit" disabled={busy || note.trim().length < 5}>{busy ? 'Recording decision...' : 'Record decision'}</button>
        </form> : <p className="detail-text">{data.moderatorNote}</p>}
      </article>}
      {tab === 'audit' && <>
        <p className="body-muted">Role changes, report access, and moderation decisions. Message contents and report details are not copied into this log. A blank actor means the operator CLI.</p>
        <div className="table-wrap"><table>
          <caption>Administrator audit log</caption>
          <thead><tr><th scope="col">Date</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Target</th></tr></thead>
          <tbody>{data.entries.map(entry => <tr key={entry.id}><th scope="row">{new Date(entry.createdAt).toLocaleString()}</th><td>{entry.action.replaceAll('_', ' ')}</td><td className="identifier">{entry.actorId || 'Operator CLI'}</td><td className="identifier">{entry.targetId || 'None'}</td></tr>)}</tbody>
        </table></div>
        <Pagination pagination={data.pagination} disabled={resource.loading} onPage={setPage} label="Audit pages" />
      </>}
    </>}
  </div>;
}
