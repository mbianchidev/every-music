import FormField from './FormField.jsx';
import { useI18n } from '../lib/i18n.js';

export const PROFILE_LINK_TYPES = ['spotify', 'youtube', 'soundcloud', 'bandcamp', 'instagram', 'website', 'other'];
const MAXIMUM = 20;

export default function ProfileLinksEditor({ links, onChange, disabled, shownLimit = null }) {
  const { t } = useI18n();
  const update = (index, key, value) => onChange(links.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  return (
    <fieldset className="form-stack" disabled={disabled}>
      <legend>{t('profileExtras.links.heading')}</legend>
      <p className="field-hint">{shownLimit === null ? t('profileExtras.links.hintUnlimited')
        : t('profileExtras.links.hintLimited', { count: shownLimit })}</p>
      {links.map((link, index) => <div className="experience-row" key={index}>
        <FormField id={`profile-link-type-${index}`} label={t('profileExtras.links.type', { number: index + 1 })}>
          <select className="input" value={link.linkType} onChange={event => update(index, 'linkType', event.target.value)}>
            {PROFILE_LINK_TYPES.map(type => <option key={type} value={type}>{t(`profileExtras.links.types.${type}`)}</option>)}
          </select>
        </FormField>
        <FormField id={`profile-link-url-${index}`} label={t('profileExtras.links.url', { number: index + 1 })}>
          <input className="input" type="url" inputMode="url" value={link.url} maxLength="2048" placeholder="https://"
            onChange={event => update(index, 'url', event.target.value)} />
        </FormField>
        <button className="text-link" type="button" onClick={() => {
          onChange(links.filter((_, i) => i !== index));
          document.getElementById('profile-add-link')?.focus();
        }}>{t('profileExtras.links.remove', { number: index + 1 })}</button>
      </div>)}
      <button id="profile-add-link" className="text-link" type="button" disabled={links.length >= MAXIMUM}
        onClick={() => onChange([...links, { linkType: 'spotify', url: '' }])}>{t('profileExtras.links.add')}</button>
    </fieldset>
  );
}
