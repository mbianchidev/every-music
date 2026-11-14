import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { messageVault } from '../lib/message-vault.js';
import FingerprintComparison from './FingerprintComparison.jsx';
import ChatAttachment from './ChatAttachment.jsx';
import BandMessageReport from './BandMessageReport.jsx';
import { errorText } from '../lib/error-text.js';

// One band chat message: verifies the sender key against this browser's trust
// pins, decrypts with the member's own key and shows text and attachments.
export default function BandChatMessage({ message, organizationId, ownId, ownKey, ownKeyIds, keys, vault, busy, onRemove, onUnlock }) {
  const { t, formatDate } = useI18n();
  const [result, setResult] = useState(null);
  const mine = message.senderId === ownId;
  const ownKeyId = message.recipientKeyIds.find(id => ownKeyIds.includes(id));
  const sender = keys.find(key => key.id === message.senderKeyId);
  const source = JSON.stringify([message.id, message.ciphertext, ownKeyId, sender?.id, sender?.fingerprint, ownId]);
  useEffect(() => {
    if (message.isDeleted) return undefined;
    let active = true;
    const revision = vault.revision;
    const decrypt = async () => {
      if (!sender || sender.userId !== message.senderId) {
        throw Object.assign(new Error(t('bandChat.message.senderKeyMissing')), { code: 'INVALID_IDENTITY' });
      }
      if (!mine) await messageVault.checkPeer(sender, message.senderId, null);
      const { decryptGroupMessage } = await import('../lib/message-crypto.js');
      return decryptGroupMessage({ message, organizationId, ownUserId: ownId, ownKeyId, unlocked: messageVault.keys.get(ownKeyId), sender });
    };
    decrypt().then(value => { if (active) setResult({ ...value, revision, source }); }).catch(failure => {
      if (!active) return;
      if (!['KEY_LOCKED', 'NOT_A_RECIPIENT'].includes(failure.code)) console.warn('Band message unavailable', { id: message.id, code: failure.code || 'VERIFICATION_FAILED' });
      setResult({ revision, source, error: errorText(failure), code: failure.code });
    });
    return () => { active = false; };
  }, [source, message.isDeleted, vault.revision]);
  const current = result?.revision === vault.revision && result?.source === source ? result : null;
  const name = mine ? t('bandChat.message.you') : t('bandChat.message.from', { name: message.senderName });
  const quiet = ['KEY_LOCKED', 'NOT_A_RECIPIENT'].includes(current?.code);
  return (
    <article className={`message-bubble ${mine ? 'message-own' : ''}`} id={`band-message-${message.id}`} tabIndex="-1">
      <p className="message-sender">{name}</p>
      {message.isDeleted ? <p>{message.removedByModeration ? t('bandChat.message.removedByModerator') : t('bandChat.message.removed')}</p>
        : current?.error ? <>
          <p className={quiet ? 'field-hint' : 'field-error'} role={quiet ? undefined : 'alert'}>{current.error}</p>
          {current.code === 'KEY_LOCKED' && <button className="text-link" type="button" onClick={() => onUnlock(ownKeyId)}>{t('bandChat.message.unlock')}</button>}
          {current.code === 'FINGERPRINT_CHANGED' && ownKey && sender && <FingerprintComparison own={ownKey} peer={sender} peerId={message.senderId}
            conversationId={null} messageId={message.id} label={t('bandChat.message.compare', { name: message.senderName })} />}
        </> : current ? <>
          {current.body && <p>{current.body}</p>}
          {current.attachments.map(attachment => <ChatAttachment key={attachment.id} attachment={attachment} senderName={mine ? t('bandChat.members.you') : message.senderName} />)}
        </> : <p className="field-hint">{t('bandChat.message.decrypting')}</p>}
      <small><time dateTime={message.createdAt}>{formatDate(message.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></small>
      {mine && !message.isDeleted && <button className="text-link" type="button" disabled={busy} onClick={() => onRemove(message)}>{t('bandChat.message.remove')}</button>}
      {!mine && !message.isDeleted && current?.signedEvidence && <BandMessageReport organizationId={organizationId} message={message}
        senderName={message.senderName} body={current.body} signedEvidence={current.signedEvidence} />}
    </article>
  );
}
