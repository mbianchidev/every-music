import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { uploadImage } from '../lib/media.js';
import { useI18n } from '../lib/i18n.js';
import {
  BUSINESS_KINDS, OPEN_TO, ORGANIZATION_KINDS, VENUE_TYPES, can, organizationBody,
} from '../lib/organizations.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import FormField from '../components/FormField.jsx';
import ImageInput from '../components/ImageInput.jsx';
import CatalogSelections from '../components/CatalogSelections.jsx';
import LinkListEditor from '../components/LinkListEditor.jsx';

const blank = {
  kind: 'band', managed: true, name: '', slug: '', title: '', bio: '', pictureUrl: null,
  city: '', region: '', country: '', latitude: '', longitude: '', contactEmail: '', contactPhone: '', workWithUs: '',
  venueType: '', capacity: '', activeSince: '', activeUntil: '', parkingInfo: '', directions: '',
  formedYear: '', youtubeChannelId: '', openTo: { tours: false, live: false, supportActs: false, endorsements: false },
  genreIds: [], links: [],
};
const text = value => value ?? '';
const numberText = value => (value === null || value === undefined ? '' : String(value));

function fromOrganization(organization) {
  return {
    ...blank, kind: organization.kind, managed: organization.managed, name: organization.name, slug: text(organization.slug),
    bio: text(organization.bio), pictureUrl: organization.pictureUrl, city: text(organization.location.city),
    region: text(organization.location.region), country: text(organization.location.country),
    latitude: numberText(organization.coordinates?.latitude), longitude: numberText(organization.coordinates?.longitude),
    contactEmail: text(organization.contacts.email), contactPhone: text(organization.contacts.phone), workWithUs: text(organization.workWithUs),
    venueType: text(organization.venue?.type), capacity: numberText(organization.venue?.capacity),
    activeSince: numberText(organization.activeSince), activeUntil: numberText(organization.activeUntil),
    parkingInfo: text(organization.venue?.parkingInfo), directions: text(organization.venue?.directions),
    formedYear: numberText(organization.band?.formedYear), youtubeChannelId: text(organization.band?.youtubeChannelId),
    openTo: organization.band?.openTo ?? blank.openTo,
    genreIds: organization.genres.map(genre => genre.id), links: organization.links,
  };
}

export default function OrganizationEditorScreen({ route }) {
  const { t } = useI18n();
  const id = route.name === 'edit-organization' ? route.query.get('id') : null;
  const [draft, setDraft] = useState(() => ({ ...blank, kind: ORGANIZATION_KINDS.includes(route.query.get('kind')) ? route.query.get('kind') : 'band' }));
  const [context, setContext] = useState(null);
  const [file, setFile] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const field = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      conduit.transmit('/catalog/genres', { signal: controller.signal }),
      conduit.transmit('/entitlements/me', { auth: true, signal: controller.signal }),
      id ? conduit.transmit(`/organizations/${encodeURIComponent(id)}`, { auth: true, signal: controller.signal }) : null,
    ]).then(([genres, plan, organization]) => {
      if (controller.signal.aborted) return;
      if (organization && !can(organization, 'manage_profile')) throw new Error(t('organizations.editor.notAllowed'));
      if (organization) setDraft(fromOrganization(organization));
      setContext({ genres: genres.genres, businessPages: plan.limits.businessPages !== false, organization });
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision]);
  const businessBlocked = !id && context && !context.businessPages && BUSINESS_KINDS.includes(draft.kind) && !(draft.kind === 'venue' && !draft.managed);
  const save = async event => {
    event.preventDefault();
    if (!draft.name.trim()) { setError(t('organizations.editor.nameRequired')); return; }
    const { body, invalid } = organizationBody(draft, !id);
    if (invalid.length) { setError(t('organizations.editor.invalidNumbers', { fields: invalid.map(key => t(`organizations.fields.${key}`)).join(', ') })); return; }
    setSaving(true); setError('');
    try {
      if (file) {
        body.pictureUrl = (await uploadImage(file, 'organization')).url;
        field('pictureUrl', body.pictureUrl); setFile(null);
      }
      const saved = await conduit.transmit(`/organizations${id ? `/${context.organization.id}` : ''}`, { method: id ? 'PATCH' : 'POST', auth: true, body });
      window.location.hash = `#organization?id=${saved.id}`;
    } catch (failure) {
      setError(failure.details?.length ? `${failure.message}: ${failure.details.join('; ')}` : failure.message);
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!window.confirm(t('organizations.editor.confirmDelete', { name: context.organization.name }))) return;
    setSaving(true); setError('');
    try {
      await conduit.transmit(`/organizations/${context.organization.id}`, { method: 'DELETE', auth: true });
      window.location.hash = '#your-pages';
    } catch (failure) { setError(failure.message); setSaving(false); }
  };
  const kindLabel = t(`organizations.kinds.${draft.kind}`);
  const leader = ['leader', 'maintainer'].includes(context?.organization?.viewer?.role);
  return (
    <div className="container">
      <PageHeader eyebrow={t('organizations.editor.eyebrow')} title={id ? t('organizations.editor.editTitle', { name: context?.organization?.name || kindLabel }) : t('organizations.editor.createTitle')}
        subtitle={t('organizations.editor.subtitle')} />
      {error && (context ? <p className="error" role="alert">{error}</p> : <ErrorState message={error} onRetry={() => setRevision(value => value + 1)} />)}
      {loading ? <Spinner label={t('organizations.editor.loading')} /> : context && <form className="form-stack" onSubmit={save} noValidate>
        {!id && <fieldset disabled={saving}>
          <legend>{t('organizations.editor.kind')}</legend>
          {ORGANIZATION_KINDS.map(kind => <label className="checkbox-label" key={kind}>
            <input type="radio" name="organization-kind" value={kind} checked={draft.kind === kind} onChange={() => field('kind', kind)} />
            {t(`organizations.kinds.${kind}`)}
          </label>)}
          {draft.kind === 'venue' && <label className="checkbox-label">
            <input type="checkbox" checked={!draft.managed} onChange={event => field('managed', !event.target.checked)} />
            {t('organizations.editor.unmanaged')}
          </label>}
          <p className="field-hint">{draft.kind === 'venue' && !draft.managed ? t('organizations.editor.unmanagedHint') : t('organizations.editor.kindHint')}</p>
        </fieldset>}
        {businessBlocked && <p className="status-message" role="status">{t('organizations.editor.partnerRequired')}</p>}
        <FormField id="organization-name" label={t('organizations.fields.name')} required>
          <input className="input" value={draft.name} maxLength="255" disabled={saving} onChange={event => field('name', event.target.value)} />
        </FormField>
        <FormField id="organization-slug" label={t('organizations.fields.slug')} hint={t('organizations.editor.slugHint')}>
          <input className="input" value={draft.slug} maxLength="80" pattern="[a-z0-9]+(-[a-z0-9]+)*" disabled={saving} onChange={event => field('slug', event.target.value)} />
        </FormField>
        {!id && (draft.kind !== 'venue' || draft.managed) && <FormField id="organization-title" label={t('organizations.fields.yourTitle')} hint={t('organizations.editor.titleHint')}>
          <input className="input" value={draft.title} maxLength="100" disabled={saving} onChange={event => field('title', event.target.value)} />
        </FormField>}
        <ImageInput id="organization-picture" label={t('organizations.fields.picture')} value={draft.pictureUrl} disabled={saving}
          onChange={value => field('pictureUrl', value)} onFile={setFile} />
        <FormField id="organization-bio" label={draft.kind === 'band' ? t('organizations.fields.description') : t('organizations.fields.bio')}>
          <textarea className="input" value={draft.bio} maxLength="5000" disabled={saving} onChange={event => field('bio', event.target.value)} />
        </FormField>
        {draft.kind !== 'band' && <FormField id="organization-work" label={t('organizations.fields.workWithUs')} hint={t('organizations.editor.workHint')}>
          <textarea className="input" value={draft.workWithUs} maxLength="5000" disabled={saving} onChange={event => field('workWithUs', event.target.value)} />
        </FormField>}
        <fieldset disabled={saving}>
          <legend>{t('organizations.editor.location')}</legend>
          <div className="form-grid">
            <FormField id="organization-city" label={t('organizations.fields.city')}><input className="input" value={draft.city} maxLength="255" onChange={event => field('city', event.target.value)} /></FormField>
            <FormField id="organization-region" label={t('organizations.fields.region')}><input className="input" value={draft.region} maxLength="255" onChange={event => field('region', event.target.value)} /></FormField>
            <FormField id="organization-country" label={t('organizations.fields.country')}><input className="input" value={draft.country} maxLength="255" onChange={event => field('country', event.target.value)} /></FormField>
          </div>
          <p className="field-hint">{t('organizations.editor.coordinatesHint')}</p>
          <div className="form-grid">
            <FormField id="organization-latitude" label={t('organizations.fields.latitude')}><input className="input" type="number" step="any" min="-90" max="90" value={draft.latitude} onChange={event => field('latitude', event.target.value)} /></FormField>
            <FormField id="organization-longitude" label={t('organizations.fields.longitude')}><input className="input" type="number" step="any" min="-180" max="180" value={draft.longitude} onChange={event => field('longitude', event.target.value)} /></FormField>
          </div>
        </fieldset>
        {draft.kind === 'venue' && <fieldset disabled={saving}>
          <legend>{t('organizations.editor.venueDetails')}</legend>
          <div className="form-grid">
            <FormField id="organization-venue-type" label={t('organizations.fields.venueType')}>
              <select className="input" value={draft.venueType} onChange={event => field('venueType', event.target.value)}>
                <option value="">{t('organizations.editor.notSpecified')}</option>
                {VENUE_TYPES.map(type => <option key={type} value={type}>{t(`organizations.venueTypes.${type}`)}</option>)}
              </select>
            </FormField>
            <FormField id="organization-capacity" label={t('organizations.fields.capacity')}><input className="input" type="number" min="1" max="1000000" value={draft.capacity} onChange={event => field('capacity', event.target.value)} /></FormField>
          </div>
          <FormField id="organization-parking" label={t('organizations.fields.parkingInfo')}><textarea className="input" value={draft.parkingInfo} maxLength="2000" onChange={event => field('parkingInfo', event.target.value)} /></FormField>
          <FormField id="organization-directions" label={t('organizations.fields.directions')}><textarea className="input" value={draft.directions} maxLength="2000" onChange={event => field('directions', event.target.value)} /></FormField>
        </fieldset>}
        {draft.kind !== 'band' && <fieldset disabled={saving}>
          <legend>{t('organizations.fields.yearsActive')}</legend>
          <div className="form-grid">
            <FormField id="organization-active-since" label={t('organizations.fields.activeSince')}><input className="input" type="number" min="1800" max="2200" value={draft.activeSince} onChange={event => field('activeSince', event.target.value)} /></FormField>
            <FormField id="organization-active-until" label={t('organizations.fields.activeUntil')} hint={t('organizations.editor.activeUntilHint')}><input className="input" type="number" min="1800" max="2200" value={draft.activeUntil} onChange={event => field('activeUntil', event.target.value)} /></FormField>
          </div>
        </fieldset>}
        {draft.kind === 'band' && <fieldset disabled={saving}>
          <legend>{t('organizations.editor.bandDetails')}</legend>
          <FormField id="organization-formed" label={t('organizations.fields.formedYear')}><input className="input" type="number" min="1800" max="2200" value={draft.formedYear} onChange={event => field('formedYear', event.target.value)} /></FormField>
          <fieldset>
            <legend>{t('organizations.fields.openTo')}</legend>
            {OPEN_TO.map(key => <label className="checkbox-label" key={key}>
              <input type="checkbox" checked={Boolean(draft.openTo[key])} onChange={event => field('openTo', { ...draft.openTo, [key]: event.target.checked })} />
              {t(`organizations.openTo.${key}`)}
            </label>)}
          </fieldset>
          <FormField id="organization-youtube" label={t('organizations.fields.youtubeChannelId')} hint={t('organizations.editor.youtubeHint')}>
            <input className="input" value={draft.youtubeChannelId} maxLength="24" pattern="UC[A-Za-z0-9_-]{22}" onChange={event => field('youtubeChannelId', event.target.value)} />
          </FormField>
        </fieldset>}
        <fieldset disabled={saving}>
          <legend>{t('organizations.page.contacts')}</legend>
          <div className="form-grid">
            <FormField id="organization-email" label={t('organizations.fields.contactEmail')}><input className="input" type="email" value={draft.contactEmail} maxLength="320" onChange={event => field('contactEmail', event.target.value)} /></FormField>
            <FormField id="organization-phone" label={t('organizations.fields.contactPhone')}><input className="input" type="tel" value={draft.contactPhone} maxLength="50" onChange={event => field('contactPhone', event.target.value)} /></FormField>
          </div>
        </fieldset>
        <CatalogSelections genres={context.genres} instruments={[]} instrumentIds={[]} genreIds={draft.genreIds} hideInstruments
          onInstruments={() => {}} onGenres={value => field('genreIds', value)} disabled={saving} />
        <p className="field-hint">{t('organizations.editor.genresHint')}</p>
        <LinkListEditor id="organization-links" legend={t('organizations.editor.links')} links={draft.links} disabled={saving} onChange={value => field('links', value)} />
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={saving || businessBlocked}>{saving ? t('organizations.common.saving') : id ? t('organizations.editor.save') : t('organizations.editor.create')}</button>
          <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => { window.location.hash = id ? `#organization?id=${context.organization.id}` : '#your-pages'; }}>{t('organizations.common.cancel')}</button>
          {id && leader && <button className="btn btn-danger" type="button" disabled={saving} onClick={remove}>{t('organizations.editor.delete')}</button>}
        </div>
      </form>}
    </div>
  );
}
