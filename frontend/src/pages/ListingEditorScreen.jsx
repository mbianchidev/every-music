import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { COMMON_CURRENCIES, GEAR_TYPES, RATED_TYPES, draftToBody, emptyDraft, listingToDraft, tabForType } from '../lib/marketplace.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import CatalogSelections from '../components/CatalogSelections.jsx';
import MarketplaceNav from '../components/marketplace/MarketplaceNav.jsx';
import ListingPhotosInput from '../components/marketplace/ListingPhotosInput.jsx';
import { errorText } from '../lib/error-text.js';

const LISTING_TYPES = ['sell', 'wanted', 'lesson', 'service_offer', 'service_wanted', 'endorsement'];

export default function ListingEditorScreen({ route }) {
  const { t } = useI18n();
  const id = route.name === 'edit-listing' ? route.query.get('id') : null;
  const requestedType = route.query.get('type');
  const [draft, setDraft] = useState(() => emptyDraft(LISTING_TYPES.includes(requestedType) ? requestedType : 'sell'));
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const field = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      conduit.transmit('/marketplace/catalog', { signal: controller.signal }),
      conduit.transmit('/catalog/instruments', { signal: controller.signal }),
      conduit.transmit('/catalog/genres', { signal: controller.signal }),
      id ? conduit.transmit(`/marketplace/listings/${encodeURIComponent(id)}`, { auth: true, signal: controller.signal }) : null,
    ]).then(([marketplace, instruments, genres, listing]) => {
      if (controller.signal.aborted) return;
      if (listing) {
        if (listing.seller.userId !== nucleus.payload.persona?.userId) throw new Error(t('marketplace.editor.notYours'));
        setDraft(listingToDraft(listing));
      }
      setCatalog({ marketplace, instruments: instruments.instruments, genres: genres.genres }); setLoaded(true);
    }).catch(failure => { if (!controller.signal.aborted) setError(errorText(failure)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision]);
  const tab = tabForType(draft.type);
  const categories = catalog?.marketplace.tabs.find(item => item.id === tab)?.categories || [];
  const subcategories = categories.find(item => item.id === draft.category)?.subcategories || [];
  const gear = GEAR_TYPES.includes(draft.type);
  const rated = RATED_TYPES.includes(draft.type);
  const priced = ['fixed', 'negotiable'].includes(draft.priceMode);
  const changeType = type => setDraft(previous => ({
    ...previous, type,
    ...(tabForType(type) !== tabForType(previous.type) ? { category: '', subcategory: '' } : {}),
    ...(GEAR_TYPES.includes(type) ? {} : { condition: '', shipping: false }),
    ...(RATED_TYPES.includes(type) ? {} : { rateUnit: '' }),
  }));
  const save = async event => {
    event.preventDefault();
    const result = draftToBody(draft);
    if (result.error) {
      setError(t(`marketplace.editor.errors.${result.error}`));
      requestAnimationFrame(() => document.getElementById('listing-editor-error')?.focus());
      return;
    }
    setSaving(true); setError('');
    try {
      const listing = await conduit.transmit(`/marketplace/listings${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PATCH' : 'POST', auth: true, body: result.body,
      });
      window.location.hash = `#listing?id=${listing.id}`;
    } catch (failure) { setError(errorText(failure)); setSaving(false); }
  };
  const busy = saving || uploading;
  return (
    <div className="container">
      <PageHeader eyebrow={t('marketplace.editor.eyebrow')} title={t(id ? 'marketplace.editor.editTitle' : 'marketplace.editor.newTitle')}
        subtitle={t('marketplace.editor.subtitle', { days: catalog?.marketplace.listingDays ?? 60 })} />
      <MarketplaceNav />
      {error && (loaded ? <p className="error" role="alert" id="listing-editor-error" tabIndex="-1">{error}</p>
        : <ErrorState message={error} onRetry={() => setRevision(value => value + 1)} />)}
      {loading ? <Spinner label={t('marketplace.editor.loading')} /> : loaded && <form className="form-stack" onSubmit={save} noValidate>
        <FormField id="listing-type" label={t('marketplace.editor.type')} required>
          <select className="input" value={draft.type} onChange={event => changeType(event.target.value)} disabled={busy}>
            {LISTING_TYPES.map(type => <option key={type} value={type}>{t(`marketplace.types.${type}`)}</option>)}
          </select>
        </FormField>
        <div className="form-grid">
          <FormField id="listing-category" label={t('marketplace.editor.category')} required>
            <select className="input" value={draft.category} disabled={busy}
              onChange={event => setDraft(previous => ({ ...previous, category: event.target.value, subcategory: '' }))}>
              <option value="">{t('marketplace.editor.chooseCategory')}</option>
              {categories.map(item => <option key={item.id} value={item.id}>{t(`marketplace.categories.${item.id}`)}</option>)}
            </select>
          </FormField>
          {!!subcategories.length && <FormField id="listing-subcategory" label={t('marketplace.editor.subcategory')}>
            <select className="input" value={draft.subcategory} disabled={busy} onChange={event => field('subcategory', event.target.value)}>
              <option value="">{t('marketplace.editor.noSubcategory')}</option>
              {subcategories.map(item => <option key={item} value={item}>{t(`marketplace.subcategories.${item}`)}</option>)}
            </select>
          </FormField>}
        </div>
        <FormField id="listing-title" label={t('marketplace.editor.title')} hint={t('marketplace.editor.titleHint')} required>
          <input className="input" value={draft.title} onChange={event => field('title', event.target.value)} minLength="3" maxLength="120" disabled={busy} />
        </FormField>
        <FormField id="listing-description" label={t('marketplace.editor.description')} hint={t('marketplace.editor.descriptionHint')} required>
          <textarea className="input listing-description-input" value={draft.description} onChange={event => field('description', event.target.value)}
            minLength="10" maxLength="5000" disabled={busy} />
        </FormField>
        {gear && <FormField id="listing-condition" label={t('marketplace.editor.condition')} required={draft.type === 'sell'}>
          <select className="input" value={draft.condition} disabled={busy} onChange={event => field('condition', event.target.value)}>
            <option value="">{t(draft.type === 'sell' ? 'marketplace.editor.chooseCondition' : 'marketplace.editor.anyCondition')}</option>
            {['new', 'used', 'refurbished'].map(value => <option key={value} value={value}>{t(`marketplace.conditions.${value}`)}</option>)}
          </select>
        </FormField>}
        <fieldset disabled={busy}>
          <legend>{t('marketplace.editor.price')}</legend>
          <div className="form-grid">
            <FormField id="listing-price-mode" label={t('marketplace.editor.priceMode')} required>
              <select className="input" value={draft.priceMode} onChange={event => field('priceMode', event.target.value)}>
                {['fixed', 'negotiable', 'free', 'contact'].map(mode => <option key={mode} value={mode}>{t(`marketplace.priceModes.${mode}`)}</option>)}
              </select>
            </FormField>
            {priced && <FormField id="listing-amount" label={t(draft.priceMode === 'fixed' ? 'marketplace.editor.amount' : 'marketplace.editor.amountOptional')}
              hint={t('marketplace.editor.amountHint')} required={draft.priceMode === 'fixed'}>
              <input className="input" inputMode="decimal" value={draft.amount} maxLength="16" onChange={event => field('amount', event.target.value)} />
            </FormField>}
            {priced && <FormField id="listing-currency" label={t('marketplace.editor.currency')}>
              <select className="input" value={draft.currency} onChange={event => field('currency', event.target.value)}>
                {[...new Set([draft.currency, ...COMMON_CURRENCIES, ...(catalog.marketplace.currencies || [])])].map(code =>
                  <option key={code} value={code}>{code}</option>)}
              </select>
            </FormField>}
            {priced && rated && <FormField id="listing-rate-unit" label={t('marketplace.editor.rateUnit')} required={draft.amount.trim() !== ''}>
              <select className="input" value={draft.rateUnit} onChange={event => field('rateUnit', event.target.value)}>
                <option value="">{t('marketplace.editor.chooseRate')}</option>
                {['hour', 'session', 'day', 'project'].map(unit => <option key={unit} value={unit}>{t(`marketplace.rateUnits.${unit}`)}</option>)}
              </select>
            </FormField>}
          </div>
        </fieldset>
        <FormField id="listing-location" label={t('marketplace.editor.location')} hint={t('marketplace.editor.locationHint')}>
          <input className="input" value={draft.locationText} onChange={event => field('locationText', event.target.value)} maxLength="160" disabled={busy} />
        </FormField>
        <details className="selection-panel">
          <summary>{t('marketplace.editor.coordinates')}</summary>
          <fieldset disabled={busy}>
            <legend className="sr-only">{t('marketplace.editor.coordinates')}</legend>
            <p className="field-hint">{t('marketplace.editor.coordinatesHint')}</p>
            <div className="form-grid">
              <FormField id="listing-latitude" label={t('marketplace.editor.latitude')}>
                <input className="input" inputMode="decimal" value={draft.latitude} maxLength="24" onChange={event => field('latitude', event.target.value)} />
              </FormField>
              <FormField id="listing-longitude" label={t('marketplace.editor.longitude')}>
                <input className="input" inputMode="decimal" value={draft.longitude} maxLength="24" onChange={event => field('longitude', event.target.value)} />
              </FormField>
            </div>
          </fieldset>
        </details>
        {gear ? <label className="checkbox-label"><input type="checkbox" checked={draft.shipping} disabled={busy} onChange={event => field('shipping', event.target.checked)} />
          {t('marketplace.editor.shipping')}</label>
          : <label className="checkbox-label"><input type="checkbox" checked={draft.remote} disabled={busy} onChange={event => field('remote', event.target.checked)} />
            {t('marketplace.editor.remote')}</label>}
        <ListingPhotosInput photos={draft.photos} onChange={value => field('photos', value)} max={catalog.marketplace.maxPhotos}
          disabled={saving} onBusy={setUploading} />
        <section className="form-stack" aria-labelledby="listing-tags-heading">
          <h2 className="heading-md" id="listing-tags-heading">{t('marketplace.editor.tags')}</h2>
          <CatalogSelections instruments={catalog.instruments} genres={catalog.genres} instrumentIds={draft.instrumentIds} genreIds={draft.genreIds}
            onInstruments={value => field('instrumentIds', value)} onGenres={value => field('genreIds', value)} disabled={busy} />
        </section>
        <p className="field-hint">{t('marketplace.editor.offPlatform')}</p>
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {saving ? t('marketplace.editor.saving') : t(id ? 'marketplace.editor.saveChanges' : 'marketplace.editor.publish')}</button>
          <button className="btn btn-ghost" type="button" disabled={saving}
            onClick={() => { window.location.hash = id ? `#listing?id=${id}` : '#marketplace'; }}>{t('marketplace.editor.cancel')}</button>
        </div>
      </form>}
    </div>
  );
}
