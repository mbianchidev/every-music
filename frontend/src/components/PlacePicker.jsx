import { useEffect, useId, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useDebounced } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';

// Accessible combobox over the GeoNames place catalog. `value` is the chosen
// place ({ id, label }) or null; `text` is the free text shown when no place
// is chosen, so legacy city names stay visible and editable.
export default function PlacePicker({ id, label, value, text = '', onChange, onText, hint, disabled = false }) {
  const { t } = useI18n();
  const listId = useId();
  const hintId = useId();
  const statusId = useId();
  const [query, setQuery] = useState(value?.label || text);
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [error, setError] = useState('');
  const typed = useRef(false);
  const debounced = useDebounced(query, 250);

  useEffect(() => {
    if (value) setQuery(value.label);
    else if (!typed.current) setQuery(text);
  }, [value?.id, value?.label]);

  useEffect(() => {
    if (!typed.current || value || debounced.trim().length < 2) { setOptions([]); return undefined; }
    const controller = new AbortController();
    conduit.transmit(`/catalog/places?q=${encodeURIComponent(debounced.trim())}&limit=8`, { signal: controller.signal })
      .then(data => {
        if (controller.signal.aborted) return;
        setOptions(data.places); setActive(-1); setOpen(true); setError('');
      })
      .catch(failure => {
        if (controller.signal.aborted) return;
        console.warn('City suggestions failed', failure);
        setOptions([]); setOpen(false); setError(t('places.picker.failed'));
      });
    return () => controller.abort();
  }, [debounced, value]);

  const choose = place => {
    typed.current = false;
    setQuery(place.label); setOptions([]); setOpen(false); setActive(-1);
    onChange(place);
  };
  const clear = () => {
    typed.current = false;
    setQuery(''); setOptions([]); setOpen(false);
    onChange(null); onText?.('');
    document.getElementById(id)?.focus();
  };
  const keyDown = event => {
    if (event.key === 'ArrowDown' && options.length) {
      event.preventDefault(); setOpen(true); setActive(index => (index + 1) % options.length);
    } else if (event.key === 'ArrowUp' && options.length) {
      event.preventDefault(); setOpen(true); setActive(index => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === 'Enter' && open && active >= 0) {
      event.preventDefault(); choose(options[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); setActive(-1);
    }
  };
  const expanded = open && options.length > 0;
  return (
    <div className="field place-picker">
      <label className="field-label" htmlFor={id}>{label}</label>
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
      <div className="place-picker-control">
        <input className="input" id={id} type="text" role="combobox" autoComplete="off" maxLength="100" disabled={disabled}
          aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
          aria-activedescendant={expanded && active >= 0 ? `${listId}-${active}` : undefined}
          aria-describedby={hint ? hintId : undefined}
          value={query} onKeyDown={keyDown} onBlur={() => setOpen(false)}
          onFocus={() => { if (options.length) setOpen(true); }}
          onChange={event => {
            typed.current = true;
            setQuery(event.target.value);
            if (value) onChange(null);
            onText?.(event.target.value);
          }} />
        <ul className="place-options" id={listId} role="listbox" aria-label={t('places.picker.suggestions', { label })} hidden={!expanded}>
          {options.map((place, index) => (
            <li key={place.id} id={`${listId}-${index}`} role="option" aria-selected={index === active}
              onMouseDown={event => event.preventDefault()} onClick={() => choose(place)}>
              {place.name}<span className="place-meta">{[place.region, place.country].filter(Boolean).join(', ')}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="sr-only" id={statusId} role="status">
        {value ? t('places.picker.selected', { place: value.label })
          : expanded ? t('places.picker.count', { count: options.length }) : ''}
      </p>
      {error && <p className="field-error">{error}</p>}
      {(value || query) && !disabled && <button className="text-link" type="button" onClick={clear}>{t('places.picker.clear', { label })}</button>}
    </div>
  );
}
