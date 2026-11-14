import { useState } from 'react';
import conduit, { Conduit } from '../../lib/conduit.js';
import { uploadImage } from '../../lib/media.js';
import { useResource } from '../../lib/resources.js';
import { useI18n } from '../../lib/i18n.js';
import { readFileAsBase64 } from '../../lib/monetization.js';
import FormField from '../FormField.jsx';
import ImageInput from '../ImageInput.jsx';
import PlacePicker from '../PlacePicker.jsx';
import CatalogSelections from '../CatalogSelections.jsx';

// Videos can take longer to upload than the default request timeout.
const uploads = new Conduit({ timeoutMs: 180000 });
const VIDEO_TYPES = ['video/mp4', 'video/webm'];

const localInput = value => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const isoFrom = value => (value ? new Date(value).toISOString() : null);
const text = value => (typeof value === 'string' && value.trim() ? value.trim() : null);
const integer = value => (value === '' || value === null || value === undefined ? null : Number(value));

function draftFrom(card) {
  return {
    sponsorName: card?.sponsorName ?? '', title: card?.title ?? '', body: card?.body ?? '',
    linkUrl: card?.linkUrl ?? '', linkLabel: card?.linkLabel ?? '', imageUrl: card?.imageUrl ?? null, imageAlt: card?.imageAlt ?? '',
    videoUrl: card?.videoUrl ?? '', videoSeconds: card?.videoSeconds ?? '', rewardPoints: card?.rewardPoints ?? '',
    placements: card?.placements ?? ['feed', 'musicians'], genreIds: card?.genreIds ?? [], instrumentIds: card?.instrumentIds ?? [],
    place: card?.placeId ? { id: card.placeId, label: card.placeLabel } : null, radiusKm: card?.radiusKm ?? 50,
    startsAt: localInput(card?.startsAt), endsAt: localInput(card?.endsAt), priority: card?.priority ?? 0,
    maxPerPage: card?.maxPerPage ?? 1, active: card?.active ?? true,
  };
}

export default function SponsoredCardForm({ card, defaultPoints, videoBytes, onSaved, onCancel }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => draftFrom(card));
  const [imageFile, setImageFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const instruments = useResource('/catalog/instruments', { auth: false, reconnect: false });
  const genres = useResource('/catalog/genres', { auth: false, reconnect: false });
  const set = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const sizeMiB = Math.floor(videoBytes / 1048576);
  const prefix = card?.id ? `card-${card.id}` : 'card-new';
  const chooseVideo = (event) => {
    const file = event.target.files[0] ?? null;
    if (file && (!VIDEO_TYPES.includes(file.type) || file.size > videoBytes)) {
      setError(t('monetization.admin.form.videoInvalid', { size: sizeMiB }));
      event.target.value = '';
      setVideoFile(null);
      return;
    }
    setError('');
    setVideoFile(file);
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!draft.placements.length) { setError(t('monetization.admin.form.placementRequired')); return; }
    setBusy('saving'); setError('');
    try {
      const imageUrl = imageFile ? (await uploadImage(imageFile, 'sponsored')).url : draft.imageUrl;
      const body = {
        sponsorName: draft.sponsorName.trim(), title: draft.title.trim(), body: draft.body.trim(),
        linkUrl: text(draft.linkUrl), linkLabel: text(draft.linkLabel), imageUrl: imageUrl || null, imageAlt: text(draft.imageAlt),
        videoUrl: text(draft.videoUrl), videoSeconds: integer(draft.videoSeconds), rewardPoints: integer(draft.rewardPoints),
        placements: draft.placements, genreIds: draft.genreIds, instrumentIds: draft.instrumentIds,
        placeId: draft.place?.id ?? null, ...(draft.place ? { radiusKm: Number(draft.radiusKm) } : {}),
        ...(draft.startsAt ? { startsAt: isoFrom(draft.startsAt) } : {}), endsAt: isoFrom(draft.endsAt),
        priority: Number(draft.priority), maxPerPage: Number(draft.maxPerPage), active: draft.active,
      };
      let saved = await conduit.transmit(card?.id ? `/admin/sponsored-cards/${card.id}` : '/admin/sponsored-cards', {
        method: card?.id ? 'PATCH' : 'POST', auth: true, body,
      });
      if (videoFile) {
        setBusy('uploading');
        saved = await uploads.transmit(`/admin/sponsored-cards/${saved.id}/video`, {
          method: 'POST', auth: true, body: { data: await readFileAsBase64(videoFile), mimeType: videoFile.type },
        });
      }
      onSaved(saved);
    } catch (failure) {
      setError(failure.message);
      setBusy('');
    }
  };
  const field = (key, label, input, extra = {}) => <FormField id={`${prefix}-${key}`} label={label} {...extra}>{input}</FormField>;
  const disabled = Boolean(busy);
  return (
    <form className="form-stack card sponsored-form" onSubmit={submit} aria-labelledby={`${prefix}-heading`}>
      <h3 id={`${prefix}-heading`}>{card?.id ? t('monetization.admin.form.editTitle') : t('monetization.admin.form.newTitle')}</h3>
      {field('sponsor', t('monetization.admin.form.sponsor'), <input className="input" value={draft.sponsorName} minLength="2" maxLength="80" disabled={disabled}
        onChange={event => set('sponsorName', event.target.value)} />, { required: true })}
      {field('title', t('monetization.admin.form.title'), <input className="input" value={draft.title} minLength="3" maxLength="120" disabled={disabled}
        onChange={event => set('title', event.target.value)} />, { required: true })}
      {field('body', t('monetization.admin.form.body'), <textarea className="input" value={draft.body} minLength="3" maxLength="600" disabled={disabled}
        onChange={event => set('body', event.target.value)} />, { required: true })}
      {field('link', t('monetization.admin.form.linkUrl'), <input className="input" type="url" value={draft.linkUrl} maxLength="2048" pattern="https://.+" disabled={disabled}
        onChange={event => set('linkUrl', event.target.value)} />)}
      {field('link-label', t('monetization.admin.form.linkLabel'), <input className="input" value={draft.linkLabel} maxLength="60" disabled={disabled}
        onChange={event => set('linkLabel', event.target.value)} />)}
      <ImageInput id={`${prefix}-image`} label={t('monetization.admin.form.image')} value={draft.imageUrl} disabled={disabled}
        onFile={setImageFile} onChange={value => set('imageUrl', value)} />
      {field('image-alt', t('monetization.admin.form.imageAlt'), <input className="input" value={draft.imageAlt} maxLength="200" disabled={disabled}
        onChange={event => set('imageAlt', event.target.value)} />, { hint: t('monetization.admin.form.imageAltHint'), required: Boolean(draft.imageUrl || imageFile) })}
      {field('video-url', t('monetization.admin.form.videoUrl'), <input className="input" type="url" value={draft.videoUrl} maxLength="2048" pattern="https://.+" disabled={disabled}
        onChange={event => set('videoUrl', event.target.value)} />)}
      {card?.videoMediaUrl && <p className="field-hint">{t('monetization.admin.form.videoCurrent')}</p>}
      {field('video-file', t('monetization.admin.form.videoFile', { size: sizeMiB }), <input className="input" type="file" accept={VIDEO_TYPES.join(',')} disabled={disabled}
        onChange={chooseVideo} />)}
      {field('video-seconds', t('monetization.admin.form.videoSeconds'), <input className="input" type="number" min="5" max="600" value={draft.videoSeconds} disabled={disabled}
        onChange={event => set('videoSeconds', event.target.value)} />, { hint: t('monetization.admin.form.videoSecondsHint') })}
      {field('reward', t('monetization.admin.form.rewardPoints'), <input className="input" type="number" min="1" max="1000" value={draft.rewardPoints} disabled={disabled}
        onChange={event => set('rewardPoints', event.target.value)} />, { hint: t('monetization.admin.form.rewardHint', { points: defaultPoints }) })}
      <fieldset disabled={disabled}>
        <legend>{t('monetization.admin.form.placements')}</legend>
        {[['feed', 'placementFeed'], ['musicians', 'placementMusicians']].map(([value, key]) => <label className="checkbox-label" key={value}>
          <input type="checkbox" checked={draft.placements.includes(value)} onChange={event => set('placements',
            event.target.checked ? [...draft.placements, value] : draft.placements.filter(item => item !== value))} />
          {t(`monetization.admin.form.${key}`)}
        </label>)}
      </fieldset>
      <p className="field-hint">{t('monetization.admin.form.targetingHint')}</p>
      {instruments.data && genres.data && <CatalogSelections instruments={instruments.data.instruments} genres={genres.data.genres}
        instrumentIds={draft.instrumentIds} genreIds={draft.genreIds} disabled={disabled}
        onInstruments={value => set('instrumentIds', value)} onGenres={value => set('genreIds', value)} />}
      <PlacePicker id={`${prefix}-place`} label={t('monetization.admin.form.area')} value={draft.place} disabled={disabled}
        onChange={value => set('place', value)} />
      {draft.place && field('radius', t('monetization.admin.form.radius'), <input className="input" type="number" min="1" max="1000" value={draft.radiusKm} disabled={disabled}
        onChange={event => set('radiusKm', event.target.value)} />, { required: true })}
      {field('starts', t('monetization.admin.form.startsAt'), <input className="input" type="datetime-local" value={draft.startsAt} disabled={disabled}
        onChange={event => set('startsAt', event.target.value)} />)}
      {field('ends', t('monetization.admin.form.endsAt'), <input className="input" type="datetime-local" value={draft.endsAt} disabled={disabled}
        onChange={event => set('endsAt', event.target.value)} />)}
      {field('priority', t('monetization.admin.form.priority'), <input className="input" type="number" min="0" max="100" value={draft.priority} disabled={disabled}
        onChange={event => set('priority', event.target.value)} />)}
      {field('per-page', t('monetization.admin.form.maxPerPage'), <select className="input" value={draft.maxPerPage} disabled={disabled}
        onChange={event => set('maxPerPage', Number(event.target.value))}>{[1, 2, 3].map(value => <option key={value} value={value}>{value}</option>)}</select>)}
      <label className="checkbox-label"><input type="checkbox" checked={draft.active} disabled={disabled} onChange={event => set('active', event.target.checked)} />
        {t('monetization.admin.form.active')}</label>
      {error && <p className="field-error" role="alert">{error}</p>}
      {busy === 'uploading' && <p role="status">{t('monetization.admin.form.uploading')}</p>}
      <div className="button-row">
        <button className="btn btn-primary" type="submit" disabled={disabled}>{busy ? t('monetization.admin.form.saving') : t('monetization.admin.form.save')}</button>
        <button className="btn btn-ghost" type="button" disabled={disabled} onClick={onCancel}>{t('monetization.admin.form.cancel')}</button>
      </div>
    </form>
  );
}
