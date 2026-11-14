import { useI18n } from '../lib/i18n.js';
import { LINK_TYPES } from '../lib/organizations.js';
import FormField from './FormField.jsx';

export default function LinkListEditor({ id, legend, links, onChange, maximum = 12, disabled = false }) {
  const { t } = useI18n();
  const update = (index, key, value) => onChange(links.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  return (
    <fieldset disabled={disabled}>
      <legend>{legend}</legend>
      {links.map((link, index) => <div className="experience-row" key={index}>
        <FormField id={`${id}-type-${index}`} label={t('organizations.links.type')}>
          <select className="input" value={link.linkType} onChange={event => update(index, 'linkType', event.target.value)}>
            {LINK_TYPES.map(type => <option key={type} value={type}>{t(`organizations.linkTypes.${type}`)}</option>)}
          </select>
        </FormField>
        <FormField id={`${id}-url-${index}`} label={t('organizations.links.url')}>
          <input className="input" type="url" value={link.url} maxLength="2048" onChange={event => update(index, 'url', event.target.value)} />
        </FormField>
        <button className="text-link" type="button" onClick={() => {
          onChange(links.filter((_, i) => i !== index));
          document.getElementById(`${id}-add`)?.focus();
        }}>{t('organizations.links.remove', { number: index + 1 })}</button>
      </div>)}
      <button id={`${id}-add`} className="text-link" type="button" disabled={links.length >= maximum}
        onClick={() => onChange([...links, { linkType: 'website', url: '' }])}>{t('organizations.links.add')}</button>
    </fieldset>
  );
}
