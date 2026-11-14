import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';

const names = { profile_view: 'Profile views', announcement_view: 'Announcement views', like: 'Likes', save: 'Saves', message: 'Messages received' };

export default function AnalyticsScreen() {
  const resource = useResource('/analytics', { events: 'preferences.changed,announcements.changed,messages.changed' });
  const preferences = useResource('/preferences', { events: 'preferences.changed' });
  const totals = {};
  const days = {};
  for (const row of resource.data?.daily || []) {
    totals[row.kind] = (totals[row.kind] || 0) + row.count;
    days[row.day] = (days[row.day] || 0) + row.count;
  }
  const maximum = Math.max(1, ...Object.values(days));
  return (
    <div className="container">
      <PageHeader eyebrow="Your space" title="Analytics" subtitle="Your last 30 days of opted-in activity, not unique visitors or total platform traffic." />
      {preferences.data?.analytics === false && <p className="status-message">Analytics is off. <a href="#settings">Opt in from settings</a> to start collecting daily totals.</p>}
      <p className="body-muted">Only activity where both musicians consent is counted. No visitor identities or message content are included. Figures can be lower than your total engagement.</p>
      {(resource.error || preferences.error) && <ErrorState message={resource.error || preferences.error} onRetry={() => { resource.reload(); preferences.reload(); }} />}
      {!resource.data && !resource.error ? <Spinner label="Loading analytics" /> : resource.data && <>
        <dl className="metric-grid">{Object.entries(names).map(([key, label]) => <div className="card" key={key}><dt>{label}</dt><dd>{totals[key] || 0}</dd></div>)}</dl>
        <section aria-labelledby="activity-heading">
          <h2 className="heading-md" id="activity-heading">Daily activity</h2>
          {!Object.keys(days).length && <p>No opted-in activity recorded yet.</p>}
          <div className="chart" aria-hidden="true">{Object.entries(days).map(([day, count]) => <div className="chart-row" key={day}>
            <span>{day}</span><div className="chart-bar" style={{ width: `${count / maximum * 100}%` }} /><span>{count}</span>
          </div>)}</div>
          {!!resource.data.daily.length && <div className="table-wrap"><table>
            <caption>Daily counts by activity</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Activity</th><th scope="col">Count</th></tr></thead>
            <tbody>{resource.data.daily.map(row => <tr key={`${row.day}-${row.kind}`}><th scope="row">{row.day}</th><td>{names[row.kind]}</td><td>{row.count}</td></tr>)}</tbody>
          </table></div>}
        </section>
        <div className="table-wrap"><table>
          <caption>Reach of your latest 100 announcements (last 30 days)</caption>
          <thead><tr><th scope="col">Announcement</th><th scope="col">Views</th><th scope="col">Likes</th><th scope="col">Saves</th></tr></thead>
          <tbody>{resource.data.content.map(item => <tr key={item.id}><th scope="row"><a href={`#announcement?id=${item.id}`}>{item.title}</a></th><td>{item.views}</td><td>{item.likes}</td><td>{item.saves}</td></tr>)}</tbody>
        </table></div>
      </>}
    </div>
  );
}
