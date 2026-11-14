import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useDebounced, useResource, queryString } from '../lib/resources.js';
import { ORGANIZATION_KINDS } from '../lib/organizations.js';
import PageHeader from '../components/PageHeader.jsx';
import FormField from '../components/FormField.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Pagination from '../components/Pagination.jsx';
import OrganizationCard from '../components/OrganizationCard.jsx';
import Icon from '../components/Icon.jsx';

const emptyFilters = { q: '', kind: '', genreId: '', location: '', sort: 'newest' };

export default function OrganizationSearchScreen({ route }) {
  const { t } = useI18n();
  const [filters, setFilters] = useState(() => Object.fromEntries(Object.entries(emptyFilters).map(([key, fallback]) => [key, route?.query.get(key) ?? fallback])));
  const [page, setPage] = useState(() => Number(route?.query.get('page')) || 1);
  const debounced = useDebounced(filters);
  const genres = useResource('/catalog/genres', { auth: false, reconnect: false });
  const resource = useResource(`/organizations?${queryString({ ...debounced, page, pageSize: 12 })}`, { events: 'organizations.changed' });
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  useEffect(() => { history.replaceState(null, '', `#organizations?${queryString({ ...filters, page })}`); }, [filters, page]);
  const rows = resource.data?.organizations ?? [];
  const updating = resource.loading || filters !== debounced;
  return (
    <div className="container">
      <PageHeader eyebrow={t('organizations.discover.eyebrow')} title={t('organizations.discover.title')} subtitle={t('organizations.discover.subtitle')}
        actions={<a className="btn btn-primary" href="#create-organization"><Icon name="plus" size={17} />{t('organizations.discover.create')}</a>} />
      <form className="form-stack discovery-form" role="search" aria-label={t('organizations.discover.search')} onSubmit={event => event.preventDefault()}>
        <div className="search-field">
          <Icon name="search" size={18} />
          <label className="sr-only" htmlFor="organization-search">{t('organizations.discover.search')}</label>
          <input className="input" id="organization-search" type="search" value={filters.q} maxLength="200" aria-describedby="organization-search-hint"
            placeholder={t('organizations.discover.placeholder')} onChange={event => update('q', event.target.value)} />
          <span className="sr-only" id="organization-search-hint">{t('organizations.discover.hint')}</span>
        </div>
        <div className="filters">
          <FormField id="organization-kind" label={t('organizations.discover.kind')}>
            <select className="input" value={filters.kind} onChange={event => update('kind', event.target.value)}>
              <option value="">{t('organizations.kindsPlural.all')}</option>
              {ORGANIZATION_KINDS.map(kind => <option key={kind} value={kind}>{t(`organizations.kindsPlural.${kind}`)}</option>)}
            </select>
          </FormField>
          <FormField id="organization-genre" label={t('organizations.fields.genre')}>
            <select className="input" value={filters.genreId} disabled={!genres.data} onChange={event => update('genreId', event.target.value)}>
              <option value="">{t('organizations.discover.allGenres')}</option>
              {genres.data?.genres.map(genre => <option key={genre.id} value={genre.id}>{genre.name}</option>)}
            </select>
          </FormField>
          <FormField id="organization-location" label={t('organizations.discover.location')}>
            <input className="input" value={filters.location} maxLength="255" onChange={event => update('location', event.target.value)} />
          </FormField>
          <FormField id="organization-sort" label={t('organizations.discover.sort')}>
            <select className="input" value={filters.sort} onChange={event => update('sort', event.target.value)}>
              <option value="newest">{t('organizations.discover.sortNewest')}</option>
              <option value="name">{t('organizations.discover.sortName')}</option>
              <option value="followers">{t('organizations.discover.sortFollowers')}</option>
            </select>
          </FormField>
          <button className="btn btn-ghost" type="button" onClick={() => { setFilters({ ...emptyFilters }); setPage(1); }}>{t('organizations.discover.clear')}</button>
        </div>
      </form>
      {genres.error && <ErrorState message={genres.error} onRetry={genres.reload} />}
      <h2 className="sr-only" id="organization-results-heading" tabIndex="-1">{t('organizations.discover.results')}</h2>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('organizations.discover.loading')} /> : resource.data && (
        <section aria-labelledby="organization-results-heading" aria-busy={updating}>
          <div className="results-summary"><p role="status">{updating ? t('organizations.discover.updating') : rows.length ? t('organizations.discover.count', { count: rows.length }) : t('organizations.discover.none')}</p></div>
          <div className="grid">{rows.map(organization => <OrganizationCard key={organization.id} organization={organization} />)}</div>
          <Pagination pagination={resource.data.pagination} disabled={updating} label={t('organizations.discover.pages')}
            onPage={value => { setPage(value); document.getElementById('organization-results-heading')?.focus(); }} />
        </section>
      )}
    </div>
  );
}
