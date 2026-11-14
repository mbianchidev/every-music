import { useState } from 'react';
import { useI18n } from '../../lib/i18n.js';
import { LIMITS, LINEUP_ROLES } from '../../lib/events.js';
import FormField from '../FormField.jsx';
import EntityPicker from '../EntityPicker.jsx';

let nextKey = 0;
const key = () => `new-${nextKey += 1}`;

// Ordered lineup: entries link to a band page, an artist profile, or are a
// typed name, each with a role and optional set times.
export default function LineupEditor({ lineup, onChange, disabled = false }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const full = lineup.length >= LIMITS.lineup;
  const add = entry => onChange([...lineup, { key: key(), role: lineup.length ? 'support' : 'headliner', setStartsAt: '', setEndsAt: '', ...entry }]);
  const update = (index, changes) => onChange(lineup.map((entry, position) => (position === index ? { ...entry, ...changes } : entry)));
  const move = index => {
    const next = [...lineup];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    onChange(next);
  };
  const remove = index => {
    onChange(lineup.filter((_, position) => position !== index));
    document.getElementById('lineup-name')?.focus();
  };
  const exclude = lineup.flatMap(entry => [entry.bandId, entry.artistId]).filter(Boolean);
  return (
    <section className="form-stack lineup-editor" aria-labelledby="lineup-editor-heading">
      <h2 className="heading-md" id="lineup-editor-heading">{t('events.editor.lineup')}</h2>
      <p className="field-hint">{t('events.editor.lineupHint')}</p>
      {!!lineup.length && <ol className="lineup-editor-list">{lineup.map((entry, index) => {
        const label = entry.label || entry.name || t('events.editor.unnamed');
        return <li key={entry.key} className="card">
          <fieldset disabled={disabled}>
            <legend>{label} <span className="body-muted">({t(entry.bandId ? 'events.editor.linkedBand' : entry.artistId ? 'events.editor.linkedArtist' : 'events.editor.freeText')})</span></legend>
            <div className="form-grid">
              {!entry.bandId && !entry.artistId && <FormField id={`lineup-text-${entry.key}`} label={t('events.editor.performerName', { index: index + 1 })} required>
                <input className="input" value={entry.name} maxLength="160" onChange={changed => update(index, { name: changed.target.value, label: changed.target.value })} />
              </FormField>}
              <FormField id={`lineup-role-${entry.key}`} label={t('events.editor.role', { name: label })}>
                <select className="input" value={entry.role} onChange={changed => update(index, { role: changed.target.value })}>
                  {LINEUP_ROLES.map(role => <option key={role} value={role}>{t(`events.role.${role}`)}</option>)}
                </select>
              </FormField>
              <FormField id={`lineup-start-${entry.key}`} label={t('events.editor.setStart', { name: label })}>
                <input className="input" type="datetime-local" value={entry.setStartsAt} onChange={changed => update(index, { setStartsAt: changed.target.value })} />
              </FormField>
              <FormField id={`lineup-end-${entry.key}`} label={t('events.editor.setEnd', { name: label })}>
                <input className="input" type="datetime-local" value={entry.setEndsAt} min={entry.setStartsAt || undefined}
                  onChange={changed => update(index, { setEndsAt: changed.target.value })} />
              </FormField>
            </div>
            <div className="compact-actions">
              {index > 0 && <button className="text-link" type="button" onClick={() => move(index)}>{t('events.editor.moveUp', { name: label })}</button>}
              <button className="text-link" type="button" onClick={() => remove(index)}>{t('events.editor.remove', { name: label })}</button>
            </div>
          </fieldset>
        </li>;
      })}</ol>}
      {full ? <p className="field-hint">{t('events.editor.lineupFull', { max: LIMITS.lineup })}</p> : <div className="form-grid lineup-add">
        <EntityPicker id="lineup-band" type="band" label={t('events.editor.addBand')} exclude={exclude} disabled={disabled}
          actionLabel={t('events.editor.addBandAction')} onPick={(id, label) => add({ bandId: id, artistId: null, name: '', label })} />
        <EntityPicker id="lineup-artist" type="musician" label={t('events.editor.addArtist')} exclude={exclude} disabled={disabled}
          actionLabel={t('events.editor.addArtistAction')} onPick={(id, label) => add({ artistId: id, bandId: null, name: '', label })} />
        <div className="picker">
          <FormField id="lineup-name" label={t('events.editor.addName')} hint={t('events.editor.addNameHint')}>
            <input className="input" value={name} maxLength="160" disabled={disabled} onChange={changed => setName(changed.target.value)} />
          </FormField>
          <button className="btn btn-secondary" type="button" disabled={disabled || !name.trim()}
            onClick={() => { add({ name: name.trim(), label: name.trim(), bandId: null, artistId: null }); setName(''); }}>{t('events.editor.addNameAction')}</button>
        </div>
      </div>}
    </section>
  );
}
