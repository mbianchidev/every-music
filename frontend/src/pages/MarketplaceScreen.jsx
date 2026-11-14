import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useDebounced, useResource, queryString } from '../lib/resources.js';
import { COMMON_CURRENCIES, MARKETPLACE_TABS, TAB_TYPES, toMinorUnits } from '../lib/marketplace.js';
import PageHeader from '../components/PageHeader.jsx';
import FormField from '../components/FormField.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Pagination from '../components/Pagination.jsx';
import Icon from '../components/Icon.jsx';
import MarketplaceNav from '../components/marketplace/MarketplaceNav.jsx';
import ListingCard from '../components/marketplace/ListingCard.jsx';
import ListingSaveButton from '../components/marketplace/ListingSaveButton.jsx';

const emptyFilters = {
  q: '', type: '', category: '', subcategory: '', condition: '', priceMin: '', priceMax: '', currency: 'EUR',
  location: '', remote: '', shipping: '', instrumentId: '', genreId: '', sort: 'newest',
};
const FILTER_KEYS = ['type', 'category', 'subcategory', 'condition', 'priceMin', 'priceMax', 'location', 'remote', 'shipping', 'instrumentId', 'genreId'];
const GEAR_ONLY = ['condition', 'shipping'];

export default function MarketplaceScreen({ route }) {
  const { t } = useI18n();
  const requested = route?.query.get('tab');
  const tab = MARKETPLACE_TABS.includes(requested) ? requested : 'gear';
  const [filters, setFilters] = useState(() => Object.fromEntries(Object.entries(emptyFilters).map(([key, fallback]) => [
    key, route?.query.get(key) ?? fallback,
  ])));
  const [page, setPage] = useState(() => Number(route?.query.get('page')) || 1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const debounced = useDebounced(filters);
  const catalog = useResource('/marketplace/catalog', { auth: false, reconnect: false });
  const instruments = useResource('/catalog/instruments', { auth: false, reconnect: false });
  const genres = useResource('/catalog/genres', { auth: false, reconnect: false });
  const categories = catalog.data?.tabs.find(item => item.id === tab)?.categories || [];
  const subcategories = categories.find(item => item.id === filters.category)?.subcategories || [];
  const gear = tab === 'gear';
  const priceMin = toMinorUnits(debounced.priceMin, debounced.currency);
  const priceMax = toMinorUnits(debounced.priceMax, debounced.currency);
  const invalidPrice = Number.isNaN(priceMin) || Number.isNaN(priceMax);
  const priced = priceMin !== null || priceMax !== null;
  const query = queryString({
    ...debounced, tab, page, pageSize: 12, type: TAB_TYPES[tab].includes(debounced.type) ? debounced.type : '',
    priceMin: invalidPrice ? '' : priceMin ?? '', priceMax: invalidPrice ? '' : priceMax ?? '',
    currency: priced && !invalidPrice ? debounced.currency : '',
    condition: gear ? debounced.condition : '', shipping: gear ? debounced.shipping : '', remote: gear ? '' : debounced.remote,
  });
  const resource = useResource(`/marketplace/listings?${query}`, { events: 'marketplace.changed,marketplace.saved.changed,profiles.changed' });
  const update = (key, value) => {
    setFilters(previous => ({ ...previous, [key]: value, ...(key === 'category' ? { subcategory: '' } : {}) }));
    setPage(1);
  };
  useEffect(() => {
    history.replaceState(null, '', `#marketplace?${queryString({ tab, ...filters, page })}`);
  }, [tab, filters, page]);
  const rows = resource.data?.listings || [];
  const updating = resource.loading || filters !== debounced;
  const activeFilters = FILTER_KEYS.filter(key => filters[key] !== '' && (gear ? key !== 'remote' : !GEAR_ONLY.includes(key))).length
    + Number(filters.sort !== 'newest');
  const changePage = value => {
    setPage(value);
    document.getElementById('results-heading')?.focus();
  };
  return (
    <div className="container">
      <PageHeader eyebrow={t('marketplace.header.eyebrow')} title={t('marketplace.header.title')} subtitle={t('marketplace.header.subtitle')} />
      <MarketplaceNav tab={tab} />
      <p className="body-muted marketplace-intro">{t(`marketplace.tabIntro.${tab}`)} {t('marketplace.header.offPlatform')}</p>
      <form className="form-stack discovery-form" role="search" aria-label={t('marketplace.search.label')} onSubmit={event => event.preventDefault()}>
        <div className="search-field">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="marketplace-search">{t('marketplace.search.label')}</label>
          <input className="input" id="marketplace-search" type="search" aria-describedby="marketplace-search-hint" value={filters.q} maxLength="200"
            placeholder={t('marketplace.search.placeholder')} onChange={event => update('q', event.target.value)} />
          <span className="sr-only" id="marketplace-search-hint">{t('marketplace.search.hint')}</span>
        </div>
        <details className="selection-panel filter-details" open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
          <summary><Icon name="filter" size={16} />{activeFilters ? t('marketplace.search.filtersActive', { count: activeFilters }) : t('marketplace.search.filters')}</summary>
          <div className="filters">
            {TAB_TYPES[tab].length > 1 && <FormField id="marketplace-type" label={t('marketplace.search.type')}>
              <select className="input" value={filters.type} onChange={event => update('type', event.target.value)}>
                <option value="">{t('marketplace.search.allTypes')}</option>
                {TAB_TYPES[tab].map(type => <option key={type} value={type}>{t(`marketplace.types.${type}`)}</option>)}
              </select>
            </FormField>}
            <FormField id="marketplace-category" label={t('marketplace.search.category')}>
              <select className="input" value={filters.category} disabled={!catalog.data} onChange={event => update('category', event.target.value)}>
                <option value="">{t('marketplace.search.allCategories')}</option>
                {categories.map(item => <option key={item.id} value={item.id}>{t(`marketplace.categories.${item.id}`)}</option>)}
              </select>
            </FormField>
            {!!subcategories.length && <FormField id="marketplace-subcategory" label={t('marketplace.search.subcategory')}>
              <select className="input" value={filters.subcategory} onChange={event => update('subcategory', event.target.value)}>
                <option value="">{t('marketplace.search.allSubcategories')}</option>
                {subcategories.map(item => <option key={item} value={item}>{t(`marketplace.subcategories.${item}`)}</option>)}
              </select>
            </FormField>}
            {gear && <FormField id="marketplace-condition" label={t('marketplace.search.condition')}>
              <select className="input" value={filters.condition} onChange={event => update('condition', event.target.value)}>
                <option value="">{t('marketplace.search.anyCondition')}</option>
                {['new', 'used', 'refurbished'].map(value => <option key={value} value={value}>{t(`marketplace.conditions.${value}`)}</option>)}
              </select>
            </FormField>}
            <FormField id="marketplace-price-min" label={t('marketplace.search.priceMin')} error={Number.isNaN(toMinorUnits(filters.priceMin, filters.currency)) ? t('marketplace.search.invalidPrice') : undefined}>
              <input className="input" inputMode="decimal" value={filters.priceMin} maxLength="16" onChange={event => update('priceMin', event.target.value)} />
            </FormField>
            <FormField id="marketplace-price-max" label={t('marketplace.search.priceMax')} error={Number.isNaN(toMinorUnits(filters.priceMax, filters.currency)) ? t('marketplace.search.invalidPrice') : undefined}>
              <input className="input" inputMode="decimal" value={filters.priceMax} maxLength="16" onChange={event => update('priceMax', event.target.value)} />
            </FormField>
            <FormField id="marketplace-currency" label={t('marketplace.search.currency')}>
              <select className="input" value={filters.currency} onChange={event => update('currency', event.target.value)}>
                {[...new Set([filters.currency, ...COMMON_CURRENCIES])].map(code => <option key={code} value={code}>{code}</option>)}
              </select>
            </FormField>
            <FormField id="marketplace-location" label={t('marketplace.search.location')}>
              <input className="input" value={filters.location} maxLength="160" onChange={event => update('location', event.target.value)} />
            </FormField>
            <FormField id="marketplace-instrument" label={t('marketplace.search.instrument')}>
              <select className="input" value={filters.instrumentId} disabled={!instruments.data} onChange={event => update('instrumentId', event.target.value)}>
                <option value="">{t('marketplace.search.allInstruments')}</option>
                {instruments.data?.instruments.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </FormField>
            <FormField id="marketplace-genre" label={t('marketplace.search.genre')}>
              <select className="input" value={filters.genreId} disabled={!genres.data} onChange={event => update('genreId', event.target.value)}>
                <option value="">{t('marketplace.search.allGenres')}</option>
                {genres.data?.genres.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </FormField>
            <FormField id="marketplace-sort" label={t('marketplace.search.sort')}>
              <select className="input" value={filters.sort} onChange={event => update('sort', event.target.value)}>
                {['newest', 'price_asc', 'price_desc', 'title'].map(value => <option key={value} value={value}>{t(`marketplace.sort.${value}`)}</option>)}
              </select>
            </FormField>
            {!gear && <label className="checkbox-label"><input type="checkbox" checked={filters.remote === 'true'} onChange={event => update('remote', event.target.checked ? 'true' : '')} />
              {t('marketplace.search.remote')}</label>}
            {gear && <label className="checkbox-label"><input type="checkbox" checked={filters.shipping === 'true'} onChange={event => update('shipping', event.target.checked ? 'true' : '')} />
              {t('marketplace.search.shipping')}</label>}
            <button className="btn btn-ghost" type="button" onClick={() => { setFilters({ ...emptyFilters }); setPage(1); }}>{t('marketplace.search.clear')}</button>
          </div>
        </details>
      </form>
      {(catalog.error || instruments.error || genres.error) && <ErrorState message={catalog.error || instruments.error || genres.error}
        onRetry={() => { catalog.reload(); instruments.reload(); genres.reload(); }} />}
      <h2 className="sr-only" id="results-heading" tabIndex="-1">{t('marketplace.results.heading')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('marketplace.results.loading')} /> : resource.data && (
        <section aria-labelledby="results-heading" aria-busy={updating}>
          <div className="results-summary">
            <p role="status">{updating ? t('marketplace.results.updating') : rows.length ? t('marketplace.results.count', { count: rows.length }) : t('marketplace.results.empty')}</p>
            <span>{t('marketplace.results.page', { page })}</span>
          </div>
          <div className="grid">
            {rows.map(listing => <ListingCard key={listing.id} listing={listing}
              actions={!listing.isOwner && <ListingSaveButton key={`${listing.id}-${listing.isSaved}`} listing={listing} />} />)}
          </div>
          <Pagination pagination={resource.data.pagination} onPage={changePage} disabled={updating} />
        </section>
      )}
    </div>
  );
}

