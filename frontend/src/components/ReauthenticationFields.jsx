import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import FormField from './FormField.jsx';
import { errorText } from '../lib/error-text.js';

export const emptyReauthentication = { password: '', emailCode: '', code: '' };

export function reauthenticationBody(values) {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value).map(([key, value]) => [key, value.trim()]));
}

export function reauthenticationReady(security, values, secondFactor) {
  const first = security.hasPassword ? values.password : values.emailCode.trim();
  return Boolean(first && (!secondFactor || values.code.trim()));
}

// Password (or emailed code for accounts without one) plus, when two-step
// verification is on, a second-factor or recovery code.
export default function ReauthenticationFields({ id, security, values, onChange, disabled, secondFactor = false }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const method = security.twoFactor.method;
  const update = key => event => onChange({ ...values, [key]: event.target.value });
  const send = async (path, messageKey) => {
    setBusy(true); setStatus(''); setError('');
    try {
      const result = await conduit.transmit(path, { method: 'POST', auth: true, body: {} });
      setStatus(t(messageKey, { destination: result.destinationHint }));
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <div className="stack reauth-fields">
      {security.hasPassword ? (
        <FormField id={`${id}-password`} label={t('accountSecurity.reauth.passwordLabel')} required>
          <input className="input" type="password" autoComplete="current-password" value={values.password} onChange={update('password')} disabled={disabled} />
        </FormField>
      ) : <>
        <FormField id={`${id}-email-code`} label={t('accountSecurity.reauth.emailCodeLabel')} hint={t('accountSecurity.reauth.emailCodeHint', { email: security.email })} required>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength="8" value={values.emailCode} onChange={update('emailCode')} disabled={disabled} />
        </FormField>
        <button className="btn btn-secondary" type="button" disabled={disabled || busy} onClick={() => send('/account/reauthentication-code', 'accountSecurity.reauth.emailCodeSent')}>
          {t('accountSecurity.reauth.sendEmailCode')}
        </button>
      </>}
      {secondFactor && <>
        <FormField id={`${id}-code`} label={t('accountSecurity.reauth.codeLabel')} hint={t(`accountSecurity.reauth.codeHint.${method}`)} required>
          <input className="input" autoComplete="one-time-code" spellCheck="false" maxLength="16" value={values.code} onChange={update('code')} disabled={disabled} />
        </FormField>
        {method !== 'totp' && <button className="btn btn-secondary" type="button" disabled={disabled || busy} onClick={() => send('/account/two-factor/code', 'accountSecurity.reauth.codeSent')}>
          {t('accountSecurity.reauth.sendCode')}
        </button>}
      </>}
      {status && <p className="field-hint" role="status">{status}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}
