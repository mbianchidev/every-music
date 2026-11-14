import { useEffect, useState } from 'react';
import { messageVault, useMessageVault } from '../lib/message-vault.js';
import FingerprintComparison from './FingerprintComparison.jsx';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

export default function ConversationSecurity({ own, peer, peerId, conversationId, onReady, onChecked }) {
  const { t } = useI18n();
  const vault = useMessageVault();
  const [trust, setTrust] = useState(null);
  const peerContext = JSON.stringify(peer);
  useEffect(() => {
    let active = true;
    onReady(false); onChecked(false); setTrust(null);
    if (peer && own) messageVault.checkPeer(peer, peerId, conversationId).then(verified => {
      if (active) { setTrust({ id: peer.id, verified }); onReady(true); }
    }).catch(failure => { if (active) setTrust({ id: peer.id, error: errorText(failure) }); })
      .finally(() => { if (active) onChecked(true); });
    return () => { active = false; };
  }, [peerContext, own?.id, peerId, conversationId, vault.revision, onReady, onChecked]);
  if (!peer) return <p className="status-message">{t('messages.security.noPeer')}</p>;
  if (!own) return null;
  return <div className="conversation-security">
    <p className="field-hint">{t('messages.security.encrypted')} {trust?.verified ? t('messages.security.compared') : t('messages.security.notCompared')}</p>
    {trust?.id === peer.id && trust.error && <p className="field-error" role="alert">{trust.error}</p>}
    <FingerprintComparison own={own} peer={peer} peerId={peerId} conversationId={conversationId} />
  </div>;
}
