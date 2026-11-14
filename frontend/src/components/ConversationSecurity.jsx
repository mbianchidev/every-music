import { useEffect, useState } from 'react';
import { messageVault, useMessageVault } from '../lib/message-vault.js';
import FingerprintComparison from './FingerprintComparison.jsx';

export default function ConversationSecurity({ own, peer, peerId, conversationId, onReady, onChecked }) {
  const vault = useMessageVault();
  const [trust, setTrust] = useState(null);
  const peerContext = JSON.stringify(peer);
  useEffect(() => {
    let active = true;
    onReady(false); onChecked(false); setTrust(null);
    if (peer && own) messageVault.checkPeer(peer, peerId, conversationId).then(verified => {
      if (active) { setTrust({ id: peer.id, verified }); onReady(true); }
    }).catch(failure => { if (active) setTrust({ id: peer.id, error: failure.message }); })
      .finally(() => { if (active) onChecked(true); });
    return () => { active = false; };
  }, [peerContext, own?.id, peerId, conversationId, vault.revision, onReady, onChecked]);
  if (!peer) return <p className="status-message">This musician has not set up encrypted messaging yet. They can do so from Messages; no plaintext fallback is used.</p>;
  if (!own) return null;
  return <div className="conversation-security">
    <p className="field-hint">New messages are end-to-end encrypted. {trust?.verified ? 'Fingerprint compared on this browser.' : 'The fingerprint has not been independently compared.'}</p>
    {trust?.id === peer.id && trust.error && <p className="field-error" role="alert">{trust.error}</p>}
    <FingerprintComparison own={own} peer={peer} peerId={peerId} conversationId={conversationId} />
  </div>;
}
