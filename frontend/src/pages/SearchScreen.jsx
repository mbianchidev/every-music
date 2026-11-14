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
import DiscoveryFilters from '../components/DiscoveryFilters.jsx';
import SaveSearchButton from '../components/SaveSearchButton.jsx';
import { discoveryDefaults, hasCenter, searchQuery } from '../lib/discovery.js';
import { useI18n } from '../lib/i18n.js';
import { interleaveSponsored } from '../lib/monetization.js';
import SponsoredCard from '../components/monetization/SponsoredCard.jsx';

const emptyFilters = { searchTerm: '', city: '', instrumentId: '', genreId: '', isRemote: '', createdWithin: '', sort: 'newest', ...discoveryDefaults };

export default function SearchScreen({ route, kind = 'announcements' }) {
  const profiles = kind === 'profiles';
  const [filters, setFilters] = useState(() => Object.fromEntries(Object.entries(emptyFilters).map(([key, fallback]) => [
    key, route?.query.get(key) ?? fallback,
  ])));
  const [page, setPage] = useState(() => Number(route?.query.get('page')) || 1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [nearMe, setNearMe] = useState(null);
  const [resetKey, setResetKey] = useState(0);
  const { t, formatDate } = useI18n();
  const mode = profiles ? 'musicians' : 'calls';
  const debounced = useDebounced(filters);
  const instruments = useResource('/catalog/instruments', { auth: false, reconnect: false });
  const genres = useResource('/catalog/genres', { auth: false, reconnect: false });
  const query = searchQuery(debounced, { profiles, nearMe, page, pageSize: 12 });
  const resource = useResource(`/${kind}/search?${query}`, {
    events: profiles ? 'profiles.changed,blocks.changed' : 'announcements.changed,saved.changed,profiles.changed,blocks.changed', cacheFeed: !profiles && !nearMe,
  });
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  const updateMany = changes => { setFilters(previous => ({ ...previous, ...changes })); setPage(1); };
  const center = hasCenter(filters, nearMe);
  useEffect(() => {
    history.replaceState(null, '', `#${profiles ? 'musicians' : 'feed'}?${queryString({ ...filters, page })}`);
  }, [filters, page, profiles]);
  const rows = resource.data?.[kind] || [];
  const updating = resource.loading || filters !== debounced;
  const activeFilters = ['city', 'instrumentId', 'genreId', 'createdWithin', 'placeId', 'radiusKm', 'country', 'region',
    ...(profiles ? ['openToProjects'] : ['isRemote', 'isCoverBand'])]
    .filter(key => filters[key] !== '').length + Number(filters.sort !== 'newest') + Number(Boolean(nearMe));
  const changePage = value => {
    setPage(value);
    document.getElementById('results-heading')?.focus();
  };
  return (
    <div className="container">
      <PageHeader title={t(`feed.search.${mode}.title`)} subtitle={t(`feed.search.${mode}.subtitle`)}
        actions={<a className="btn btn-primary" href="#create"><Icon name="plus" size={17} />{t('app.nav.postCall')}</a>} />
      <nav className="discovery-tabs" aria-label={t('feed.search.tabs')}>
        <a href="#feed" aria-current={!profiles ? 'page' : undefined}><Icon name="feed" size={16} />{t('feed.search.calls.title')}</a>
        <a href="#musicians" aria-current={profiles ? 'page' : undefined}><Icon name="people" size={17} />{t('app.nav.musicians')}</a>
      </nav>
      <form className="form-stack discovery-form" role="search" aria-label={t(`feed.search.${mode}.label`)} onSubmit={event => event.preventDefault()}>
        <div className="search-field">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="discovery-search">{t(`feed.search.${mode}.label`)}</label>
          <input className="input" id="discovery-search" type="search" aria-describedby="search-hint" value={filters.searchTerm} maxLength="200"
            placeholder={t(`feed.search.${mode}.placeholder`)} onChange={event => update('searchTerm', event.target.value)} />
          <span className="sr-only" id="search-hint">{t('feed.search.hint')}</span>
        </div>
        <details className="selection-panel filter-details" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
          <summary><Icon name="filter" size={16} />{activeFilters ? t('feed.search.filtersActive', { count: activeFilters }) : t('feed.search.filters')}</summary>
          <div className="filters">
        <FormField id="discovery-city" label={t('feed.search.city')}>
          <input className="input" value={filters.city} maxLength="255" onChange={event => update('city', event.target.value)} />
        </FormField>
        <FormField id="discovery-instrument" label={t('ui.catalog.instrument')}>
          <select className="input" value={filters.instrumentId} disabled={!instruments.data} onChange={event => update('instrumentId', event.target.value)}>
            <option value="">{t('feed.search.allInstruments')}</option>
            {instruments.data?.instruments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </FormField>
        <FormField id="discovery-genre" label={t('feed.search.genre')}>
          <select className="input" value={filters.genreId} disabled={!genres.data} onChange={event => update('genreId', event.target.value)}>
            <option value="">{t('feed.search.allGenres')}</option>
            {genres.data?.genres.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </FormField>
        {!profiles && <FormField id="discovery-remote" label={t('feed.search.collaboration')}>
          <select className="input" value={filters.isRemote} onChange={event => update('isRemote', event.target.value)}>
            <option value="">{t('feed.search.anywhere')}</option><option value="true">{t('feed.search.remote')}</option><option value="false">{t('feed.search.local')}</option>
          </select>
        </FormField>}
        <DiscoveryFilters key={resetKey} profiles={profiles} filters={filters} onChange={updateMany} nearMe={nearMe} onNearMe={value => { setNearMe(value); setPage(1); }} />
        <FormField id="discovery-date" label={t(`feed.search.${mode}.date`)}>
          <select className="input" value={filters.createdWithin} onChange={event => update('createdWithin', event.target.value)}>
            <option value="">{t('feed.search.anyTime')}</option><option value="week">{t('feed.search.week')}</option><option value="month">{t('feed.search.month')}</option>
          </select>
        </FormField>
        <FormField id="discovery-sort" label={t('feed.search.sort')}>
          <select className="input" value={filters.sort === 'distance' && !center ? 'newest' : filters.sort} onChange={event => update('sort', event.target.value)}>
            <option value="newest">{t('feed.search.newest')}</option><option value="oldest">{t('feed.search.oldest')}</option>
            <option value={profiles ? 'name' : 'title'}>{t(`feed.search.${mode}.sortName`)}</option>
            <option value="city">{t('feed.search.city')}</option>{!profiles && <option value="popular">{t('feed.search.popular')}</option>}
            {center && <option value="distance">{t('places.sortDistance')}</option>}
            {!profiles && <option value="expiring">{t('discoveryExtras.filters.sortExpiring')}</option>}
          </select>
        </FormField>
        <button className="btn btn-ghost" type="button" onClick={() => { setFilters({ ...emptyFilters }); setNearMe(null); setResetKey(value => value + 1); setPage(1); }}>{t('feed.search.clear')}</button>
          </div>
        </details>
      </form>
      {(instruments.error || genres.error) && <ErrorState message={instruments.error || genres.error} onRetry={() => { instruments.reload(); genres.reload(); }} />}
      {!profiles && <div className="compact-actions save-search-row">
        <SaveSearchButton filters={filters} nearMe={nearMe} catalogs={{ instruments: instruments.data?.instruments, genres: genres.data?.genres }} />
        <a href="#saved-searches">{t('discoveryExtras.saved.title')}</a>
      </div>}
      <h2 className="sr-only" id="results-heading" tabIndex="-1">{t('feed.search.results')}</h2>
      {resource.data?.offline && <p className="status-message" role="status">{t('feed.offline.savedCopy', { date: formatDate(resource.data.cachedAt, { dateStyle: 'medium', timeStyle: 'short' }) })}</p>}
      {resource.data?.offlineCacheWarning && <p className="status-message" role="status">{resource.data.offlineCacheWarning}</p>}
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('feed.search.searching')} /> : resource.data && (
        <section aria-labelledby="results-heading" aria-busy={updating}>
          <div className="results-summary"><p role="status">{updating ? t('feed.search.updating') : rows.length ? t(`feed.search.${mode}.count`, { count: rows.length }) : t('feed.search.none')}</p>
            <span>{t('ui.pagination.page', { page })}</span></div>
          <div className="grid">
            {interleaveSponsored(rows, resource.data.sponsored).map(({ type, item, card, key }) => type === 'sponsored' ? <SponsoredCard key={key} card={card} />
              : profiles ? <MusicianCard key={key} musician={item} />
              : <AnnouncementCard key={key} post={item} expanded={resource.data.offline} actions={<AnnouncementActions post={item} disabled={resource.data.offline} />} />)}
          </div>
          <Pagination pagination={resource.data?.pagination} onPage={changePage} disabled={updating || resource.data?.offline} />
        </section>
      )}
    </div>
  );
}
