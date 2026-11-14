import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { uploadImage } from '../lib/media.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import CatalogSelections from '../components/CatalogSelections.jsx';
import ImageInput from '../components/ImageInput.jsx';
import PlacePicker from '../components/PlacePicker.jsx';
import QuotaNotice, { useQuotas } from '../components/QuotaNotice.jsx';
import { useI18n } from '../lib/i18n.js';

const DAY = 24 * 60 * 60 * 1000;
const localDate = date => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export default function CreatePostScreen({ route }) {
  const id = route.name === 'edit-announcement' ? route.query.get('id') : null;
  const { t } = useI18n();
  const quotas = useQuotas();
  const expiryDays = quotas.data ? quotas.data.announcementExpiryDays : undefined;
  const [draft, setDraft] = useState({ title: '', description: '', city: '', place: null, expiresAt: '', isRemote: false, isCoverBand: false, isPublished: true, instrumentIds: [], genreIds: [], pictureUrl: null, links: [] });
  const [originalExpiry, setOriginalExpiry] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const field = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([
      conduit.transmit('/catalog/instruments', { signal: controller.signal }),
      conduit.transmit('/catalog/genres', { signal: controller.signal }),
      id ? conduit.transmit(`/announcements/${id}`, { auth: true, signal: controller.signal }) : null,
    ]).then(([instruments, genres, post]) => {
      if (controller.signal.aborted) return;
      if (post) {
        if (post.userId !== nucleus.payload.persona?.userId) throw new Error('You can only edit your own announcements.');
        const expiresAt = post.expiresAt ? localDate(new Date(post.expiresAt)) : '';
        setOriginalExpiry(expiresAt);
        setDraft({
          title: post.title, description: post.description, city: post.location.city || '',
          place: post.place ? { id: post.place.id, label: post.place.label } : null, expiresAt,
          isRemote: post.isRemote, isCoverBand: post.isCoverBand, isPublished: post.isPublished, pictureUrl: post.pictureUrl,
          instrumentIds: post.instruments.map(item => item.instrument_id), genreIds: post.genres.map(item => item.genre_id),
          links: post.links.map(item => ({ linkType: item.link_type, url: item.url })),
        });
      }
      setCatalog({ instruments: instruments.instruments, genres: genres.genres }); setLoaded(true);
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, revision]);
  useEffect(() => {
    if (!id && typeof expiryDays === 'number') {
      setDraft(previous => (previous.expiresAt ? previous : { ...previous, expiresAt: localDate(new Date(Date.now() + expiryDays * DAY)) }));
    }
  }, [id, expiryDays]);
  const save = async event => {
    event.preventDefault();
    if (draft.title.trim().length < 5 || draft.description.trim().length < 20) {
      setError('Use at least 5 characters for the title and 20 for the description.'); return;
    }
    setSaving(true); setError('');
    try {
      let pictureUrl = draft.pictureUrl;
      if (file) {
        pictureUrl = (await uploadImage(file, 'announcement')).url;
        field('pictureUrl', pictureUrl); setFile(null);
      }
      const { place, expiresAt, ...fields } = draft;
      const expiry = id
        ? (expiresAt !== originalExpiry ? { expiresAt: expiresAt || null } : {})
        : (expiresAt ? { expiresAt } : {});
      const post = await conduit.transmit(`/announcements/${id || ''}`, {
        method: id ? 'PUT' : 'POST', auth: true,
        body: {
          ...fields, title: draft.title.trim(), description: draft.description.trim(), pictureUrl, links: draft.links.filter(item => item.url.trim()),
          placeId: place ? place.id : null, city: place ? undefined : draft.city.trim(), ...expiry,
        },
      });
      window.location.hash = `#announcement?id=${post.id}`;
    } catch (failure) { setError(failure.message); setSaving(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow="Make a connection" title={id ? 'Edit your call' : 'Post a call'} subtitle="Tell the right people what you have in mind." />
      {error && (loaded ? <p className="error" role="alert">{error}</p> : <ErrorState message={error} onRetry={() => setRevision(value => value + 1)} />)}
      {loading ? <Spinner label="Loading editor" /> : loaded && <form className="form-stack" onSubmit={save}>
        <FormField id="announcement-title" label="Title" required><input className="input" value={draft.title} onChange={event => field('title', event.target.value)} minLength="5" maxLength="255" disabled={saving} /></FormField>
        <FormField id="announcement-description" label="Description" required hint="Include style, goals, availability, and expectations.">
          <textarea className="input" style={{ minHeight: '180px', resize: 'vertical' }} value={draft.description} onChange={event => field('description', event.target.value)} minLength="20" maxLength="5000" disabled={saving} />
        </FormField>
        <ImageInput id="announcement-image" label="Announcement image" value={draft.pictureUrl} onChange={value => field('pictureUrl', value)} onFile={setFile} disabled={saving} />
        <PlacePicker id="announcement-city" label={t('places.city')} hint={t('places.cityHint')} value={draft.place} text={draft.city}
          onChange={place => field('place', place)} onText={text => field('city', text)} disabled={saving} />
        <FormField id="announcement-expires" label={t('adExtras.expiry.label')}
          hint={expiryDays === null ? t('adExtras.expiry.hintUnlimited') : typeof expiryDays === 'number' ? t('adExtras.expiry.hintLimited', { count: expiryDays }) : undefined}>
          <input className="input" type="date" value={draft.expiresAt} disabled={saving}
            min={!id || draft.expiresAt !== originalExpiry ? localDate(new Date(Date.now() + DAY)) : undefined}
            max={typeof expiryDays === 'number' && (!id || draft.expiresAt !== originalExpiry) ? localDate(new Date(Date.now() + expiryDays * DAY)) : undefined}
            onChange={event => field('expiresAt', event.target.value)} />
        </FormField>
        <label className="checkbox-label"><input type="checkbox" checked={draft.isRemote} onChange={event => field('isRemote', event.target.checked)} disabled={saving} />Remote collaboration is welcome</label>
        <label className="checkbox-label"><input type="checkbox" checked={draft.isCoverBand} onChange={event => field('isCoverBand', event.target.checked)} disabled={saving} />This is a cover band</label>
        <label className="checkbox-label"><input type="checkbox" checked={draft.isPublished} onChange={event => field('isPublished', event.target.checked)} disabled={saving} />Publish announcement (uncheck to save a private draft)</label>
        <QuotaNotice kind="activeAnnouncements" quotas={quotas} />
        <CatalogSelections {...catalog} instrumentIds={draft.instrumentIds} genreIds={draft.genreIds}
          onInstruments={value => field('instrumentIds', value)} onGenres={value => field('genreIds', value)} disabled={saving} />
        <fieldset disabled={saving}>
          <legend>Music and website links</legend>
          {draft.links.map((link, index) => <div className="experience-row" key={index}>
            <FormField id={`link-type-${index}`} label="Link type"><select className="input" value={link.linkType} onChange={event => field('links', draft.links.map((item, i) => i === index ? { ...item, linkType: event.target.value } : item))}>
              {['website', 'spotify', 'youtube', 'soundcloud', 'bandcamp', 'other'].map(type => <option key={type} value={type}>{type}</option>)}
            </select></FormField>
            <FormField id={`link-url-${index}`} label="Link URL"><input className="input" type="url" value={link.url} maxLength="2048" onChange={event => field('links', draft.links.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} /></FormField>
            <button className="text-link" type="button" onClick={() => {
              field('links', draft.links.filter((_, i) => i !== index));
              document.getElementById('announcement-add-link')?.focus();
            }}>Remove link {index + 1}</button>
          </div>)}
          <button id="announcement-add-link" className="text-link" type="button" disabled={draft.links.length >= 10} onClick={() => field('links', [...draft.links, { linkType: 'website', url: '' }])}>Add a link</button>
        </fieldset>
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? 'Saving...' : id ? 'Save changes' : draft.isPublished ? 'Publish' : 'Save draft'}</button>
          <button className="btn btn-ghost" type="button" disabled={saving} onClick={() => { window.location.hash = id ? `#announcement?id=${id}` : '#feed'; }}>Cancel</button>
        </div>
      </form>}
    </div>
  );
}
