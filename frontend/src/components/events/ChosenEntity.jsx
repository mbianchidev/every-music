import { useI18n } from '../../lib/i18n.js';
import EntityPicker from '../EntityPicker.jsx';

// A single chosen page or profile with a clear button, or a picker to choose
// one. `value` is { id, label } or null.
export default function ChosenEntity({ id, type, label, value, onChange, disabled = false, actionLabel }) {
  const { t } = useI18n();
  if (value) {
    return (
      <div className="field chosen-entity">
        <span className="field-label" id={`${id}-label`}>{label}</span>
        <p className="chosen-entity-value" aria-labelledby={`${id}-label`}>
          <span>{value.label}</span>
          <button className="text-link" type="button" disabled={disabled} onClick={() => onChange(null)}>
            {t('events.search.clearSelection', { label: value.label })}
          </button>
        </p>
      </div>
    );
  }
  return <EntityPicker id={id} type={type} label={label} disabled={disabled} actionLabel={actionLabel || t('events.search.choose')}
    onPick={(pickedId, pickedLabel) => onChange({ id: pickedId, label: pickedLabel })} />;
}
