import { useState } from 'react';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import { DISTANCES, hasCenter } from '../lib/discovery.js';
import { currentPosition, locationEnabled } from '../lib/geolocation.js';
import FormField from './FormField.jsx';
import PlacePicker from './PlacePicker.jsx';

// Location, cover-band and open-to filters shared by both discovery tabs.
export default function DiscoveryFilters({ profiles, filters, onChange, nearMe, onNearMe }) {
  const { t, formatNumber } = useI18n();
  const countries = useResource('/catalog/countries', { auth: false, reconnect: false });
  const regions = useResource(filters.country ? `/catalog/regions?country=${encodeURIComponent(filters.country)}` : null, { auth: false, reconnect: false });
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const center = hasCenter(filters, nearMe);
  const dropCenter = filters.sort === 'distance' ? { sort: 'newest' } : {};
  const locate = async () => {
    setLocating(true); setLocationError('');
    try {
      const position = await currentPosition();
      onNearMe(position);
      onChange({ placeId: '', placeLabel: '' });
    } catch (failure) {
      setLocationError(t(`places.nearMe.${failure.code === 'denied' ? 'denied' : failure.code === 'unsupported' ? 'unsupported' : 'unavailable'}`));
    } finally { setLocating(false); }
  };
  return (
    <>
      <div className="filter-location">
        {nearMe ? <>
          <p className="status-message" role="status">{t('places.nearMe.active')}</p>
          <button className="text-link" type="button" onClick={() => { onNearMe(null); onChange(dropCenter); }}>{t('places.nearMe.stop')}</button>
        </> : <>
          <PlacePicker id="discovery-place" label={t('places.near')} hint={t('places.nearHint')}
            value={filters.placeId ? { id: Number(filters.placeId), label: filters.placeLabel || filters.placeId } : null}
            onChange={place => onChange(place ? { placeId: String(place.id), placeLabel: place.label } : { placeId: '', placeLabel: '', ...dropCenter })} />
          {locationEnabled()
            ? <button className="btn btn-ghost" type="button" disabled={locating} onClick={locate}>{locating ? t('places.nearMe.locating') : t('places.nearMe.use')}</button>
            : <p className="field-hint">{t('places.nearMe.enableHint')} <a href="#settings">{t('places.nearMe.settingsLink')}</a></p>}
        </>}
        {locationError && <p className="field-error" role="alert">{locationError}</p>}
      </div>
      <FormField id="discovery-distance" label={t('places.distance')} hint={center ? undefined : t('places.distanceHint')}>
        <select className="input" value={center ? filters.radiusKm : ''} disabled={!center} onChange={event => onChange({ radiusKm: event.target.value })}>
          <option value="">{t('places.anyDistance')}</option>
          {DISTANCES.map(km => <option key={km} value={km}>{t('places.withinKm', { distance: formatNumber(km) })}</option>)}
        </select>
      </FormField>
      <FormField id="discovery-country" label={t('places.country')}>
        <select className="input" value={filters.country} disabled={!countries.data} onChange={event => onChange({ country: event.target.value, region: '' })}>
          <option value="">{t('places.anyCountry')}</option>
          {countries.data?.countries.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </FormField>
      <FormField id="discovery-region" label={t('places.region')}>
        <select className="input" value={filters.region} disabled={!filters.country || !regions.data} onChange={event => onChange({ region: event.target.value })}>
          <option value="">{t('places.anyRegion')}</option>
          {regions.data?.regions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
      </FormField>
      {(countries.error || regions.error) && <p className="field-error" role="alert">{countries.error || regions.error}{' '}
        <button className="text-link" type="button" onClick={() => { countries.reload(); regions.reload(); }}>{t('common.actions.retry')}</button></p>}
      {profiles ? <FormField id="discovery-open" label={t('discoveryExtras.filters.openToProjects')}>
        <select className="input" value={filters.openToProjects} onChange={event => onChange({ openToProjects: event.target.value })}>
          <option value="">{t('discoveryExtras.filters.anyone')}</option>
          <option value="true">{t('discoveryExtras.filters.onlyOpen')}</option>
        </select>
      </FormField> : <FormField id="discovery-cover" label={t('discoveryExtras.filters.coverBand')}>
        <select className="input" value={filters.isCoverBand} onChange={event => onChange({ isCoverBand: event.target.value })}>
          <option value="">{t('discoveryExtras.filters.anyProject')}</option>
          <option value="true">{t('discoveryExtras.filters.coverOnly')}</option>
          <option value="false">{t('discoveryExtras.filters.originalsOnly')}</option>
        </select>
      </FormField>}
    </>
  );
}
