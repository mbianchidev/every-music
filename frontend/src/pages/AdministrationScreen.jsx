import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import FormField from '../components/FormField.jsx';
import Pagination from '../components/Pagination.jsx';
import ActivityReport from '../components/ActivityReport.jsx';
import MarketplaceModeration from '../components/marketplace/MarketplaceModeration.jsx';
import VerificationReviewQueue from '../components/VerificationReviewQueue.jsx';
import HelpDesk from '../components/HelpDesk.jsx';
import OrganizationClaimReview from '../components/OrganizationClaimReview.jsx';
import OrganizationVerificationAdmin from '../components/OrganizationVerificationAdmin.jsx';
import MonetizationConsole from '../components/monetization/MonetizationConsole.jsx';
import { hasTranslation, useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';
import { reportCategory, reportStatus } from '../lib/report-labels.js';

const operations = ['review', 'dismiss', 'remove_message', 'suspend_user'];
const totals = ['accounts', 'activeAccounts', 'administrators', 'platformOptIns', 'openReports'];

export default function AdministrationScreen({ route }) {
  const { t, formatDate, formatNumber } = useI18n();
  const auditAction = action => (hasTranslation(`admin.audit.actions.${action}`) ? t(`admin.audit.actions.${action}`) : action.replaceAll('_', ' '));
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
    if (['remove_message', 'suspend_user'].includes(action) && !window.confirm(t('admin.report.confirm', { action: t(`admin.operations.${action}`), name: data.reportedName }))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/admin/reports/${id}`, { method: 'PATCH', auth: true, body: { action, note } });
      window.location.hash = '#admin?tab=reports';
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return <div className="container">
    <PageHeader eyebrow={t('app.routes.admin')} title={t('admin.title')} subtitle={t('admin.subtitle')} />
    <nav className="discovery-tabs" aria-label={t('admin.sections')}>
      {['overview', 'reports', 'audit'].map(value =>
        <a key={value} href={`#admin?tab=${value}`} aria-current={tab === value ? 'page' : undefined}>{t(`admin.tabs.${value}`)}</a>)}
    </nav>
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {error && <p className="error" role="alert">{error}</p>}
    {tab === 'reports' && !id && <FormField id="admin-report-status" label={t('admin.reports.status')}><select className="input" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
      {['open', 'reviewed', 'actioned', 'dismissed'].map(value => <option key={value} value={value}>{t(`admin.reports.statusOptions.${value}`)}</option>)}
      <option value="">{t('admin.reports.allStatuses')}</option>
    </select></FormField>}
    {!data && !resource.error ? <Spinner label={t('admin.loading')} /> : data && <>
      {tab === 'overview' && <>
        <h2 className="heading-md">{t('admin.overview.totals')}</h2>
        <dl className="metric-grid">{totals.map(key =>
          <div className="card" key={key}><dt>{t(`admin.overview.metrics.${key}`)}</dt><dd>{formatNumber(data.totals[key])}</dd></div>)}</dl>
        <h2 className="heading-md">{t('admin.overview.activity')}</h2>
        <p className="body-muted">{t('admin.overview.activityNote')}</p>
        <ActivityReport daily={data.daily} content={data.content} caption={t('admin.overview.reach')} />
      </>}
      {tab === 'reports' && !id && <>
        {!data.reports.length ? <p className="detail-section">{t('admin.reports.none')}</p> : <div className="table-wrap"><table>
          <caption>{t('admin.reports.queue')}</caption>
          <thead><tr><th scope="col">{t('app.routes.musician')}</th><th scope="col">{t('ui.report.reason')}</th><th scope="col">{t('admin.reports.content')}</th><th scope="col">{t('admin.reports.statusColumn')}</th><th scope="col">{t('admin.reports.review')}</th></tr></thead>
          <tbody>{data.reports.map(report => <tr key={report.id}>
            <th scope="row">{report.reportedName}</th><td>{reportCategory(report.category)}</td><td>{report.hasMessage ? t('admin.reports.selectedMessage') : t('admin.reports.profileConcern')}</td><td>{reportStatus(report.status)}</td>
            <td><a href={`#admin?tab=reports&id=${report.id}`} aria-label={t('admin.reports.reviewNamed', { name: report.reportedName })}>{t('admin.reports.review')}</a></td>
          </tr>)}</tbody>
        </table></div>}
        <Pagination pagination={data.pagination} disabled={resource.loading} onPage={setPage} label={t('admin.reports.pages')} />
        <MarketplaceModeration />
      </>}
      {tab === 'reports' && id && <article className="card report-detail">
        <h2 className="heading-md">{t('admin.report.title', { name: data.reportedName })}</h2>
        <p><strong>{t('reports.statusLine', { status: reportStatus(data.status) })}</strong> / {reportCategory(data.category)}</p>
        <h3>{t('admin.report.details')}</h3><p className="detail-text">{data.details}</p>
        {data.evidence && <>
          <h3>{t('admin.report.evidence')}</h3><blockquote className="reported-excerpt">{data.evidence}</blockquote>
          <p className="field-hint">{data.evidenceVerified ? t('admin.report.signed') : t('admin.report.legacy')}</p>
        </>}
        <p className="field-hint">{t('admin.report.audited')}</p>
        {data.status === 'open' ? <form className="form-stack detail-section" onSubmit={resolve}>
          <FormField id="moderation-action" label={t('admin.report.decision')} required><select className="input" value={action} onChange={event => setAction(event.target.value)} disabled={busy}>
            {operations.filter(key => key !== 'remove_message' || data.messageId).map(key => <option value={key} key={key}>{t(`admin.operations.${key}`)}</option>)}
          </select></FormField>
          <FormField id="moderation-note" label={t('admin.report.note')} hint={t('admin.report.noteHint')} required>
            <textarea className="input" value={note} onChange={event => setNote(event.target.value)} minLength="5" maxLength="2000" disabled={busy} />
          </FormField>
          <button className="btn btn-primary" type="submit" disabled={busy || note.trim().length < 5}>{busy ? t('admin.report.recording') : t('admin.report.record')}</button>
        </form> : <p className="detail-text">{data.moderatorNote}</p>}
      </article>}
      {tab === 'audit' && <>
        <p className="body-muted">{t('admin.audit.intro')}</p>
        <div className="table-wrap"><table>
          <caption>{t('admin.audit.caption')}</caption>
          <thead><tr><th scope="col">{t('ui.activity.date')}</th><th scope="col">{t('admin.audit.action')}</th><th scope="col">{t('admin.audit.actor')}</th><th scope="col">{t('admin.audit.target')}</th></tr></thead>
          <tbody>{data.entries.map(entry => <tr key={entry.id}><th scope="row">{formatDate(entry.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</th><td>{auditAction(entry.action)}</td><td className="identifier">{entry.actorId || t('admin.audit.cli')}</td><td className="identifier">{entry.targetId || t('admin.audit.none')}</td></tr>)}</tbody>
        </table></div>
        <Pagination pagination={data.pagination} disabled={resource.loading} onPage={setPage} label={t('admin.audit.pages')} />
      </>}
    </>}
    {tab === 'overview' && data && <VerificationReviewQueue />}
    <HelpDesk route={route} />
    {tab === 'overview' && data && <OrganizationClaimReview />}
    {tab === 'overview' && data && <OrganizationVerificationAdmin />}
    {tab === 'overview' && data && <MonetizationConsole />}
  </div>;
}
