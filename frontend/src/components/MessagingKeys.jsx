import { useEffect, useState } from 'react';
import { useResource } from '../lib/resources.js';
import { messageVault, useMessageVault } from '../lib/message-vault.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

export default function MessagingKeys({ neededKeyId, onCurrent }) {
  const { t, formatDate } = useI18n();
  const resource = useResource('/encryption/me?pageSize=20', { events: 'keys.changed' });
  const vault = useMessageVault();
  const current = resource.data?.keys.find(key => key.isCurrent);
  const [selected, setSelected] = useState('');
  const [recovery, setRecovery] = useState('');
  const [saved, setSaved] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { onCurrent?.(current || null); }, [current?.id, current?.fingerprint, onCurrent]);
  useEffect(() => {
    if (neededKeyId) { setSelected(neededKeyId); setCreating(false); setRecovery(''); }
  }, [neededKeyId]);
  const keyId = selected || current?.id;
  const selectedRecord = resource.data?.keys.find(key => key.id === keyId) || messageVault.keys.get(keyId)?.record;
  const unlocked = Boolean(keyId && vault.unlockedIds.includes(keyId));
  const generate = async () => {
    setError(''); setMessage('');
    try {
      const { generateRecoveryKey } = await import('../lib/message-crypto.js');
      setRecovery(generateRecoveryKey()); setSaved(false);
    } catch (failure) { setError(errorText(failure)); }
  };
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (!current || creating) {
        const record = await messageVault.create(recovery, creating ? current.id : undefined);
        onCurrent?.(record);
        setSelected(record.id); setCreating(false); resource.reload();
      } else await messageVault.unlock(keyId, recovery);
      setRecovery(''); setSaved(false); setMessage(t('messages.keys.ready'));
    } catch (failure) { setError(errorText(failure)); resource.reload(); }
    finally { setBusy(false); }
  };
  return <section className="card encryption-panel" aria-labelledby="encryption-heading">
    <h2 className="heading-md" id="encryption-heading">{t('messages.keys.heading')}</h2>
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {error && <p className="field-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!resource.data && !resource.error ? <Spinner label={t('messages.keys.loading')} /> : resource.data && <>
      {current && unlocked && !creating ? <div className="encryption-summary">
        <p className="field-hint">{t('messages.keys.unlockedHint')}</p>
        <button className="text-link" type="button" onClick={() => { messageVault.lock(); setMessage(t('messages.keys.locked')); }}>{t('messages.keys.lock')}</button>
      </div> : <form className="form-stack" onSubmit={submit}>
        {(!current || creating) ? <>
          <p className="field-hint">{t('messages.keys.generateHint')}</p>
          {creating && <p className="status-message">{t('messages.keys.resetNotice')}</p>}
          <button className="btn btn-secondary" type="button" onClick={generate} disabled={busy}>{t('messages.keys.generate')}</button>
          {recovery && <>
            <FormField id="new-messaging-recovery" label={t('messages.keys.generated')}><input className="input recovery-value" value={recovery} readOnly autoComplete="off" /></FormField>
            <label className="checkbox-label"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} required disabled={busy} />{t('messages.keys.savedConfirm')}</label>
            <button className="btn btn-primary" type="submit" disabled={busy || !saved}>{busy ? t('messages.keys.creating') : t('messages.keys.enable')}</button>
          </>}
        </> : <>
          <p className="field-hint">{t('messages.keys.unlockHint')}</p>
          <FormField id="messaging-unlock" label={t('messages.keys.recovery')} required><input className="input" type="password" autoComplete="off" value={recovery} maxLength="100" onChange={event => setRecovery(event.target.value)} disabled={busy} /></FormField>
          <button className="btn btn-primary" type="submit" disabled={busy || !recovery.trim()}>{busy ? t('messages.keys.unlocking') : t('messages.keys.unlock')}</button>
        </>}
      </form>}
      {current && <details className="key-management">
        <summary>{t('messages.keys.management')}</summary>
        <p className="field-hint">{t('messages.keys.managementHint')}</p>
        <FormField id="messaging-key-selection" label={t('messages.keys.key')}>
          <select className="input" value={keyId || ''} onChange={event => { setSelected(event.target.value); setCreating(false); setRecovery(''); setMessage(''); }}>
            {resource.data.keys.map(key => <option value={key.id} key={key.id}>{t(key.isCurrent ? 'messages.keys.currentOption' : 'messages.keys.olderOption', {
              fingerprint: key.fingerprint.slice(0, 12), date: formatDate(key.createdAt),
            })}</option>)}
            {keyId && !resource.data.keys.some(key => key.id === keyId) && <option value={keyId}>{t('messages.keys.fromMessage', { id: keyId })}</option>}
          </select>
        </FormField>
        <p className="field-hint">{t('messages.keys.currentFingerprint')} <code className="fingerprint">{current.fingerprint}</code></p>
        {selectedRecord && selectedRecord.id !== current.id && <p className="field-hint">{t('messages.keys.olderFingerprint')} <code className="fingerprint">{selectedRecord.fingerprint}</code></p>}
        <button className="text-link" type="button" disabled={busy} onClick={() => {
          if (!window.confirm(t('messages.keys.confirmReset'))) return;
          setCreating(true); setRecovery(''); setSaved(false); setMessage('');
        }}>{t('messages.keys.reset')}</button>
        {creating && <button className="text-link" type="button" disabled={busy} onClick={() => { setCreating(false); setRecovery(''); }}>{t('messages.keys.cancelReset')}</button>}
      </details>}
    </>}
  </section>;
}
