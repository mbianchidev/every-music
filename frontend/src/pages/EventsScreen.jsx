import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useDebounced, useResource, queryString } from '../lib/resources.js';
import { EVENT_SORTS, EVENT_TYPES } from '../lib/events.js';
import PageHeader from '../components/PageHeader.jsx';
import FormField from '../components/FormField.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Pagination from '../components/Pagination.jsx';
import Icon from '../components/Icon.jsx';
import PlacePicker from '../components/PlacePicker.jsx';
import EventsNav from '../components/events/EventsNav.jsx';
import EventCard from '../components/events/EventCard.jsx';
import ChosenEntity from '../components/events/ChosenEntity.jsx';

const TEXT_FILTERS = { q: '', when: 'upcoming', from: '', to: '', type: '', genreId: '', sort: 'date', radiusKm: '50' };
const ENTITIES = ['band', 'organizer', 'venue', 'place'];
const RADII = ['10', '25', '50', '100', '250'];

function readFilters(route) {
  const filters = Object.fromEntries(Object.entries(TEXT_FILTERS).map(([key, fallback]) => [key, route?.query.get(key) ?? fallback]));
  for (const entity of ENTITIES) {
    const id = route?.query.get(`${entity}Id`);
    filters[entity] = id ? { id: entity === 'place' ? Number(id) : id, label: route.query.get(`${entity}Label`) || id } : null;
  }
  return filters;
}

const entityQuery = filters => Object.fromEntries(ENTITIES.flatMap(entity => (filters[entity]
  ? [[`${entity}Id`, filters[entity].id], [`${entity}Label`, filters[entity].label]] : [])));

export default function EventsScreen({ route }) {
  const { t } = useI18n();
  const [filters, setFilters] = useState(() => readFilters(route));
  const [page, setPage] = useState(() => Number(route?.query.get('page')) || 1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debounced = useDebounced(filters);
  const genres = useResource('/catalog/genres', { auth: false, reconnect: false });
  const query = queryString({
    q: debounced.q, when: debounced.when, from: debounced.from, to: debounced.to, type: debounced.type, genreId: debounced.genreId,
    sort: debounced.sort, bandId: debounced.band?.id, organizerId: debounced.organizer?.id, venueId: debounced.venue?.id,
    placeId: debounced.place?.id, radiusKm: debounced.place ? debounced.radiusKm : '', page, pageSize: 12,
  });
  const resource = useResource(`/gigs?${query}`, { events: 'gigs.changed,organizations.changed' });
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  useEffect(() => {
    const { band, organizer, venue, place, ...text } = filters;
    history.replaceState(null, '', `#events?${queryString({ ...text, ...entityQuery({ band, organizer, venue, place }), page })}`);
  }, [filters, page]);
  const rows = resource.data?.events || [];
  const updating = resource.loading || filters !== debounced;
  const active = ['from', 'to', 'type', 'genreId'].filter(key => filters[key]).length + ENTITIES.filter(key => filters[key]).length
    + Number(filters.when !== 'upcoming') + Number(filters.sort !== 'date');
  const changePage = value => { setPage(value); document.getElementById('event-results-heading')?.focus(); };
  return (
    <div className="container">
      <PageHeader eyebrow={t('events.header.eyebrow')} title={t('events.header.title')} subtitle={t('events.header.subtitle')} />
      <EventsNav />
      <form className="form-stack discovery-form" role="search" aria-label={t('events.search.label')} onSubmit={event => event.preventDefault()}>
        <div className="search-field">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="event-search">{t('events.search.label')}</label>
          <input className="input" id="event-search" type="search" aria-describedby="event-search-hint" value={filters.q} maxLength="200"
            placeholder={t('events.search.placeholder')} onChange={event => update('q', event.target.value)} />
          <span className="sr-only" id="event-search-hint">{t('events.search.hint')}</span>
        </div>
        <div className="filters event-quick-filters">
          <FormField id="event-when" label={t('events.search.when')}>
            <select className="input" value={filters.when} onChange={event => update('when', event.target.value)}>
              {['upcoming', 'past', 'all'].map(value => <option key={value} value={value}>{t(`events.search.whenOptions.${value}`)}</option>)}
            </select>
          </FormField>
          <FormField id="event-sort" label={t('events.search.sort')}>
            <select className="input" value={filters.sort} onChange={event => update('sort', event.target.value)}>
              {EVENT_SORTS.map(value => <option key={value} value={value}>{t(`events.search.sorts.${value}`)}</option>)}
            </select>
          </FormField>
        </div>
        <details className="selection-panel filter-details" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
          <summary><Icon name="filter" size={16} />{active ? t('events.search.filtersActive', { count: active }) : t('events.search.filters')}</summary>
          <div className="filters event-filters">
            <FormField id="event-from" label={t('events.search.from')}>
              <input className="input" type="date" value={filters.from} max={filters.to || undefined} onChange={event => update('from', event.target.value)} />
            </FormField>
            <FormField id="event-to" label={t('events.search.to')}>
              <input className="input" type="date" value={filters.to} min={filters.from || undefined} onChange={event => update('to', event.target.value)} />
            </FormField>
            <FormField id="event-type" label={t('events.search.type')}>
              <select className="input" value={filters.type} onChange={event => update('type', event.target.value)}>
                <option value="">{t('events.search.anyType')}</option>
                {EVENT_TYPES.map(value => <option key={value} value={value}>{t(`events.types.${value}`)}</option>)}
              </select>
            </FormField>
            <FormField id="event-genre" label={t('events.search.genre')}>
              <select className="input" value={filters.genreId} disabled={!genres.data} onChange={event => update('genreId', event.target.value)}>
                <option value="">{t('events.search.anyGenre')}</option>
                {genres.data?.genres.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </FormField>
            <ChosenEntity id="event-filter-band" type="band" label={t('events.search.band')} value={filters.band} onChange={value => update('band', value)} />
            <ChosenEntity id="event-filter-organizer" type="organization" label={t('events.search.organizer')} value={filters.organizer}
              onChange={value => update('organizer', value)} />
            <ChosenEntity id="event-filter-venue" type="venue" label={t('events.search.venue')} value={filters.venue} onChange={value => update('venue', value)} />
            <PlacePicker id="event-filter-city" label={t('events.search.city')} value={filters.place} onChange={value => update('place', value)} />
            {filters.place && <FormField id="event-radius" label={t('events.search.radius')}>
              <select className="input" value={filters.radiusKm} onChange={event => update('radiusKm', event.target.value)}>
                {RADII.map(value => <option key={value} value={value}>{t('events.search.radiusOption', { km: value })}</option>)}
              </select>
            </FormField>}
            <button className="btn btn-ghost" type="button" onClick={() => {
              setFilters({ ...TEXT_FILTERS, band: null, organizer: null, venue: null, place: null }); setPage(1);
            }}>{t('events.search.clear')}</button>
          </div>
        </details>
      </form>
      {genres.error && <ErrorState message={genres.error} onRetry={genres.reload} />}
      <h2 className="sr-only" id="event-results-heading" tabIndex="-1">{t('events.results.heading')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('events.results.loading')} /> : resource.data && (
        <section aria-labelledby="event-results-heading" aria-busy={updating}>
          <div className="results-summary">
            <p role="status">{updating ? t('events.results.updating') : rows.length ? t('events.results.count', { count: rows.length }) : t('events.results.empty')}</p>
            <span>{t('events.results.page', { page })}</span>
          </div>
          <div className="grid">{rows.map(event => <EventCard key={event.id} event={event} />)}</div>
          <Pagination pagination={resource.data.pagination} onPage={changePage} disabled={updating} label={t('events.results.pages')} />
        </section>
      )}
    </div>
  );
}
