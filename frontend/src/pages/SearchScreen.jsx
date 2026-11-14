import { useEffect, useState } from 'react';
import { useDebounced, useResource, queryString } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import FormField from '../components/FormField.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import AnnouncementCard from '../components/AnnouncementCard.jsx';
import AnnouncementActions from '../components/AnnouncementActions.jsx';
import Pagination from '../components/Pagination.jsx';
import MusicianCard from '../components/MusicianCard.jsx';
import Icon from '../components/Icon.jsx';

const emptyFilters = { searchTerm: '', city: '', instrumentId: '', genreId: '', isRemote: '', createdWithin: '', sort: 'newest' };

export default function SearchScreen({ route, kind = 'announcements' }) {
  const profiles = kind === 'profiles';
  const [filters, setFilters] = useState(() => Object.fromEntries(Object.entries(emptyFilters).map(([key, fallback]) => [
    key, route?.query.get(key) ?? fallback,
  ])));
  const [page, setPage] = useState(() => Number(route?.query.get('page')) || 1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debounced = useDebounced(filters);
  const instruments = useResource('/catalog/instruments', { auth: false, reconnect: false });
  const genres = useResource('/catalog/genres', { auth: false, reconnect: false });
  const query = queryString({ ...debounced, isRemote: profiles ? '' : debounced.isRemote, page, pageSize: 12 });
  const resource = useResource(`/${kind}/search?${query}`, {
    events: profiles ? 'profiles.changed' : 'announcements.changed,saved.changed,profiles.changed', cacheFeed: !profiles,
  });
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  useEffect(() => {
    history.replaceState(null, '', `#${profiles ? 'musicians' : 'feed'}?${queryString({ ...filters, page })}`);
  }, [filters, page, profiles]);
  const rows = resource.data?.[kind] || [];
  const updating = resource.loading || filters !== debounced;
  const activeFilters = ['city', 'instrumentId', 'genreId', 'createdWithin', ...(profiles ? [] : ['isRemote'])]
    .filter(key => filters[key] !== '').length + Number(filters.sort !== 'newest');
  const changePage = value => {
    setPage(value);
    document.getElementById('results-heading')?.focus();
  };
  return (
    <div className="container">
      <PageHeader title={profiles ? 'Find musicians' : 'Open calls'} subtitle={profiles ? 'People to make something great with. Find your kind of sound.' : 'A bandmate, a session, a new project. Find your next collaboration.'}
        actions={<a className="btn btn-primary" href="#create"><Icon name="plus" size={17} />Post a call</a>} />
      <nav className="discovery-tabs" aria-label="Discovery">
        <a href="#feed" aria-current={!profiles ? 'page' : undefined}><Icon name="feed" size={16} />Open calls</a>
        <a href="#musicians" aria-current={profiles ? 'page' : undefined}><Icon name="people" size={17} />Musicians</a>
      </nav>
      <form className="form-stack discovery-form" role="search" aria-label={profiles ? 'Search musicians' : 'Search announcements'} onSubmit={event => event.preventDefault()}>
        <div className="search-field">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="discovery-search">{profiles ? 'Search musicians' : 'Search announcements'}</label>
          <input className="input" id="discovery-search" type="search" aria-describedby="search-hint" value={filters.searchTerm} maxLength="200"
            placeholder={profiles ? 'Search by name, sound, or something in common...' : 'Search calls by title, sound, or project...'} onChange={event => update('searchTerm', event.target.value)} />
          <span className="sr-only" id="search-hint">Results update as you type.</span>
        </div>
        <details className="selection-panel filter-details" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
          <summary><Icon name="filter" size={16} />Filters and sorting{activeFilters ? ` (${activeFilters} active)` : ''}</summary>
          <div className="filters">
        <FormField id="discovery-city" label="City">
          <input className="input" value={filters.city} maxLength="255" onChange={event => update('city', event.target.value)} />
        </FormField>
        <FormField id="discovery-instrument" label="Instrument">
          <select className="input" value={filters.instrumentId} disabled={!instruments.data} onChange={event => update('instrumentId', event.target.value)}>
            <option value="">All instruments</option>
            {instruments.data?.instruments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </FormField>
        <FormField id="discovery-genre" label="Genre">
          <select className="input" value={filters.genreId} disabled={!genres.data} onChange={event => update('genreId', event.target.value)}>
            <option value="">All genres</option>
            {genres.data?.genres.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </FormField>
        {!profiles && <FormField id="discovery-remote" label="Collaboration">
          <select className="input" value={filters.isRemote} onChange={event => update('isRemote', event.target.value)}>
            <option value="">Anywhere</option><option value="true">Remote welcome</option><option value="false">Local only</option>
          </select>
        </FormField>}
        <FormField id="discovery-date" label={profiles ? 'Joined' : 'Date posted'}>
          <select className="input" value={filters.createdWithin} onChange={event => update('createdWithin', event.target.value)}>
            <option value="">Any time</option><option value="week">Past 7 days</option><option value="month">Past 30 days</option>
          </select>
        </FormField>
        <FormField id="discovery-sort" label="Sort by">
          <select className="input" value={filters.sort} onChange={event => update('sort', event.target.value)}>
            <option value="newest">Newest first</option><option value="oldest">Oldest first</option>
            <option value={profiles ? 'name' : 'title'}>{profiles ? 'Artist name' : 'Title'}</option>
            <option value="city">City</option>{!profiles && <option value="popular">Most liked</option>}
          </select>
        </FormField>
        <button className="btn btn-ghost" type="button" onClick={() => { setFilters({ ...emptyFilters }); setPage(1); }}>Clear filters</button>
          </div>
        </details>
      </form>
      {(instruments.error || genres.error) && <ErrorState message={instruments.error || genres.error} onRetry={() => { instruments.reload(); genres.reload(); }} />}
      <h2 className="sr-only" id="results-heading" tabIndex="-1">Search results</h2>
      {resource.data?.offline && <p className="status-message" role="status">Offline saved copy from {new Date(resource.data.cachedAt).toLocaleString()}. These results may be out of date.</p>}
      {resource.data?.offlineCacheWarning && <p className="status-message" role="status">{resource.data.offlineCacheWarning}</p>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label="Searching" /> : resource.data && (
        <section aria-labelledby="results-heading" aria-busy={updating}>
          <div className="results-summary"><p role="status">{updating ? 'Updating results...' : rows.length ? `${rows.length} ${profiles ? 'musicians' : 'open calls'} on this page` : 'No matching results. Try different filters.'}</p>
            <span>Page {page}</span></div>
          <div className="grid">
            {rows.map(item => profiles ? <MusicianCard key={item.id} musician={item} />
              : <AnnouncementCard key={item.id} post={item} expanded={resource.data.offline} actions={<AnnouncementActions post={item} disabled={resource.data.offline} />} />)}
          </div>
          <Pagination pagination={resource.data?.pagination} onPage={changePage} disabled={updating || resource.data?.offline} />
        </section>
      )}
    </div>
  );
}
