import { useId, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n.js';
import { uploadImage } from '../../lib/media.js';
import ManagedImage from '../ManagedImage.jsx';
import { errorText } from '../../lib/error-text.js';

// Uploads chosen photos immediately (purpose "listing") and keeps an ordered
// list of managed URLs. The first photo is the cover image.
export default function ListingPhotosInput({ photos, onChange, max, disabled = false, onBusy = () => {} }) {
  const { t } = useI18n();
  const input = useRef(null);
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const choose = async event => {
    const files = [...event.target.files];
    event.target.value = '';
    if (!files.length) return;
    setError('');
    if (photos.length + files.length > max) { setError(t('marketplace.editor.photoLimit', { max })); return; }
    if (files.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setError(t('marketplace.editor.photoType')); return;
    }
    setBusy(true); onBusy(true);
    let next = photos;
    try {
      for (const file of files) {
        next = [...next, (await uploadImage(file, 'listing')).url];
        onChange(next);
      }
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); onBusy(false); }
  };
  const remove = index => {
    onChange(photos.filter((_, position) => position !== index));
    input.current?.focus();
  };
  const moveEarlier = index => {
    const next = [...photos];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };
  return (
    <fieldset className="listing-photos" disabled={disabled}>
      <legend>{t('marketplace.editor.photos')}</legend>
      <p className="field-hint" id={hintId}>{t('marketplace.editor.photosHint', { max })}</p>
      <label className="field-label" htmlFor="listing-photos-input">{t('marketplace.editor.addPhotos')}</label>
      <input ref={input} id="listing-photos-input" className="input" type="file" accept="image/jpeg,image/png" multiple
        aria-describedby={hintId} disabled={busy || photos.length >= max} onChange={choose} />
      {busy && <p role="status">{t('marketplace.editor.uploading')}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {!!photos.length && <ol className="listing-photo-list">
        {photos.map((url, index) => <li key={url}>
          <ManagedImage src={url} authenticated alt={t('marketplace.editor.photoAlt', { index: index + 1 })} width="112" height="84" />
          <div className="listing-photo-actions">
            {index > 0 && <button className="text-link" type="button" disabled={busy} onClick={() => moveEarlier(index)}>
              {t('marketplace.editor.moveEarlier', { index: index + 1 })}</button>}
            <button className="text-link" type="button" disabled={busy} onClick={() => remove(index)}>{t('marketplace.editor.removePhoto', { index: index + 1 })}</button>
          </div>
        </li>)}
      </ol>}
    </fieldset>
  );
}
