import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { openAttachment } from '../lib/band-chat.js';
import { ATTACHMENT_TYPES } from '../lib/attachment-types.js';
import { errorText } from '../lib/error-text.js';

// Downloads, verifies and decrypts one attachment on this device. Pictures
// open automatically; audio waits for an explicit request.
export default function ChatAttachment({ attachment, senderName }) {
  const { t, formatNumber } = useI18n();
  const kind = ATTACHMENT_TYPES[attachment.type];
  const [state, setState] = useState({ url: null, loading: false, error: '' });
  const load = async () => {
    setState({ url: null, loading: true, error: '' });
    try {
      const blob = await openAttachment(attachment);
      setState({ url: URL.createObjectURL(blob), loading: false, error: '' });
    } catch (failure) {
      console.warn('Band chat attachment unavailable', { id: attachment.id, code: failure.code });
      setState({ url: null, loading: false, error: `${t('bandChat.attachment.failed')} ${errorText(failure)}` });
    }
  };
  useEffect(() => { if (kind === 'image') void load(); }, [attachment.id]);
  useEffect(() => () => { if (state.url) URL.revokeObjectURL(state.url); }, [state.url]);
  const label = t(`bandChat.attachment.${kind}`, { name: senderName, file: attachment.name });
  const size = t('bandChat.attachment.size', { size: formatNumber(Math.max(1, Math.round(attachment.size / 1024))) });
  return (
    <figure className="chat-attachment">
      {state.url
        ? kind === 'image' ? <img src={state.url} alt={label} /> : <audio controls src={state.url} aria-label={label} />
        : state.loading ? <p className="field-hint" role="status">{t('bandChat.attachment.loading', { file: attachment.name })}</p>
          : kind === 'audio' && !state.error && <button className="btn btn-secondary" type="button" onClick={load}>{t('bandChat.attachment.load', { file: attachment.name })}</button>}
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      <figcaption>
        {state.url ? <a href={state.url} download={attachment.name}>{t('bandChat.attachment.download', { file: attachment.name })}</a> : attachment.name}
        {' '}<span className="body-muted">({size})</span>
        {state.error && <button className="text-link" type="button" onClick={load}>{t('common.actions.retry')}</button>}
      </figcaption>
    </figure>
  );
}
