import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { EVENT_TYPES, LIMITS, draftToBody, emptyDraft, eventToDraft, timeZones } from '../lib/events.js';
import PageHeader from '../components/PageHeader.jsx';
import FormField from '../components/FormField.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import CatalogSelections from '../components/CatalogSelections.jsx';
import PlacePicker from '../components/PlacePicker.jsx';
import EventsNav from '../components/events/EventsNav.jsx';
import ChosenEntity from '../components/events/ChosenEntity.jsx';
import LineupEditor from '../components/events/LineupEditor.jsx';
import EventImagesInput from '../components/events/EventImagesInput.jsx';

function TicketLinks({ links, onChange, disabled }) {
  const { t } = useI18n();
  const update = (index, changes) => onChange(links.map((link, position) => (position === index ? { ...link, ...changes } : link)));
  return (
    <fieldset className="form-stack" disabled={disabled}>
      <legend>{t('events.editor.ticketLinks')}</legend>
      {links.map((link, index) => <div className="form-grid ticket-link-row" key={index}>
        <FormField id={`ticket-label-${index}`} label={t('events.editor.ticketLabel', { index: index + 1 })}>
          <input className="input" value={link.label} maxLength="80" onChange={changed => update(index, { label: changed.target.value })} />
        </FormField>
        <FormField id={`ticket-url-${index}`} label={t('events.editor.ticketUrl', { index: index + 1 })} hint={t('events.editor.ticketUrlHint')}>
          <input className="input" type="url" inputMode="url" value={link.url} maxLength="2048" placeholder="https://"
            onChange={changed => update(index, { url: changed.target.value })} />
        </FormField>
        <div><button className="text-link" type="button" onClick={() => onChange(links.filter((_, position) => position !== index))}>
          {t('events.editor.removeTicketLink', { index: index + 1 })}</button></div>
      </div>)}
      {links.length < LIMITS.ticketLinks && <div><button className="btn btn-secondary" type="button"
        onClick={() => onChange([...links, { label: '', url: '' }])}>{t('events.editor.addTicketLink')}</button></div>}
    </fieldset>
  );
}

export default function EventEditorScreen({ route }) {
  const { t } = useI18n();
  const id = route.name === 'edit-event' ? route.query.get('id') : null;
  const [draft, setDraft] = useState(() => emptyDraft());
  const [event, setEvent] = useState(null);
  const [pages, setPages] = useState([]);
  const [genres, setGenres] = useState([]);
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
      conduit.transmit('/organizations/mine', { auth: true, signal: controller.signal }),
      conduit.transmit('/catalog/genres', { signal: controller.signal }),
      id ? conduit.transmit(`/gigs/${encodeURIComponent(id)}`, { auth: true, signal: controller.signal }) : null,
    ]).then(([mine, catalog, existing]) => {
      if (controller.signal.aborted) return;
      if (existing && !existing.viewer.canEdit) throw new Error(t('events.editor.notAllowed'));
      setPages(mine.organizations.filter(item => item.managed && item.permissions.includes('manage_calendar')));
      setGenres(catalog.genres);
      if (existing) { setEvent(existing); setDraft(eventToDraft(existing)); }
      setLoaded(true);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision]);
  const save = async submitted => {
    submitted.preventDefault();
    const result = draftToBody(draft);
    if (result.error) {
      setError(t(`events.editor.errors.${result.error}`));
      requestAnimationFrame(() => document.getElementById('event-editor-error')?.focus());
      return;
    }
    setSaving(true); setError('');
    try {
      const saved = await conduit.transmit(`/gigs${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PATCH' : 'POST', auth: true, body: result.body,
      });
      window.location.hash = `#event?id=${saved.id}`;
    } catch (failure) {
      setError(failure.message); setSaving(false);
      requestAnimationFrame(() => document.getElementById('event-editor-error')?.focus());
    }
  };
  const busy = saving || uploading;
  const managed = new Set(pages.map(item => item.id));
  const others = (event?.organizers || []).filter(item => !managed.has(item.id));
  const toggleOrganizer = (organizationId, checked) => field('organizerIds', checked
    ? [...draft.organizerIds, organizationId] : draft.organizerIds.filter(value => value !== organizationId));
  const personal = id ? Boolean(event?.owner) : !draft.organizerIds.length;
  return (
    <div className="container">
      <PageHeader eyebrow={t('events.editor.eyebrow')} title={t(id ? 'events.editor.editTitle' : 'events.editor.newTitle')} subtitle={t('events.editor.subtitle')} />
      <EventsNav />
      {error && (loaded ? <p className="error" role="alert" id="event-editor-error" tabIndex="-1">{error}</p>
        : <ErrorState message={error} onRetry={() => setRevision(value => value + 1)} />)}
      {loading ? <Spinner label={t('events.editor.loading')} /> : loaded && <form className="form-stack event-editor" onSubmit={save} noValidate>
        <section className="form-stack" aria-labelledby="event-basics-heading">
          <h2 className="heading-md" id="event-basics-heading">{t('events.editor.basics')}</h2>
          <FormField id="event-title" label={t('events.editor.title')} hint={t('events.editor.titleHint')} required>
            <input className="input" value={draft.title} minLength="3" maxLength="160" disabled={busy} onChange={changed => field('title', changed.target.value)} />
          </FormField>
          <FormField id="event-type-input" label={t('events.editor.type')}>
            <select className="input" value={draft.type} disabled={busy} onChange={changed => field('type', changed.target.value)}>
              {EVENT_TYPES.map(value => <option key={value} value={value}>{t(`events.types.${value}`)}</option>)}
            </select>
          </FormField>
          <FormField id="event-description" label={t('events.editor.description')} hint={t('events.editor.descriptionHint')}>
            <textarea className="input listing-description-input" value={draft.description} maxLength="10000" disabled={busy}
              onChange={changed => field('description', changed.target.value)} />
          </FormField>
        </section>
        <fieldset className="form-stack" disabled={busy}>
          <legend>{t('events.editor.organizers')}</legend>
          <p className="field-hint">{pages.length ? t('events.editor.organizersHint') : t('events.editor.organizersNone')}</p>
          {pages.length > 0 && <div className="choice-grid">{pages.map(page => <label className="checkbox-label" key={page.id}>
            <input type="checkbox" checked={draft.organizerIds.includes(page.id)} onChange={changed => toggleOrganizer(page.id, changed.target.checked)} />
            {page.name} ({t(`organizations.kinds.${page.kind}`)})
          </label>)}</div>}
          {others.map(item => <p className="body-muted" key={item.id}>{t('events.editor.otherOrganizer', { name: item.name })}</p>)}
          {personal && <p className="body-muted">{t('events.editor.yourself')}</p>}
        </fieldset>
        <section className="form-stack" aria-labelledby="event-when-heading">
          <h2 className="heading-md" id="event-when-heading">{t('events.editor.when')}</h2>
          <FormField id="event-timezone" label={t('events.editor.timezone')} hint={t('events.editor.timezoneHint')} required>
            <select className="input" value={draft.timezone} disabled={busy} onChange={changed => field('timezone', changed.target.value)}>
              {timeZones(draft.timezone).map(zone => <option key={zone} value={zone}>{zone.replaceAll('_', ' ')}</option>)}
            </select>
          </FormField>
          <div className="form-grid">
            <FormField id="event-start" label={t('events.editor.start')} required>
              <input className="input" type="datetime-local" value={draft.startsAt} disabled={busy} onChange={changed => field('startsAt', changed.target.value)} />
            </FormField>
            <FormField id="event-end" label={t('events.editor.end')}>
              <input className="input" type="datetime-local" value={draft.endsAt} min={draft.startsAt || undefined} disabled={busy}
                onChange={changed => field('endsAt', changed.target.value)} />
            </FormField>
            <FormField id="event-doors" label={t('events.editor.doors')}>
              <input className="input" type="datetime-local" value={draft.doorsOpenAt} max={draft.startsAt || undefined} disabled={busy}
                onChange={changed => field('doorsOpenAt', changed.target.value)} />
            </FormField>
          </div>
        </section>
        <section className="form-stack" aria-labelledby="event-where-heading">
          <h2 className="heading-md" id="event-where-heading">{t('events.editor.where')}</h2>
          <ChosenEntity id="event-venue" type="venue" label={t('events.editor.venue')} value={draft.venue} disabled={busy}
            actionLabel={t('events.editor.chooseVenue')} onChange={value => field('venue', value)} />
          <PlacePicker id="event-city" label={t('events.editor.city')} value={draft.place} disabled={busy} onChange={value => field('place', value)} />
          <FormField id="event-address" label={t('events.editor.address')} hint={t('events.editor.addressHint')}>
            <input className="input" value={draft.address} maxLength="300" disabled={busy} onChange={changed => field('address', changed.target.value)} />
          </FormField>
          <details className="selection-panel">
            <summary>{t('events.editor.coordinates')}</summary>
            <fieldset disabled={busy}>
              <legend className="sr-only">{t('events.editor.coordinates')}</legend>
              <p className="field-hint">{t('events.editor.coordinatesHint')}</p>
              <div className="form-grid">
                <FormField id="event-latitude" label={t('events.editor.latitude')}>
                  <input className="input" inputMode="decimal" value={draft.latitude} maxLength="24" onChange={changed => field('latitude', changed.target.value)} />
                </FormField>
                <FormField id="event-longitude" label={t('events.editor.longitude')}>
                  <input className="input" inputMode="decimal" value={draft.longitude} maxLength="24" onChange={changed => field('longitude', changed.target.value)} />
                </FormField>
              </div>
            </fieldset>
          </details>
        </section>
        <LineupEditor lineup={draft.lineup} onChange={value => field('lineup', value)} disabled={busy} />
        <section className="form-stack" aria-labelledby="event-tickets-editor-heading">
          <h2 className="heading-md" id="event-tickets-editor-heading">{t('events.editor.tickets')}</h2>
          <div className="form-grid">
            <FormField id="event-capacity" label={t('events.editor.capacity')}>
              <input className="input" type="number" min="1" max="10000000" inputMode="numeric" value={draft.capacity} disabled={busy}
                onChange={changed => field('capacity', changed.target.value)} />
            </FormField>
            <FormField id="event-sold" label={t('events.editor.ticketsSold')} hint={t('events.editor.ticketsSoldHint')}>
              <input className="input" type="number" min="0" max={draft.capacity || undefined} inputMode="numeric" value={draft.ticketsSold} disabled={busy}
                onChange={changed => field('ticketsSold', changed.target.value)} />
            </FormField>
          </div>
          <TicketLinks links={draft.ticketLinks} onChange={value => field('ticketLinks', value)} disabled={busy} />
        </section>
        <section className="form-stack" aria-labelledby="event-genres-heading">
          <h2 className="heading-md" id="event-genres-heading">{t('events.editor.genres')}</h2>
          <CatalogSelections hideInstruments instruments={[]} instrumentIds={[]} genres={genres} genreIds={draft.genreIds}
            onInstruments={() => {}} onGenres={value => field('genreIds', value.slice(0, LIMITS.genres))} disabled={busy} />
        </section>
        <EventImagesInput images={draft.images} onChange={value => field('images', value)} disabled={saving} onBusy={setUploading} />
        <fieldset disabled={busy}>
          <legend>{t('events.editor.visibility')}</legend>
          {['draft', 'published'].map(value => <label className="checkbox-label" key={value}>
            <input type="radio" name="event-visibility" value={value} checked={draft.visibility === value} onChange={() => field('visibility', value)} />
            {t(`events.editor.visibilityOptions.${value}`)}
          </label>)}
        </fieldset>
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={busy}>{saving ? t('events.editor.saving') : t('events.editor.save')}</button>
          <button className="btn btn-ghost" type="button" disabled={saving}
            onClick={() => { window.location.hash = id ? `#event?id=${id}` : '#events'; }}>{t('events.editor.cancel')}</button>
        </div>
      </form>}
    </div>
  );
}
