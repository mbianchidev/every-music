import { cloneElement } from 'react';

const FormField = ({
  id,
  label,
  required = false,
  hint,
  error,
  children,
}) => {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
      {cloneElement(children, {
        id,
        required,
        'aria-required': required || undefined,
        'aria-invalid': error ? 'true' : undefined,
        'aria-describedby': describedBy,
      })}
      {error && <p className="field-error" id={errorId}>{error}</p>}
    </div>
  );
};

export default FormField;
