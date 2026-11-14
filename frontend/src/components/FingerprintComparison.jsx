import { useEffect, useState } from 'react';
import { messageVault } from '../lib/message-vault.js';
import ModalDialog from './ModalDialog.jsx';

export default function FingerprintComparison({ own, peer, peerId, conversationId, label = 'Compare fingerprints', showButton = true, messageId }) {
  const [open, setOpen] = useState(false);
  const [compared, setCompared] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCompared(false); }, [own?.id, peer?.id, peerId, conversationId]);
  const verify = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await messageVault.verifyPeer(peer, peerId, conversationId); setOpen(false); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  if (!own || !peer) return null;
  return <>
    {showButton && <button className="text-link" type="button" aria-haspopup="dialog" onClick={() => { setCompared(false); setError(''); setOpen(true); }}>{label}</button>}
    <ModalDialog title="Compare messaging fingerprints" open={open} onClose={() => setOpen(false)} fallbackFocusId={messageId ? `message-${messageId}` : 'main-content'}>
      <p>Compare these fingerprints with the musician through another trusted channel. First-use trust cannot detect a server substituting keys before your first contact. Historical messages can use older fingerprints.</p>
      <p>Your selected fingerprint</p><code className="fingerprint fingerprint-block">{own.fingerprint}</code>
      <p>Their selected fingerprint</p><code className="fingerprint fingerprint-block">{peer.fingerprint}</code>
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={verify}>
        <label className="checkbox-label"><input type="checkbox" checked={compared} onChange={event => setCompared(event.target.checked)} disabled={busy} required />I compared these fingerprints with this musician through another channel</label>
        <button className="btn btn-primary" type="submit" disabled={!compared || busy}>{busy ? 'Saving verification...' : 'Verify fingerprint'}</button>
      </form>
    </ModalDialog>
  </>;
}
