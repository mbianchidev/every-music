import { useEffect, useState } from 'react';
import { messageVault } from '../lib/message-vault.js';
import ModalDialog from './ModalDialog.jsx';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

export default function FingerprintComparison({ own, peer, peerId, conversationId, label, showButton = true, messageId }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [compared, setCompared] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setCompared(false); }, [own?.id, peer?.id, peerId, conversationId]);
  const verify = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await messageVault.verifyPeer(peer, peerId, conversationId); setOpen(false); }
    catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  if (!own || !peer) return null;
  return <>
    {showButton && <button className="text-link" type="button" aria-haspopup="dialog" onClick={() => { setCompared(false); setError(''); setOpen(true); }}>{label || t('messages.fingerprint.compare')}</button>}
    <ModalDialog title={t('messages.fingerprint.title')} open={open} onClose={() => setOpen(false)} fallbackFocusId={messageId ? `message-${messageId}` : 'main-content'}>
      <p>{t('messages.fingerprint.intro')}</p>
      <p>{t('messages.fingerprint.yours')}</p><code className="fingerprint fingerprint-block">{own.fingerprint}</code>
      <p>{t('messages.fingerprint.theirs')}</p><code className="fingerprint fingerprint-block">{peer.fingerprint}</code>
      {error && <p className="field-error" role="alert">{error}</p>}
      <form className="form-stack" onSubmit={verify}>
        <label className="checkbox-label"><input type="checkbox" checked={compared} onChange={event => setCompared(event.target.checked)} disabled={busy} required />{t('messages.fingerprint.confirm')}</label>
        <button className="btn btn-primary" type="submit" disabled={!compared || busy}>{busy ? t('messages.fingerprint.saving') : t('messages.fingerprint.verify')}</button>
      </form>
    </ModalDialog>
  </>;
}
