import { useEffect, useRef, useState } from 'react';
import FormField from './FormField.jsx';
import ManagedImage from './ManagedImage.jsx';
import { useI18n } from '../lib/i18n.js';

// Previews only ever use object URLs created from the chosen file.
const blobUrl = value => (/^blob:/.test(value) ? value : '');

export default function ImageInput({ value, onChange, onFile, disabled, id = 'image-upload', label }) {
  const { t } = useI18n();
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const objectUrl = useRef('');
  const input = useRef(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const choose = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError(t('ui.image.invalid'));
      event.target.value = '';
      return;
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    setPreview(objectUrl.current);
    setError('');
    onFile(file);
  };
  const remove = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = '';
    setPreview('');
    setError('');
    if (input.current) input.current.value = '';
    onFile(null);
    onChange(null);
    input.current?.focus();
  };
  return (
    <section className="image-input">
      <FormField id={id} label={label || t('ui.image.label')} hint={t('ui.image.hint')} error={error}>
        <input ref={input} className="input" type="file" accept="image/jpeg,image/png" disabled={disabled} onChange={choose} />
      </FormField>
      {(preview || value) && (
        <div className="image-preview">
          {preview ? <img src={blobUrl(preview)} alt={t('ui.image.preview')} width="240" height="160" />
            : <ManagedImage src={value} authenticated alt={t('ui.image.preview')} width="240" height="160" />}
          <button className="text-link" type="button" onClick={remove} disabled={disabled}>{t('ui.image.remove')}</button>
        </div>
      )}
    </section>
  );
}
