import { useId, useState } from 'react';
import { SUPPORTED_LOCALES, translate, useI18n } from '../lib/i18n.js';
import localePreference from '../lib/locale-preference.js';
import { errorText } from '../lib/error-text.js';

// Each option is written in its own language and marked with `lang` so screen
// readers pronounce it correctly whatever the current interface language is.
export default function LanguageSelect({ compact = false, describedBy }) {
  const { t, locale } = useI18n();
  const id = useId();
  const [status, setStatus] = useState({ message: '', error: '' });
  const change = async event => {
    const code = event.target.value;
    setStatus({ message: '', error: '' });
    try {
      await localePreference.choose(code);
      setStatus({ message: translate(code, 'common.language.saved'), error: '' });
    } catch (error) {
      console.error('The language preference could not be saved', error);
      setStatus({ message: '', error: translate(code, 'settings.language.saveFailed', { reason: errorText(error, code) }) });
    }
  };
  return (
    <div className={`language-select${compact ? ' is-compact' : ''}`}>
      <label className="field-label" htmlFor={id}>{t('common.language.label')}</label>
      <select id={id} className="input" value={locale} onChange={change} aria-describedby={describedBy}>
        {SUPPORTED_LOCALES.map(option => <option key={option.code} value={option.code} lang={option.code}>{option.label}</option>)}
      </select>
      <p className={status.error ? 'field-error' : status.message && !compact ? 'success' : 'sr-only'} role={status.error ? 'alert' : 'status'}>
        {status.error || status.message}
      </p>
    </div>
  );
}
