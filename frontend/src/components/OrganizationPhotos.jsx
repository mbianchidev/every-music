import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { uploadImage } from '../lib/media.js';
import { useI18n } from '../lib/i18n.js';
import { PHOTO_CATEGORIES, can } from '../lib/organizations.js';
import FormField from './FormField.jsx';
import ImageInput from './ImageInput.jsx';
import ManagedImage from './ManagedImage.jsx';
import { errorText } from '../lib/error-text.js';

export default function OrganizationPhotos({ organization, onChanged }) {
  const { t } = useI18n();
  const [file, setFile] = useState(null);
  const [category, setCategory] = useState(organization.kind === 'venue' ? 'inside' : 'gallery');
  const [caption, setCaption] = useState('');
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const manage = can(organization, 'manage_profile');
  const photos = organization.photos ?? [];
  if (!manage && !photos.length) return null;
  const categories = organization.kind === 'venue' ? PHOTO_CATEGORIES : ['gallery'];
  const add = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { url } = await uploadImage(file, 'organization');
      await conduit.transmit(`/organizations/${organization.id}/photos`, { method: 'POST', auth: true, body: { url, category, caption } });
      setFile(null); setCaption(''); setInputKey(value => value + 1); setMessage(t('organizations.photos.added')); onChanged();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const remove = async photo => {
    if (!window.confirm(t('organizations.photos.confirmRemove'))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/photos/${photo.id}`, { method: 'DELETE', auth: true });
      setMessage(t('organizations.photos.removed')); onChanged();
      document.getElementById('photos-heading')?.focus();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="photos-heading">
      <h2 className="heading-md" id="photos-heading" tabIndex="-1">{t('organizations.photos.title')}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {categories.map(name => {
        const items = photos.filter(photo => photo.category === name);
        if (!items.length) return null;
        return <div key={name}>
          {categories.length > 1 && <h3>{t(`organizations.photoCategories.${name}`)}</h3>}
          <ul className="photo-grid">{items.map(photo => <li key={photo.id}>
            <figure>
              <ManagedImage src={photo.url} alt={photo.caption || t('organizations.photos.alt', { name: organization.name, category: t(`organizations.photoCategories.${name}`) })} width="240" height="160" loading="lazy" />
              {photo.caption && <figcaption>{photo.caption}</figcaption>}
            </figure>
            {manage && <button className="text-link" type="button" disabled={busy} onClick={() => remove(photo)}>{t('organizations.photos.remove', { caption: photo.caption || t(`organizations.photoCategories.${name}`) })}</button>}
          </li>)}</ul>
        </div>;
      })}
      {!photos.length && <p className="body-muted">{t('organizations.photos.empty')}</p>}
      {manage && <form className="form-stack detail-section" onSubmit={add}>
        <h3>{t('organizations.photos.addTitle')}</h3>
        <ImageInput key={inputKey} id="organization-photo" label={t('organizations.photos.file')} value={null} disabled={busy} onChange={() => {}} onFile={setFile} />
        <div className="form-grid">
          {categories.length > 1 && <FormField id="photo-category" label={t('organizations.photos.category')}>
            <select className="input" value={category} disabled={busy} onChange={event => setCategory(event.target.value)}>
              {categories.map(name => <option key={name} value={name}>{t(`organizations.photoCategories.${name}`)}</option>)}
            </select>
          </FormField>}
          <FormField id="photo-caption" label={t('organizations.photos.caption')}>
            <input className="input" value={caption} maxLength="200" disabled={busy} onChange={event => setCaption(event.target.value)} />
          </FormField>
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy || !file}>{busy ? t('organizations.common.saving') : t('organizations.photos.add')}</button>
      </form>}
    </section>
  );
}
