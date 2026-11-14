import FormField from './FormField.jsx';

export default function CatalogSelections({
  instruments, genres, instrumentIds, genreIds, onInstruments, onGenres, disabled, experience, onExperience,
}) {
  const choices = (title, items, ids, change) => (
    <details className="selection-panel">
      <summary>{title} ({ids.length} selected)</summary>
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
      {choices('Instruments', instruments, instrumentIds, onInstruments)}
      {experience && instrumentIds.map(id => (
        <fieldset className="experience-row" key={id} disabled={disabled}>
          <legend>{instruments.find(item => item.id === id)?.name || 'Instrument'} experience</legend>
          <FormField id={`level-${id}`} label="Skill level">
            <select className="input" value={experience[id]?.skillLevel || 'beginner'} onChange={event => onExperience(id, 'skillLevel', event.target.value)}>
              {['beginner', 'intermediate', 'advanced', 'professional'].map(level => <option key={level} value={level}>{level}</option>)}
            </select>
          </FormField>
          <FormField id={`years-${id}`} label="Years of experience">
            <input className="input" type="number" min="0" max="120" value={experience[id]?.yearsExperience ?? 0} onChange={event => onExperience(id, 'yearsExperience', Number(event.target.value))} />
          </FormField>
        </fieldset>
      ))}
      {choices('Genres', genres, genreIds, onGenres)}
    </div>
  );
}
