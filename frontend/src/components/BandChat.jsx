import { useEffect, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { messageVault, useMessageVault } from '../lib/message-vault.js';
import { DEFAULT_ATTACHMENT_LIMIT, ENCRYPTION_OVERHEAD, attachmentFits, attachmentTypeOf, uploadAttachment } from '../lib/band-chat.js';
import { ATTACHMENT_TYPES, MAX_ATTACHMENTS } from '../lib/attachment-types.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import Pagination from './Pagination.jsx';
import Avatar from './Avatar.jsx';
import MessagingKeys from './MessagingKeys.jsx';
import FingerprintComparison from './FingerprintComparison.jsx';
import BandChatMessage from './BandChatMessage.jsx';
import { errorText } from '../lib/error-text.js';

const RECIPIENT_CHANGES = ['BAND_CHAT_RECIPIENTS_CHANGED', 'MESSAGING_KEYS_CHANGED', 'BAND_CHAT_NO_RECIPIENTS'];
const megabytes = bytes => Math.round(((bytes - ENCRYPTION_OVERHEAD) / 1048576) * 10) / 10;

export default function BandChat({ organization, focus = false }) {
  const { t } = useI18n();
  const ownId = nucleus.payload.persona?.userId;
  const [page, setPage] = useState(1);
  const chat = useResource(`/organizations/${organization.id}/chat?page=${page}&pageSize=25`, {
    events: 'band-chat.changed,keys.changed,organizations.changed,account.changed',
  });
  const ownKeys = useResource('/encryption/me?pageSize=20', { events: 'keys.changed' });
  const vault = useMessageVault();
  const [currentKey, setCurrentKey] = useState(null);
  const [neededKeyId, setNeededKeyId] = useState('');
  const [trust, setTrust] = useState({});
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);
  const uploads = useRef(new Map());
  const data = chat.data?.chat.organizationId === organization.id ? chat.data : null;
  const members = data?.chat.members ?? [];
  const recipients = members.filter(member => member.key);
  const others = recipients.filter(member => member.userId !== ownId);
  const ownMember = members.find(member => member.userId === ownId);
  const unlocked = Boolean(currentKey && vault.unlockedIds.includes(currentKey.id));
  const limit = data?.chat.limits.attachmentBytes ?? DEFAULT_ATTACHMENT_LIMIT;
  const memberContext = JSON.stringify(others.map(member => [member.userId, member.key.id, member.key.fingerprint]));
  const ownKeyIds = ownKeys.data?.keys.map(key => key.id) ?? [];

  useEffect(() => {
    if (focus) document.getElementById('band-chat-heading')?.scrollIntoView({ block: 'start' });
  }, [focus]);
  useEffect(() => {
    let active = true;
    if (!currentKey) { setTrust({}); return undefined; }
    Promise.all(others.map(async member => {
      try { return [member.userId, { keyId: member.key.id, verified: await messageVault.checkPeer(member.key, member.userId, null) }]; }
      catch (failure) { return [member.userId, { keyId: member.key.id, error: errorText(failure), code: failure.code }]; }
    })).then(entries => { if (active) setTrust(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [memberContext, currentKey?.id, vault.revision]);
  const trusted = others.every(member => trust[member.userId]?.keyId === member.key.id && !trust[member.userId].error);
  const ready = unlocked && ownMember?.key?.id === currentKey?.id && others.length > 0 && trusted;
  const blocker = !currentKey ? t('bandChat.composer.noKey') : !unlocked ? t('bandChat.composer.locked')
    : !others.length ? t('bandChat.composer.noRecipients') : !trusted ? t('bandChat.composer.blocked') : '';

  const newest = data?.messages[0]?.id;
  useEffect(() => {
    if (!data || page !== 1 || !data.chat.unreadCount) return undefined;
    const markRead = () => {
      if (document.visibilityState !== 'visible') return;
      conduit.transmit(`/organizations/${organization.id}/chat`, { method: 'PATCH', auth: true, body: { read: true } })
        .catch(failure => setError(errorText(failure)));
    };
    markRead();
    document.addEventListener('visibilitychange', markRead);
    return () => document.removeEventListener('visibilitychange', markRead);
  }, [organization.id, newest, page, data?.chat.unreadCount]);

  const pick = event => {
    const chosen = [...event.target.files];
    event.target.value = '';
    setError('');
    const problems = [];
    const accepted = [];
    for (const file of chosen) {
      const type = attachmentTypeOf(file, ATTACHMENT_TYPES);
      if (!type) problems.push(t('bandChat.composer.unsupported', { file: file.name }));
      else if (!attachmentFits(file, limit)) problems.push(t('bandChat.composer.tooLarge', { file: file.name, size: megabytes(limit) }));
      else accepted.push({ local: crypto.randomUUID(), file, type });
    }
    if (files.length + accepted.length > MAX_ATTACHMENTS) problems.push(t('bandChat.composer.tooMany', { count: MAX_ATTACHMENTS }));
    setFiles([...files, ...accepted].slice(0, MAX_ATTACHMENTS));
    if (problems.length) setError(problems.join(' '));
  };

  const send = async event => {
    event.preventDefault();
    if (!body.trim() && !files.length) return;
    setBusy(true); setError('');
    try {
      if (!ready) throw new Error(blocker || t('bandChat.composer.blocked'));
      for (const member of others) await messageVault.checkPeer(member.key, member.userId, null);
      const keys = recipients.map(member => member.key);
      const signature = JSON.stringify([body.trim(), files.map(item => item.local), keys.map(key => key.id), currentKey.id]);
      if (pending.current?.signature !== signature) {
        const attachments = [];
        for (const item of files) {
          if (!uploads.current.has(item.local)) uploads.current.set(item.local, await uploadAttachment(item.file, item.type));
          attachments.push(uploads.current.get(item.local));
        }
        const { encryptGroupMessage } = await import('../lib/message-crypto.js');
        const request = await encryptGroupMessage({
          body, organizationId: organization.id, clientId: crypto.randomUUID(), sender: currentKey, recipients: keys,
          unlocked: messageVault.keys.get(currentKey.id), attachments,
        });
        messageVault.ensure(ownId);
        pending.current = { signature, request };
      }
      await conduit.transmit(`/organizations/${organization.id}/chat/messages`, { method: 'POST', auth: true, body: pending.current.request });
      messageVault.ensure(ownId);
      setBody(''); setFiles([]); pending.current = null; uploads.current.clear(); setPage(1); chat.reload();
      document.getElementById('band-chat-body')?.focus();
    } catch (failure) {
      if (RECIPIENT_CHANGES.includes(failure.code)) {
        pending.current = null;
        setError(failure.code === 'BAND_CHAT_NO_RECIPIENTS' ? t('bandChat.composer.noRecipients') : t('bandChat.composer.changed'));
        chat.reload();
      } else setError(errorText(failure));
    } finally { setBusy(false); }
  };

  const remove = async message => {
    if (!window.confirm(t('bandChat.message.removeConfirm'))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/organizations/${organization.id}/chat/messages/${message.id}`, { method: 'DELETE', auth: true });
      document.getElementById('band-chat-heading')?.focus(); chat.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };

  const memberStatus = member => {
    if (!member.canReceive) return t('bandChat.members.noKey');
    if (member.userId === ownId) return t('bandChat.members.ready');
    const state = trust[member.userId];
    if (state?.error) return t('bandChat.members.problem', { error: state.error });
    return state?.verified ? t('bandChat.members.verified') : t('bandChat.members.unverified');
  };

  return (
    <section className="detail-section band-chat" aria-labelledby="band-chat-heading">
      <h2 className="heading-md" id="band-chat-heading" tabIndex="-1">{t('bandChat.title')}</h2>
      <p className="body-muted">{t('bandChat.intro')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <MessagingKeys neededKeyId={neededKeyId} onCurrent={setCurrentKey} />
      {chat.error && <ErrorState message={chat.error} onRetry={chat.reload} />}
      {ownKeys.error && <ErrorState message={ownKeys.error} onRetry={ownKeys.reload} />}
      {(!data || !ownKeys.data) && !chat.error && !ownKeys.error ? <Spinner label={t('bandChat.loading')} /> : data && ownKeys.data && <>
        {data.chat.unreadCount > 0 && <p className="status-message" role="status">{t('bandChat.unread', { count: data.chat.unreadCount })}</p>}
        <details className="band-chat-members-panel">
          <summary>{t('bandChat.members.title')}</summary>
          <ul className="member-list">{members.map(member => (
            <li className="member-row" key={member.userId}>
              <Avatar name={member.name} src={member.pictureUrl} />
              <div>
                <a href={`#musician?id=${member.userId}`}>{member.name}</a>{member.userId === ownId && ` (${t('bandChat.members.you')})`}
                <p className={trust[member.userId]?.error ? 'field-error' : 'body-muted'}>{memberStatus(member)}</p>
              </div>
              {member.key && member.userId !== ownId && currentKey && <FingerprintComparison own={currentKey} peer={member.key} peerId={member.userId}
                conversationId={null} label={t('bandChat.members.compare', { name: member.name })} />}
            </li>
          ))}</ul>
        </details>
        <p className="field-hint">{t('bandChat.newest')}</p>
        <div className="message-log band-chat-log" role="log" aria-label={t('bandChat.log')} aria-live="polite" aria-relevant="additions text" tabIndex="0">
          {!data.messages.length && <p className="body-muted">{t('bandChat.empty')}</p>}
          {[...data.messages].reverse().map(message => <BandChatMessage key={message.id} message={message} organizationId={organization.id}
            ownId={ownId} ownKey={currentKey} ownKeyIds={ownKeyIds} keys={data.keys} vault={vault} busy={busy} onRemove={remove}
            onUnlock={keyId => { setNeededKeyId(keyId); document.getElementById('encryption-heading')?.scrollIntoView({ block: 'center' }); }} />)}
        </div>
        <Pagination pagination={data.pagination} onPage={setPage} disabled={chat.loading} label={t('bandChat.pages')} />
        <form className="form-stack message-composer" onSubmit={send}>
          {blocker && <p className="status-message">{blocker}</p>}
          <FormField id="band-chat-body" label={t('bandChat.composer.label')} hint={t('bandChat.composer.hint')}>
            <textarea className="input" value={body} maxLength="4000" disabled={busy || !ready} onChange={event => setBody(event.target.value)} />
          </FormField>
          <FormField id="band-chat-files" label={t('bandChat.composer.files')}
            hint={t('bandChat.composer.filesHint', { count: MAX_ATTACHMENTS, size: megabytes(limit) })}>
            <input className="input" type="file" multiple accept={`${Object.keys(ATTACHMENT_TYPES).join(',')},.mp3,.m4a,.wav,.ogg,.flac,.aac,.webm`}
              disabled={busy || !ready || files.length >= MAX_ATTACHMENTS} onChange={pick} />
          </FormField>
          {files.length > 0 && <ul className="inline-list" aria-label={t('bandChat.composer.selected')}>
            {files.map(item => <li className="tag" key={item.local}>{item.file.name}
              <button className="text-link" type="button" disabled={busy} onClick={() => setFiles(files.filter(file => file.local !== item.local))}>
                {t('bandChat.composer.removeFile', { file: item.file.name })}
              </button>
            </li>)}
          </ul>}
          <button className="btn btn-primary" type="submit" disabled={busy || !ready || (!body.trim() && !files.length)}>
            {busy ? t('bandChat.composer.sending') : t('bandChat.composer.send')}
          </button>
        </form>
      </>}
    </section>
  );
}
