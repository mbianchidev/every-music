import { useId } from 'react';

const names = { profile_view: 'Profile views', announcement_view: 'Announcement views', like: 'Likes', save: 'Saves', message: 'Messages received' };

export default function ActivityReport({ daily, content, caption = 'Reach of your latest 100 announcements (last 30 days)' }) {
  const heading = useId();
  const totals = {};
  const days = {};
  for (const row of daily) {
    totals[row.kind] = (totals[row.kind] || 0) + row.count;
    days[row.day] = (days[row.day] || 0) + row.count;
  }
  const maximum = Math.max(1, ...Object.values(days));
  return <>
    <dl className="metric-grid">{Object.entries(names).map(([key, label]) => <div className="card" key={key}><dt>{label}</dt><dd>{totals[key] || 0}</dd></div>)}</dl>
    <section aria-labelledby={heading}>
      <h2 className="heading-md" id={heading}>Daily activity</h2>
      {!daily.length && <p>No opted-in activity recorded yet.</p>}
      <div className="chart" aria-hidden="true">{Object.entries(days).map(([day, count]) => <div className="chart-row" key={day}>
        <span>{day}</span><div className="chart-bar" style={{ width: `${count / maximum * 100}%` }} /><span>{count}</span>
      </div>)}</div>
      {!!daily.length && <div className="table-wrap"><table>
        <caption>Daily counts by activity</caption>
        <thead><tr><th scope="col">Date</th><th scope="col">Activity</th><th scope="col">Count</th></tr></thead>
        <tbody>{daily.map(row => <tr key={`${row.day}-${row.kind}`}><th scope="row">{row.day}</th><td>{names[row.kind]}</td><td>{row.count}</td></tr>)}</tbody>
      </table></div>}
    </section>
    <div className="table-wrap"><table>
      <caption>{caption}</caption>
      <thead><tr><th scope="col">Announcement</th><th scope="col">Views</th><th scope="col">Likes</th><th scope="col">Saves</th></tr></thead>
      <tbody>{content.map(item => <tr key={item.id}><th scope="row"><a href={`#announcement?id=${item.id}`}>{item.title}</a></th><td>{item.views}</td><td>{item.likes}</td><td>{item.saves}</td></tr>)}</tbody>
    </table></div>
  </>;
}
