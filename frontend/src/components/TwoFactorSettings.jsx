import { useEffect, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { saveFile } from '../lib/download.js';
import FormField from './FormField.jsx';
import QrCode from './QrCode.jsx';
import ReauthenticationFields, { emptyReauthentication, reauthenticationBody, reauthenticationReady } from './ReauthenticationFields.jsx';
import { errorText } from '../lib/error-text.js';

export default function TwoFactorSettings({ security, onChanged }) {
  const { t, formatDate } = useI18n();
  const status = security.twoFactor;
  const [step, setStep] = useState('idle');
  const [method, setMethod] = useState(security.availableMethods[0]);
  const [phone, setPhone] = useState('');
  const [proof, setProof] = useState(emptyReauthentication);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState([]);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const focusTarget = useRef(null);
  const cardHeading = useRef(null);
  const previous = useRef('idle');
  useEffect(() => {
    if (step !== 'idle') focusTarget.current?.focus();
    else if (previous.current !== 'idle') cardHeading.current?.focus();
    previous.current = step;
  }, [step]);

  const go = (next, nextMessage = '') => {
    setStep(next); setError(''); setMessage(nextMessage); setProof(emptyReauthentication); setCode('');
  };
  const run = async (operation) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); } catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  };
  const start = event => {
    event.preventDefault();
    return run(async () => {
      const result = await conduit.transmit('/account/two-factor/setup', {
        method: 'POST', auth: true, body: { method, ...(method === 'sms' ? { phoneNumber: phone } : {}), ...reauthenticationBody(proof) },
      });
      setSetup(result); go('verify');
    });
  };
  const enable = event => {
    event.preventDefault();
    return run(async () => {
      const result = await conduit.transmit('/account/two-factor/enable', { method: 'POST', auth: true, body: { code: code.trim() } });
      setCodes(result.recoveryCodes); setSaved(false); setSetup(null); go('codes', t('accountSecurity.twoStep.enabled')); onChanged();
    });
  };
  const confirmChange = (path, next) => event => {
    event.preventDefault();
    return run(async () => {
      const result = await conduit.transmit(path, { method: 'POST', auth: true, body: reauthenticationBody(proof) });
      if (next === 'codes') { setCodes(result.recoveryCodes); setSaved(false); go('codes'); }
      else go('idle', t('accountSecurity.twoStep.disabled'));
      onChanged();
    });
  };
  const copy = () => run(async () => {
    await navigator.clipboard.writeText(codes.join('\n'));
    setMessage(t('accountSecurity.twoStep.copied'));
  });
  const download = () => {
    saveFile('every-music-recovery-codes.txt', `Every.music recovery codes\n\n${codes.join('\n')}\n`, 'text/plain');
    setMessage(t('accountSecurity.twoStep.downloaded'));
  };

  const heading = (key, text) => <h4 className="heading-sm" tabIndex="-1" ref={focusTarget} key={key}>{text}</h4>;
  const cancel = <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setSetup(null); go('idle'); }}>{t('accountSecurity.twoStep.cancel')}</button>;
  return (
    <section className="card account-trust-card" aria-labelledby="two-step-settings-heading">
      <h3 id="two-step-settings-heading" tabIndex="-1" ref={cardHeading}>{t('accountSecurity.twoStep.heading')}</h3>
      {status.enabled ? <>
        <p><strong>{t('accountSecurity.twoStep.on', { method: t(`accountSecurity.twoStep.methods.${status.method}`) })}</strong>{status.phoneHint ? ` (${status.phoneHint})` : ''}</p>
        <p className="body-muted">{t('accountSecurity.twoStep.since', { date: formatDate(status.enabledAt) })} {t('accountSecurity.twoStep.remaining', { count: status.recoveryCodesRemaining })}</p>
        {status.keyChanged && <p className="error" role="alert">{t('accountSecurity.twoStep.keyChanged')}</p>}
      </> : <p>{t('accountSecurity.twoStep.off')}</p>}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}

      {step === 'idle' && <div className="compact-actions">
        {status.enabled ? <>
          <button className="btn btn-secondary" type="button" onClick={() => go('regenerate')}>{t('accountSecurity.twoStep.regenerate')}</button>
          <button className="btn btn-danger" type="button" onClick={() => go('disable')}>{t('accountSecurity.twoStep.disable')}</button>
        </> : <button className="btn btn-primary" type="button" onClick={() => go('choose')}>{t('accountSecurity.twoStep.setUp')}</button>}
      </div>}

      {step === 'choose' && <form className="form-stack" onSubmit={start}>
        {heading('choose', t('accountSecurity.twoStep.setUp'))}
        <fieldset disabled={busy}>
          <legend>{t('accountSecurity.twoStep.chooseMethod')}</legend>
          {security.availableMethods.map(option => <div className="method-choice" key={option}>
            <label className="checkbox-label"><input type="radio" name="two-step-method" value={option} checked={method === option}
              onChange={() => setMethod(option)} aria-describedby={`two-step-method-${option}-hint`} />
              {t(`accountSecurity.twoStep.choices.${option}`)}</label>
            <p className="field-hint" id={`two-step-method-${option}-hint`}>{t(`accountSecurity.twoStep.descriptions.${option}`, { email: security.email })}</p>
          </div>)}
        </fieldset>
        {method === 'sms' && <FormField id="two-step-phone" label={t('accountSecurity.twoStep.phoneLabel')} hint={t('accountSecurity.twoStep.phoneHint')} required>
          <input className="input" type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} disabled={busy} />
        </FormField>}
        <ReauthenticationFields id="two-step-setup" security={security} values={proof} onChange={setProof} disabled={busy} />
        <div className="compact-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !reauthenticationReady(security, proof, false) || (method === 'sms' && !phone.trim())}>
            {busy ? t('accountSecurity.twoStep.starting') : t('accountSecurity.twoStep.continue')}
          </button>
          {cancel}
        </div>
      </form>}

      {step === 'verify' && setup && <form className="form-stack" onSubmit={enable}>
        {setup.method === 'totp' ? <>
          {heading('scan', t('accountSecurity.twoStep.scanTitle'))}
          <QrCode value={setup.otpauthUri} label={t('accountSecurity.twoStep.qrLabel')} />
          <details>
            <summary>{t('accountSecurity.twoStep.manualKey')}</summary>
            <FormField id="two-step-setup-key" label={t('accountSecurity.twoStep.manualKeyLabel')}>
              <input className="input setup-key" readOnly value={setup.secret.replace(/(.{4})/g, '$1 ').trim()} />
            </FormField>
          </details>
        </> : heading('sent', t('accountSecurity.twoStep.codeSentTo', { destination: setup.destinationHint }))}
        <FormField id="two-step-confirm-code" label={t('accountSecurity.twoStep.confirmCode')} hint={t('accountSecurity.twoStep.confirmHint')} required>
          <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength="8" value={code} onChange={event => setCode(event.target.value)} disabled={busy} />
        </FormField>
        <div className="compact-actions">
          <button className="btn btn-primary" type="submit" disabled={busy || !code.trim()}>{busy ? t('accountSecurity.twoStep.enabling') : t('accountSecurity.twoStep.enable')}</button>
          {cancel}
        </div>
      </form>}

      {step === 'codes' && <div className="form-stack">
        {heading('codes', t('accountSecurity.twoStep.recoveryTitle'))}
        <p>{t('accountSecurity.twoStep.recoveryIntro')}</p>
        <ol className="recovery-codes" aria-label={t('accountSecurity.twoStep.recoveryList')}>{codes.map(item => <li key={item}>{item}</li>)}</ol>
        <div className="compact-actions">
          <button className="btn btn-secondary" type="button" onClick={copy} disabled={busy}>{t('accountSecurity.twoStep.copy')}</button>
          <button className="btn btn-secondary" type="button" onClick={download}>{t('accountSecurity.twoStep.download')}</button>
        </div>
        <label className="checkbox-label"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />{t('accountSecurity.twoStep.savedCheck')}</label>
        <button className="btn btn-primary" type="button" disabled={!saved} onClick={() => { setCodes([]); go('idle'); }}>{t('accountSecurity.twoStep.done')}</button>
      </div>}

      {(step === 'regenerate' || step === 'disable') && <form className="form-stack" onSubmit={confirmChange(
        step === 'regenerate' ? '/account/two-factor/recovery-codes' : '/account/two-factor/disable', step === 'regenerate' ? 'codes' : 'idle',
      )}>
        {heading(step, t(`accountSecurity.twoStep.${step}`))}
        <p>{t(step === 'regenerate' ? 'accountSecurity.twoStep.regenerateIntro' : 'accountSecurity.twoStep.disableIntro')}</p>
        <ReauthenticationFields id={`two-step-${step}`} security={security} values={proof} onChange={setProof} disabled={busy} secondFactor />
        <div className="compact-actions">
          <button className={`btn ${step === 'disable' ? 'btn-danger' : 'btn-primary'}`} type="submit" disabled={busy || !reauthenticationReady(security, proof, true)}>
            {busy ? t('accountSecurity.twoStep.working') : t(step === 'regenerate' ? 'accountSecurity.twoStep.regenerateSubmit' : 'accountSecurity.twoStep.disableSubmit')}
          </button>
          {cancel}
        </div>
      </form>}
    </section>
  );
}
