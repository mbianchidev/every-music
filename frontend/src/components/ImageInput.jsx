import { useEffect, useRef, useState } from 'react';
import FormField from './FormField.jsx';
import ManagedImage from './ManagedImage.jsx';

export default function ImageInput({ value, onChange, onFile, disabled, id = 'image-upload', label = 'Image' }) {
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const objectUrl = useRef('');
  const input = useRef(null);
  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);
  const choose = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError('Choose a JPEG or PNG image up to 2 MiB.');
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
      <FormField id={id} label={label} hint="JPEG or PNG, up to 2 MiB and 16 megapixels. Metadata is removed; images are resized for the web." error={error}>
        <input ref={input} className="input" type="file" accept="image/jpeg,image/png" disabled={disabled} onChange={choose} />
      </FormField>
      {(preview || value) && (
        <div className="image-preview">
          {preview ? <img src={preview} alt="Selected image preview" width="240" height="160" />
            : <ManagedImage src={value} authenticated alt="Selected image preview" width="240" height="160" />}
          <button className="text-link" type="button" onClick={remove} disabled={disabled}>Remove image</button>
        </div>
      )}
    </section>
  );
}
