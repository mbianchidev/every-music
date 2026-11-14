import { useId, useRef, useState } from 'react';
import { useI18n } from '../../lib/i18n.js';
import { uploadImage } from '../../lib/media.js';
import { LIMITS } from '../../lib/events.js';
import ManagedImage from '../ManagedImage.jsx';
import { errorText } from '../../lib/error-text.js';

// Uploads chosen images immediately (purpose "event"); the first is the cover.
export default function EventImagesInput({ images, onChange, disabled = false, onBusy = () => {} }) {
  const { t } = useI18n();
  const input = useRef(null);
  const hintId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const max = LIMITS.images;
  const choose = async changed => {
    const files = [...changed.target.files];
    changed.target.value = '';
    if (!files.length) return;
    setError('');
    if (images.length + files.length > max) { setError(t('events.editor.imageLimit', { max })); return; }
    if (files.some(file => !['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setError(t('events.editor.imageType')); return;
    }
    setBusy(true); onBusy(true);
    let next = images;
    try {
      for (const file of files) {
        next = [...next, (await uploadImage(file, 'event')).url];
        onChange(next);
      }
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); onBusy(false); }
  };
  const move = index => {
    const next = [...images];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };
  return (
    <fieldset className="listing-photos" disabled={disabled}>
      <legend>{t('events.editor.images')}</legend>
      <p className="field-hint" id={hintId}>{t('events.editor.imagesHint', { max })}</p>
      <label className="field-label" htmlFor="event-images-input">{t('events.editor.addImages')}</label>
      <input ref={input} id="event-images-input" className="input" type="file" accept="image/jpeg,image/png" multiple
        aria-describedby={hintId} disabled={busy || images.length >= max} onChange={choose} />
      {busy && <p role="status">{t('events.editor.uploading')}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {!!images.length && <ol className="listing-photo-list">
        {images.map((url, index) => <li key={url}>
          <ManagedImage src={url} authenticated alt={t('events.editor.imageAlt', { index: index + 1 })} width="112" height="84" />
          <div className="listing-photo-actions">
            {index > 0 && <button className="text-link" type="button" disabled={busy} onClick={() => move(index)}>
              {t('events.editor.moveEarlier', { index: index + 1 })}</button>}
            <button className="text-link" type="button" disabled={busy} onClick={() => { onChange(images.filter((_, position) => position !== index)); input.current?.focus(); }}>
              {t('events.editor.removeImage', { index: index + 1 })}</button>
          </div>
        </li>)}
      </ol>}
    </fieldset>
  );
}
