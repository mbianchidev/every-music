import { useEffect, useState } from 'react';
import { messageVault } from '../lib/message-vault.js';
import ReportButton from './ReportButton.jsx';
import FingerprintComparison from './FingerprintComparison.jsx';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

export default function EncryptedMessage({ message, conversation, ownId, keys, vault, peerChecked, busy, onRemove, onUnlock }) {
  const { t, formatDate } = useI18n();
  const [result, setResult] = useState(null);
  const mine = message.senderId === ownId;
  const keyId = mine ? message.senderKeyId : message.recipientKeyId;
  const sender = keys.find(key => key.id === message.senderKeyId);
  const recipient = keys.find(key => key.id === message.recipientKeyId);
  const context = JSON.stringify([sender, recipient]);
  const source = JSON.stringify([message.id, message.clientId, message.senderId, message.senderKeyId,
    message.recipientKeyId, message.ciphertext, conversation.id, conversation.recipientId]);
  useEffect(() => {
    if (message.isDeleted || message.encryptionVersion !== 1 || !peerChecked) return undefined;
    let active = true;
    const revision = vault.revision;
    const decrypt = async () => {
      if (!sender || !recipient) throw new Error(t('messages.message.identityMissing'));
      if (sender.userId !== message.senderId || recipient.userId !== (mine ? conversation.recipientId : ownId)
        || (!mine && message.senderId !== conversation.recipientId)) throw new Error(t('messages.message.keysMismatch'));
      await messageVault.checkPeer(mine ? recipient : sender, conversation.recipientId, conversation.id);
      const { decryptMessage } = await import('../lib/message-crypto.js');
      return decryptMessage({ message, conversationId: conversation.id, ownUserId: ownId, unlocked: messageVault.keys.get(keyId), sender, recipient });
    };
    decrypt().then(value => {
      if (active) setResult({ ...value, revision, source, ownId });
    }).catch(failure => {
      if (!active) return;
      if (failure.code !== 'KEY_LOCKED') console.warn('Encrypted message unavailable', { id: message.id, code: failure.code || 'VERIFICATION_FAILED' });
      setResult({ revision, source, ownId, error: errorText(failure), locked: failure.code === 'KEY_LOCKED', fingerprintChanged: failure.code === 'FINGERPRINT_CHANGED' });
    });
    return () => { active = false; };
  }, [source, message.isDeleted, message.encryptionVersion, context, vault.revision, ownId, keyId, peerChecked]);
  const current = peerChecked && result?.revision === vault.revision && result?.source === source && result?.ownId === ownId ? result : null;
  const legacy = message.encryptionVersion === 0;
  const text = message.isDeleted ? message.removedByModeration ? t('messages.message.moderated') : t('messages.message.removed') : legacy ? message.body : current?.body;
  return <article className={`message-bubble ${mine ? 'message-own' : ''}`} data-message-id={message.id} id={`message-${message.id}`} tabIndex="-1">
    <span className="sr-only">{t('messages.message.author', { name: mine ? t('messages.message.you') : conversation.recipientName })}</span>
    {legacy && !message.isDeleted && <span className="legacy-label">{t('messages.message.legacy')}</span>}
    {text !== undefined ? <p>{text}</p> : current?.error ? <>
      <p className={current.locked ? 'field-hint' : 'field-error'} role={current.locked ? undefined : 'alert'}>{current.error}</p>
      {current.locked && <button className="text-link" type="button" onClick={() => onUnlock(keyId)}>{t('messages.message.unlock')}</button>}
    </> : <p className="field-hint">{t('messages.message.decrypting')}</p>}
    {!message.isDeleted && !legacy && sender && recipient && <FingerprintComparison own={mine ? sender : recipient} peer={mine ? recipient : sender}
      peerId={conversation.recipientId} conversationId={conversation.id} label={t('messages.fingerprint.compareMessage')} messageId={message.id} showButton={Boolean(current?.fingerprintChanged)} />}
    <small><time dateTime={message.createdAt}>{formatDate(message.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</time></small>
    {mine && !message.isDeleted && <button className="text-link" type="button" disabled={busy} onClick={() => onRemove(message.id)}>{t('messages.message.remove')}</button>}
    {!mine && !message.isDeleted && text !== undefined && <ReportButton userId={message.senderId} name={conversation.recipientName}
      message={{ id: message.id, body: text, signedEvidence: current?.signedEvidence }} />}
  </article>;
}
