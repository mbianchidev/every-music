import FormField from './FormField.jsx';
import { useI18n } from '../lib/i18n.js';

export default function CatalogSelections({
  instruments, genres, instrumentIds, genreIds, onInstruments, onGenres, disabled, experience, onExperience, hideInstruments = false,
}) {
  const { t } = useI18n();
  const choices = (title, items, ids, change) => (
    <details className="selection-panel">
      <summary>{t('ui.catalog.summary', { title, count: ids.length })}</summary>
      <fieldset disabled={disabled}>
        <legend className="sr-only">{title}</legend>
        <div className="choice-grid">
          {items.map(item => (
            <label className="checkbox-label" key={item.id}>
              <input type="checkbox" checked={ids.includes(item.id)} onChange={event => {
                change(event.target.checked ? [...ids, item.id] : ids.filter(id => id !== item.id));
              }} />
              {item.name}
            </label>
          ))}
        </div>
      </fieldset>
    </details>
  );
  return (
    <div className="form-stack">
      {!hideInstruments && choices(t('ui.catalog.instruments'), instruments, instrumentIds, onInstruments)}
      {!hideInstruments && experience && instrumentIds.map(id => (
        <fieldset className="experience-row" key={id} disabled={disabled}>
          <legend>{t('ui.catalog.experience', { instrument: instruments.find(item => item.id === id)?.name || t('ui.catalog.instrument') })}</legend>
          <FormField id={`level-${id}`} label={t('ui.catalog.skillLevel')}>
            <select className="input" value={experience[id]?.skillLevel || 'beginner'} onChange={event => onExperience(id, 'skillLevel', event.target.value)}>
              {['beginner', 'intermediate', 'advanced', 'professional'].map(level => <option key={level} value={level}>{t(`applications.skill.${level}`)}</option>)}
            </select>
          </FormField>
          <FormField id={`years-${id}`} label={t('ui.catalog.years')}>
            <input className="input" type="number" min="0" max="120" value={experience[id]?.yearsExperience ?? 0} onChange={event => onExperience(id, 'yearsExperience', Number(event.target.value))} />
          </FormField>
        </fieldset>
      ))}
      {choices(t('ui.catalog.genres'), genres, genreIds, onGenres)}
    </div>
  );
}
