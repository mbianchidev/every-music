import { useId } from 'react';
import { useI18n } from '../lib/i18n.js';

const kinds = ['profile_view', 'announcement_view', 'like', 'save', 'message'];

export default function ActivityReport({ daily, content, caption }) {
  const { t, formatDate, formatNumber } = useI18n();
  const heading = useId();
  const name = kind => t(`ui.activity.kinds.${kind}`);
  const day = value => formatDate(`${value}T00:00:00`);
  const totals = {};
  const days = {};
  for (const row of daily) {
    totals[row.kind] = (totals[row.kind] || 0) + row.count;
    days[row.day] = (days[row.day] || 0) + row.count;
  }
  const maximum = Math.max(1, ...Object.values(days));
  return <>
    <dl className="metric-grid">{kinds.map(key => <div className="card" key={key}><dt>{name(key)}</dt><dd>{formatNumber(totals[key] || 0)}</dd></div>)}</dl>
    <section aria-labelledby={heading}>
      <h2 className="heading-md" id={heading}>{t('ui.activity.daily')}</h2>
      {!daily.length && <p>{t('ui.activity.none')}</p>}
      <div className="chart" aria-hidden="true">{Object.entries(days).map(([date, count]) => <div className="chart-row" key={date}>
        <span>{day(date)}</span><div className="chart-bar" style={{ width: `${count / maximum * 100}%` }} /><span>{formatNumber(count)}</span>
      </div>)}</div>
      {!!daily.length && <div className="table-wrap"><table>
        <caption>{t('ui.activity.dailyCaption')}</caption>
        <thead><tr><th scope="col">{t('ui.activity.date')}</th><th scope="col">{t('ui.activity.activity')}</th><th scope="col">{t('ui.activity.count')}</th></tr></thead>
        <tbody>{daily.map(row => <tr key={`${row.day}-${row.kind}`}><th scope="row">{day(row.day)}</th><td>{name(row.kind)}</td><td>{formatNumber(row.count)}</td></tr>)}</tbody>
      </table></div>}
    </section>
    <div className="table-wrap"><table>
      <caption>{caption || t('ui.activity.contentCaption')}</caption>
      <thead><tr><th scope="col">{t('ui.activity.announcement')}</th><th scope="col">{t('ui.activity.views')}</th><th scope="col">{t('ui.activity.likes')}</th><th scope="col">{t('ui.activity.saves')}</th></tr></thead>
      <tbody>{content.map(item => <tr key={item.id}><th scope="row"><a href={`#announcement?id=${item.id}`}>{item.title}</a></th><td>{formatNumber(item.views)}</td><td>{formatNumber(item.likes)}</td><td>{formatNumber(item.saves)}</td></tr>)}</tbody>
    </table></div>
  </>;
}
