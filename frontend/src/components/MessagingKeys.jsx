import { useEffect, useState } from 'react';
import { useResource } from '../lib/resources.js';
import { messageVault, useMessageVault } from '../lib/message-vault.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';

export default function MessagingKeys({ neededKeyId, onCurrent }) {
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
    } catch (failure) { setError(failure.message); }
  };
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      if (!current || creating) {
        const record = await messageVault.create(recovery, creating ? current.id : undefined);
        onCurrent?.(record);
        setSelected(record.id); setCreating(false); resource.reload();
      } else await messageVault.unlock(keyId, recovery);
      setRecovery(''); setSaved(false); setMessage('Encrypted messaging is ready in this tab.');
    } catch (failure) { setError(failure.message); resource.reload(); }
    finally { setBusy(false); }
  };
  return <section className="card encryption-panel" aria-labelledby="encryption-heading">
    <h2 className="heading-md" id="encryption-heading">Encrypted messaging</h2>
    {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
    {error && <p className="field-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!resource.data && !resource.error ? <Spinner label="Loading messaging keys" /> : resource.data && <>
      {current && unlocked && !creating ? <div className="encryption-summary">
        <p className="field-hint">Keys are unlocked in this tab only. New messages are encrypted before leaving your device.</p>
        <button className="text-link" type="button" onClick={() => { messageVault.lock(); setMessage('Messaging locked. Your recovery key is needed to read encrypted history.'); }}>Lock messaging</button>
      </div> : <form className="form-stack" onSubmit={submit}>
        {(!current || creating) ? <>
          <p className="field-hint">Generate and save a recovery key in your password manager. It never goes to the server. Without it, encrypted history cannot be recovered.</p>
          {creating && <p className="status-message">Resetting creates a new identity. Other musicians must compare its fingerprint. Old history still needs your old recovery key; it is not erased.</p>}
          <button className="btn btn-secondary" type="button" onClick={generate} disabled={busy}>Generate recovery key</button>
          {recovery && <>
            <FormField id="new-messaging-recovery" label="Generated recovery key"><input className="input recovery-value" value={recovery} readOnly autoComplete="off" /></FormField>
            <label className="checkbox-label"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} required disabled={busy} />I saved this recovery key outside the app</label>
            <button className="btn btn-primary" type="submit" disabled={busy || !saved}>{busy ? 'Creating encryption keys...' : 'Enable encrypted messaging'}</button>
          </>}
        </> : <>
          <p className="field-hint">Enter your saved recovery key to unlock messages on this device. Your sign-in password cannot replace it.</p>
          <FormField id="messaging-unlock" label="Recovery key" required><input className="input" type="password" autoComplete="off" value={recovery} maxLength="100" onChange={event => setRecovery(event.target.value)} disabled={busy} /></FormField>
          <button className="btn btn-primary" type="submit" disabled={busy || !recovery.trim()}>{busy ? 'Unlocking...' : 'Unlock messages'}</button>
        </>}
      </form>}
      {current && <details className="key-management">
        <summary>Keys and recovery</summary>
        <p className="field-hint">Reloading or signing out locks keys. Keep every recovery key you still need for old history. Fingerprints identify keys, not verified real-world identities.</p>
        <FormField id="messaging-key-selection" label="Messaging key">
          <select className="input" value={keyId || ''} onChange={event => { setSelected(event.target.value); setCreating(false); setRecovery(''); setMessage(''); }}>
            {resource.data.keys.map(key => <option value={key.id} key={key.id}>{key.isCurrent ? 'Current' : 'Older'}: {key.fingerprint.slice(0, 12)} / {new Date(key.createdAt).toLocaleDateString()}</option>)}
            {keyId && !resource.data.keys.some(key => key.id === keyId) && <option value={keyId}>Older key selected from message: {keyId}</option>}
          </select>
        </FormField>
        <p className="field-hint">Current fingerprint: <code className="fingerprint">{current.fingerprint}</code></p>
        {selectedRecord && selectedRecord.id !== current.id && <p className="field-hint">Selected older fingerprint: <code className="fingerprint">{selectedRecord.fingerprint}</code></p>}
        <button className="text-link" type="button" disabled={busy} onClick={() => {
          if (!window.confirm('Create a new messaging identity? Existing messages will still require their old recovery keys, and contacts will see a changed fingerprint.')) return;
          setCreating(true); setRecovery(''); setSaved(false); setMessage('');
        }}>Reset messaging identity</button>
        {creating && <button className="text-link" type="button" disabled={busy} onClick={() => { setCreating(false); setRecovery(''); }}>Cancel key reset</button>}
      </details>}
    </>}
  </section>;
}
