import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import FormField from '../components/FormField.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Pagination from '../components/Pagination.jsx';
import EventsNav from '../components/events/EventsNav.jsx';
import EventCard from '../components/events/EventCard.jsx';

const TABS = ['attending', 'organizing'];
const WHEN = ['upcoming', 'past', 'all'];

export default function MyEventsScreen({ route }) {
  const { t } = useI18n();
  const tab = TABS.includes(route.query.get('tab')) ? route.query.get('tab') : 'attending';
  const [when, setWhen] = useState(WHEN.includes(route.query.get('when')) ? route.query.get('when') : 'upcoming');
  const [page, setPage] = useState(1);
  const resource = useResource(`/gigs/mine?role=${tab}&when=${when}&page=${page}&pageSize=12`, { events: 'gigs.changed,gigs.mine.changed' });
  useEffect(() => { history.replaceState(null, '', `#my-events?tab=${encodeURIComponent(tab)}&when=${encodeURIComponent(when)}`); }, [tab, when]);
  const rows = resource.data?.events || [];
  return (
    <div className="container">
      <PageHeader eyebrow={t('events.header.eyebrow')} title={t('events.mine.title')} subtitle={t('events.mine.subtitle')} />
      <EventsNav />
      <nav className="discovery-tabs" aria-label={t('events.mine.tabsLabel')}>
        {TABS.map(value => <a key={value} href={`#my-events?tab=${encodeURIComponent(value)}&when=${encodeURIComponent(when)}`} aria-current={tab === value ? 'page' : undefined}>
          {t(`events.mine.tabs.${value}`)}</a>)}
      </nav>
      <FormField id="my-events-when" label={t('events.search.when')}>
        <select className="input" value={when} onChange={changed => {
          const value = WHEN.find(option => option === changed.target.value);
          if (value) { setWhen(value); setPage(1); }
        }}>
          {WHEN.map(value => <option key={value} value={value}>{t(`events.search.whenOptions.${value}`)}</option>)}
        </select>
      </FormField>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('events.mine.loading')} /> : resource.data && (
        <section aria-labelledby="my-events-heading" aria-busy={resource.loading}>
          <h2 className="sr-only" id="my-events-heading">{t(`events.mine.tabs.${tab}`)}</h2>
          {!rows.length ? <div className="card empty-state">
            <p>{t(tab === 'attending' ? 'events.mine.emptyAttending' : 'events.mine.emptyOrganizing')}</p>
            <a className="btn btn-primary" href={tab === 'attending' ? '#events' : '#new-event'}>
              {t(tab === 'attending' ? 'events.mine.browse' : 'events.mine.create')}</a>
          </div> : <div className="grid">{rows.map(event => <EventCard key={event.id} event={event} />)}</div>}
          <Pagination pagination={resource.data.pagination} onPage={setPage} disabled={resource.loading} label={t('events.results.pages')} />
        </section>
      )}
    </div>
  );
}
