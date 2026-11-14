import { useEffect, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { finishSignIn } from '../lib/sign-in.js';
import { useI18n } from '../lib/i18n.js';
import FormField from './FormField.jsx';

export default function TwoStepSignIn({ challenge, onCancel }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState(challenge);
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const heading = useRef(null);
  const input = useRef(null);
  const [refocus, setRefocus] = useState(0);
  useEffect(() => { heading.current?.focus(); }, []);
  useEffect(() => { if (refocus) input.current?.focus(); }, [refocus]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const response = await conduit.transmit('/auth/two-factor/verify', {
        method: 'POST', body: { challengeToken: challenge.challengeToken, code: code.trim() },
      });
      finishSignIn(response);
    } catch (failure) {
      setError(failure.message);
      setBusy(false);
      setRefocus(value => value + 1);
    }
  };
  const resend = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await conduit.transmit('/auth/two-factor/resend', { method: 'POST', body: { challengeToken: challenge.challengeToken } });
      setCurrent(previous => ({ ...previous, ...result }));
      setMessage(result.codeSent ? t('twoStep.resent') : '');
      if (!result.codeSent) setError(t('twoStep.notSent'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const toggle = () => { setRecovery(value => !value); setCode(''); setError(''); setRefocus(value => value + 1); };

  return (
    <section className="two-step" aria-labelledby="two-step-heading">
      <h2 className="heading-md" id="two-step-heading" tabIndex="-1" ref={heading}>{t('twoStep.title')}</h2>
      <p>{t(`twoStep.intro.${current.method}`, { destination: current.destinationHint || '' })}</p>
      {current.codeSent === false && !error && <p className="status-message" role="status">{t('twoStep.notSent')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      <form className="form-stack" onSubmit={submit} noValidate>
        <FormField id="two-step-code" label={recovery ? t('twoStep.recoveryLabel') : t('twoStep.codeLabel')}
          hint={recovery ? t('twoStep.recoveryHint') : t('twoStep.codeHint')} required>
          <input ref={input} className="input" value={code} onChange={event => setCode(event.target.value)} disabled={busy}
            autoComplete="one-time-code" inputMode={recovery ? 'text' : 'numeric'} autoCapitalize={recovery ? 'characters' : 'off'}
            spellCheck="false" maxLength={recovery ? 16 : 8} />
        </FormField>
        <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>{busy ? t('twoStep.submitting') : t('twoStep.submit')}</button>
        <div className="compact-actions">
          <button className="text-link" type="button" onClick={toggle} disabled={busy}>{recovery ? t('twoStep.useCode') : t('twoStep.useRecovery')}</button>
          {current.method !== 'totp' && <button className="text-link" type="button" onClick={resend} disabled={busy}>{t('twoStep.resend')}</button>}
          <button className="text-link" type="button" onClick={onCancel} disabled={busy}>{t('twoStep.cancel')}</button>
        </div>
      </form>
    </section>
  );
}
