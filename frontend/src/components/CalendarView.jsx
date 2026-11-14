import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import CalendarEntryList from './CalendarEntryList.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import Pagination from './Pagination.jsx';

// Upcoming/past entries from `path` (personal or band calendar) with paging.
export default function CalendarView({ path, showCalendar = true }) {
  const { t } = useI18n();
  const [when, setWhen] = useState('upcoming');
  const [page, setPage] = useState(1);
  const resource = useResource(`${path}?when=${when}&page=${page}&pageSize=10`, { events: 'calendar.changed,organizations.changed' });
  const choose = value => { setWhen(value); setPage(1); };
  return (
    <div className="calendar-view">
      <div className="view-toggle" role="group" aria-label={t('calendar.screen.views')}>
        {['upcoming', 'past'].map(value => <button key={value} className={`btn ${when === value ? 'btn-secondary' : 'btn-ghost'}`} type="button"
          aria-pressed={when === value} onClick={() => choose(value)}>{t(`calendar.screen.${value}`)}</button>)}
      </div>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('calendar.screen.loading')} /> : resource.data && <>
        {!resource.data.entries.length && <p className="body-muted">{when === 'past' ? t('calendar.screen.emptyPast') : t('calendar.screen.empty')}</p>}
        <CalendarEntryList entries={resource.data.entries} showCalendar={showCalendar} />
        <Pagination pagination={resource.data.pagination} onPage={setPage} disabled={resource.loading} label={t('calendar.screen.pages')} />
      </>}
    </div>
  );
}
