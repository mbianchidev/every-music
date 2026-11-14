import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import Pagination from './Pagination.jsx';

const STATUSES = ['open', 'in_progress', 'answered', 'closed'];
const KINDS = ['bug', 'contact', 'work'];

function RequestDetail({ id, onClose, onSaved }) {
  const { t, formatDate } = useI18n();
  const resource = useResource(`/admin/support/${encodeURIComponent(id)}`, { reconnect: false });
  const [status, setStatus] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const data = resource.data;
  useEffect(() => {
    if (data) { setStatus(data.status); setReply(data.replyNote || ''); }
  }, [data]);
  const save = async event => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const changedReply = reply.trim() && reply.trim() !== (data.replyNote || '');
      await conduit.transmit(`/admin/support/${id}`, { method: 'PATCH', auth: true, body: { status, ...(changedReply ? { replyNote: reply } : {}) } });
      setMessage(t('help.admin.detail.saved'));
      onSaved();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  if (resource.error) return <ErrorState message={resource.error} onRetry={resource.reload} />;
  if (!data) return <Spinner label={t('common.actions.loading')} />;
  return (
    <article className="card support-detail" aria-labelledby="support-detail-title">
      <button className="text-link" type="button" onClick={onClose}>{t('help.admin.detail.back')}</button>
      <h3 className="heading-md" id="support-detail-title">{data.subject}</h3>
      <p className="support-meta">
        <span>{t(`help.kinds.${data.kind}`)}</span>
        <span>{t(`help.status.${data.status}`)}</span>
        <span>{data.requesterName || t('help.admin.visitor')}</span>
        <time dateTime={data.createdAt}>{formatDate(data.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time>
      </p>
      <p className="field-hint">{data.hasAccount ? t('help.admin.detail.account') : t('help.admin.detail.visitor')}
        {data.forwardedAt && <> {t('help.admin.detail.forwarded', { date: formatDate(data.forwardedAt) })}</>}</p>
      <h4>{t('help.admin.detail.message')}</h4>
      <p className="detail-text">{data.message}</p>
      {data.steps && <><h4>{t('help.admin.detail.steps')}</h4><p className="detail-text">{data.steps}</p></>}
      {data.link && <><h4>{t('help.admin.detail.link')}</h4><p><a href={data.link} target="_blank" rel="noopener noreferrer nofollow">{data.link}</a></p></>}
      {data.diagnostics && <><h4>{t('help.admin.detail.diagnostics')}</h4>
        <dl className="support-diagnostics">{Object.entries(data.diagnostics).map(([key, value]) => <div key={key}><dt>{t(`help.admin.detail.fields.${key}`)}</dt><dd>{value}</dd></div>)}</dl></>}
      <h4>{t('help.admin.detail.contact')}</h4>
      {data.contactEmail ? <p><a href={`mailto:${data.contactEmail}`}>{t('help.admin.detail.write', { email: data.contactEmail })}</a></p>
        : <p className="body-muted">{t('help.admin.detail.noEmail')}</p>}
      <form className="form-stack detail-section" onSubmit={save}>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <FormField id="support-status" label={t('help.admin.status')}>
          <select className="input" value={status} disabled={busy} onChange={event => setStatus(event.target.value)}>
            {STATUSES.map(value => <option key={value} value={value}>{t(`help.status.${value}`)}</option>)}
          </select>
        </FormField>
        <FormField id="support-reply" label={t('help.admin.detail.replyNote')} hint={t('help.admin.detail.replyHint')}>
          <textarea className="input" rows="4" maxLength="5000" value={reply} disabled={busy} onChange={event => setReply(event.target.value)} />
        </FormField>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('help.admin.detail.saving') : t('help.admin.detail.save')}</button>
      </form>
    </article>
  );
}

function SupportInbox() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState('open');
  const [kind, setKind] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const resource = useResource(`/admin/support?status=${status}&kind=${kind}&page=${page}&pageSize=10`, { events: 'admin.changed' });
  const data = resource.data;
  if (selected) {
    return <RequestDetail id={selected} onSaved={resource.reload} onClose={() => {
      setSelected(null);
      requestAnimationFrame(() => document.getElementById('helpdesk-heading')?.focus());
    }} />;
  }
  return <>
    <div className="helpdesk-filters">
      <FormField id="support-filter-status" label={t('help.admin.status')}>
        <select className="input" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>
          {STATUSES.map(value => <option key={value} value={value}>{t(`help.status.${value}`)}</option>)}
          <option value="">{t('help.admin.allStatuses')}</option>
        </select>
      </FormField>
      <FormField id="support-filter-kind" label={t('help.admin.kind')}>
        <select className="input" value={kind} onChange={event => { setKind(event.target.value); setPage(1); }}>
          <option value="">{t('help.admin.allKinds')}</option>
          {KINDS.map(value => <option key={value} value={value}>{t(`help.kinds.${value}`)}</option>)}
        </select>
      </FormField>
    </div>
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {!data && !resource.error ? <Spinner label={t('common.actions.loading')} /> : data && <>
      <p className="body-muted">{t('help.admin.counts', { open: data.counts.open, progress: data.counts.in_progress })}</p>
      {!data.requests.length ? <p>{t('help.admin.empty')}</p> : <div className="table-wrap"><table>
        <caption>{t('help.admin.table')}</caption>
        <thead><tr>
          <th scope="col">{t('help.admin.subject')}</th><th scope="col">{t('help.admin.kind')}</th>
          <th scope="col">{t('help.admin.from')}</th><th scope="col">{t('help.admin.status')}</th><th scope="col">{t('help.admin.received')}</th>
        </tr></thead>
        <tbody>{data.requests.map(item => <tr key={item.id}>
          <th scope="row"><button className="text-link" type="button" aria-label={t('help.admin.open', { subject: item.subject })}
            onClick={() => setSelected(item.id)}>{item.subject}</button></th>
          <td>{t(`help.kinds.${item.kind}`)}</td>
          <td>{item.requesterName || t('help.admin.visitor')} ({item.hasAccount ? t('help.admin.member') : t('help.admin.visitor')})</td>
          <td>{t(`help.status.${item.status}`)}</td>
          <td><time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></td>
        </tr>)}</tbody>
      </table></div>}
      <Pagination pagination={data.pagination} disabled={resource.loading} onPage={setPage} label={t('help.admin.pages')} />
    </>}
  </>;
}

function RatingSummary() {
  const { t, formatDate, formatNumber } = useI18n();
  const resource = useResource('/admin/ratings', { events: 'admin.changed' });
  const data = resource.data;
  if (resource.error) return <ErrorState message={resource.error} onRetry={resource.reload} />;
  if (!data) return <Spinner label={t('common.actions.loading')} />;
  if (!data.total.count) return <p>{t('help.admin.summary.none')}</p>;
  return <>
    <dl className="metric-grid helpdesk-metrics">
      <div className="card"><dt>{t('help.admin.summary.count')}</dt><dd>{formatNumber(data.total.count)}</dd></div>
      <div className="card"><dt>{t('help.admin.summary.average')}</dt><dd>{data.total.average === null ? t('help.admin.summary.noAverage') : formatNumber(data.total.average, { maximumFractionDigits: 2 })}</dd></div>
      <div className="card"><dt>{t('help.admin.summary.unrewarded')}</dt><dd>{formatNumber(data.total.unrewarded)}</dd></div>
    </dl>
    <div className="table-wrap"><table>
      <caption>{t('help.admin.summary.distribution')}</caption>
      <thead><tr><th scope="col">{t('help.admin.summary.stars')}</th><th scope="col">{t('help.admin.summary.total')}</th></tr></thead>
      <tbody>{[5, 4, 3, 2, 1].map(value => <tr key={value}><th scope="row">{t('help.rating.star', { count: value })}</th><td>{formatNumber(data.distribution[value])}</td></tr>)}</tbody>
    </table></div>
    <div className="table-wrap"><table>
      <caption>{t('help.admin.summary.versions')}</caption>
      <thead><tr><th scope="col">{t('help.admin.summary.version')}</th><th scope="col">{t('help.admin.summary.total')}</th><th scope="col">{t('help.admin.summary.average')}</th></tr></thead>
      <tbody>{data.versions.map(item => <tr key={item.version}><th scope="row">{item.version}</th><td>{formatNumber(item.count)}</td><td>{formatNumber(item.average, { maximumFractionDigits: 2 })}</td></tr>)}</tbody>
    </table></div>
    <h3 className="heading-md detail-section">{t('help.admin.summary.recent')}</h3>
    {!data.recent.length ? <p>{t('help.admin.summary.noComments')}</p> : <ul className="rating-comments">
      {data.recent.map(item => <li key={item.id}>
        <p className="detail-text">{item.comment}</p>
        <p className="field-hint">{t('help.rating.star', { count: item.stars })} / {item.appVersion} / <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time></p>
      </li>)}
    </ul>}
  </>;
}

// Rendered on the administration overview; owns its own panel state so the
// administration routes stay unchanged.
export default function HelpDesk({ route }) {
  const { t } = useI18n();
  const [panel, setPanel] = useState('inbox');
  const tab = route.query.get('tab') || 'overview';
  if (tab !== 'overview') return null;
  return (
    <section className="detail-section helpdesk" aria-labelledby="helpdesk-heading">
      <h2 className="heading-md" id="helpdesk-heading" tabIndex="-1">{t('help.admin.title')}</h2>
      <p className="body-muted">{t('help.admin.subtitle')}</p>
      <div className="button-row helpdesk-switch">
        {['inbox', 'ratings'].map(value => <button key={value} className={`btn ${panel === value ? 'btn-tertiary' : 'btn-ghost'}`} type="button"
          aria-pressed={panel === value} onClick={() => setPanel(value)}>{t(`help.admin.${value}`)}</button>)}
      </div>
      {panel === 'inbox' ? <SupportInbox /> : <RatingSummary />}
    </section>
  );
}
