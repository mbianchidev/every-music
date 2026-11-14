import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useDebounced, useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';

const sources = {
  band: term => `/organizations?kind=band&q=${encodeURIComponent(term)}&pageSize=10`,
  musician: term => `/profiles/search?searchTerm=${encodeURIComponent(term)}&pageSize=10`,
};
const rowsOf = (type, data) => (type === 'band' ? data?.organizations : data?.profiles) ?? [];
const optionOf = (type, item) => (type === 'band'
  ? { id: item.id, label: [item.name, item.location?.city].filter(Boolean).join(', ') }
  : { id: item.userId, label: [item.artistName || [item.firstName, item.lastName].filter(Boolean).join(' ') || item.userId, item.city].filter(Boolean).join(', ') });

// Search-as-you-type picker for bands (organizations of kind "band") or
// musicians. Calls onPick(id, label) when the user selects a match.
export default function EntityPicker({ id, type, label, onPick, exclude = [], disabled = false, actionLabel }) {
  const { t } = useI18n();
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState('');
  const debounced = useDebounced(term.trim());
  const results = useResource(debounced.length >= 2 ? sources[type](debounced) : null, { reconnect: false });
  const options = rowsOf(type, results.data).map(item => optionOf(type, item)).filter(option => !exclude.includes(option.id));
  return (
    <div className="picker">
      <FormField id={`${id}-search`} label={label} hint={t('organizations.picker.hint')}>
        <input className="input" type="search" value={term} maxLength="200" disabled={disabled} onChange={event => { setTerm(event.target.value); setSelected(''); }} />
      </FormField>
      {results.error && <p className="field-error" role="alert">{results.error}</p>}
      {debounced.length >= 2 && results.data && <FormField id={`${id}-results`} label={t('organizations.picker.matches')}>
        <select className="input" value={selected} disabled={disabled || !options.length} onChange={event => setSelected(event.target.value)}>
          <option value="">{options.length ? t('organizations.picker.choose') : t('organizations.picker.none')}</option>
          {options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </FormField>}
      {selected && <button className="btn btn-secondary" type="button" disabled={disabled} onClick={() => {
        onPick(selected, options.find(option => option.id === selected)?.label ?? selected);
        setSelected(''); setTerm('');
      }}>{actionLabel || t('organizations.picker.add')}</button>}
      <p className="sr-only" role="status">{results.loading && debounced.length >= 2 ? t('organizations.picker.searching') : ''}</p>
    </div>
  );
}
