import { useEffect, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import FormField from '../components/FormField.jsx';
import Pagination from '../components/Pagination.jsx';
import MessagingKeys from '../components/MessagingKeys.jsx';
import ConversationSecurity from '../components/ConversationSecurity.jsx';
import EncryptedMessage from '../components/EncryptedMessage.jsx';
import ReportButton from '../components/ReportButton.jsx';
import { messageVault, useMessageVault } from '../lib/message-vault.js';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

export default function MessagesScreen({ route }) {
  const id = route.query.get('id');
  const { t } = useI18n();
  const [archived, setArchived] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [messagePage, setMessagePage] = useState(1);
  const list = useResource(`/conversations?page=${listPage}&pageSize=12&archived=${archived}`, { events: 'messages.changed,conversations.changed' });
  const thread = useResource(id ? `/conversations/${id}/messages?page=${messagePage}&pageSize=25&format=encrypted-v1` : null, { events: 'messages.changed,keys.changed,account.changed' });
  const vault = useMessageVault();
  const [currentKey, setCurrentKey] = useState(null);
  const [neededKeyId, setNeededKeyId] = useState('');
  const [peerReady, setPeerReady] = useState(false);
  const [peerChecked, setPeerChecked] = useState(false);
  const [body, setBody] = useState(() => route.query.get('draft')?.slice(0, 4000) || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(null);
  const log = useRef(null);
  const ownId = nucleus.payload.persona?.userId;
  const newest = thread.data?.messages[0]?.id;
  const conversation = thread.data?.conversation?.id === id?.toLowerCase() ? thread.data?.conversation : null;
  const unlocked = Boolean(currentKey && vault.unlockedIds.includes(currentKey.id));
  const readable = thread.data?.messages.every(message => message.isDeleted || message.encryptionVersion === 0
    || vault.unlockedIds.includes(message.senderId === ownId ? message.senderKeyId : message.recipientKeyId));
  useEffect(() => {
    if (!id || !conversation || !thread.data || !readable || messagePage !== 1) return undefined;
    const markRead = () => {
      if (document.visibilityState !== 'visible') return;
      conduit.transmit(`/conversations/${id}`, { method: 'PATCH', auth: true, body: { read: true } })
        .catch(failure => setError(errorText(failure)));
    };
    markRead();
    document.addEventListener('visibilitychange', markRead);
    if (log.current && log.current.scrollHeight - log.current.scrollTop - log.current.clientHeight < 240) {
      log.current.scrollTop = log.current.scrollHeight;
    }
    return () => document.removeEventListener('visibilitychange', markRead);
  }, [id, newest, messagePage, Boolean(thread.data), Boolean(conversation), readable, vault.revision]);
  const send = async event => {
    event.preventDefault();
    if (!body.trim()) return;
    setBusy(true); setError('');
    try {
      if (!currentKey || !conversation?.recipientKey || !unlocked || !peerReady) throw new Error(t('messages.unlockFirst'));
      await messageVault.checkPeer(conversation.recipientKey, conversation.recipientId, conversation.id);
      if (!pending.current || pending.current.body !== body.trim()
        || pending.current.request.senderKeyId !== currentKey.id || pending.current.request.recipientKeyId !== conversation.recipientKey.id) {
        const { encryptMessage } = await import('../lib/message-crypto.js');
        const request = await encryptMessage({
          body, conversationId: conversation.id, clientId: crypto.randomUUID(), sender: currentKey,
          recipient: conversation.recipientKey, unlocked: messageVault.keys.get(currentKey.id),
        });
        messageVault.ensure(ownId);
        pending.current = { body: body.trim(), request };
      }
      messageVault.ensure(ownId);
      await conduit.transmit(`/conversations/${conversation.id}/messages`, { method: 'POST', auth: true, body: pending.current.request });
      messageVault.ensure(ownId);
      setBody(''); pending.current = null; setMessagePage(1); thread.reload(); list.reload();
      document.getElementById('message-body')?.focus();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const changeConversation = async changes => {
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/conversations/${id}`, { method: 'PATCH', auth: true, body: changes });
      if (changes.archived) window.location.hash = '#messages';
      else { thread.reload(); list.reload(); }
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const remove = async messageId => {
    if (!window.confirm(t('messages.confirmRemove'))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/conversations/${id}/messages/${messageId}`, { method: 'DELETE', auth: true });
      document.getElementById('thread-heading')?.focus(); thread.reload(); list.reload();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow={t('messages.eyebrow')} title={t('app.routes.messages')} subtitle={t('messages.subtitle')} />
      {error && <p className="error" role="alert">{error}</p>}
      <MessagingKeys neededKeyId={neededKeyId} onCurrent={setCurrentKey} />
      <div className="message-layout">
        <section className="conversation-pane" aria-labelledby="conversations-heading">
          <h2 className="heading-md" id="conversations-heading" tabIndex="-1">{t('messages.conversations')}</h2>
          <a className="text-link" href="#musicians">{t('messages.findMusician')}</a>
          <label className="checkbox-label"><input type="checkbox" checked={archived} onChange={event => { setArchived(event.target.checked); setListPage(1); }} />{t('messages.showArchived')}</label>
          {list.error && <ErrorState message={list.error} onRetry={list.reload} />}
          {!list.data && !list.error && <Spinner label={t('messages.loadingConversations')} />}
          {list.data?.conversations.length === 0 && <p>{archived ? t('messages.noArchived') : t('messages.none')}</p>}
          <ul className="conversation-list">{list.data?.conversations.map(item => (
            <li key={item.id}><a className="conversation-link" href={`#messages?id=${item.id}`} aria-current={id === item.id ? 'page' : undefined}>
              <strong>{item.recipientName}</strong>
              <span>{item.lastMessage?.slice(0, 100) || t('messages.noMessages')}</span>
              <small>{[item.unreadCount ? t('app.nav.unread', { count: item.unreadCount }) : t('messages.read'), item.blockedByMe && t('messages.blocked')].filter(Boolean).join(' / ')}</small>
            </a>
              {archived && <button className="text-link" type="button" disabled={busy} onClick={async () => {
                try {
                  await conduit.transmit(`/conversations/${item.id}`, { method: 'PATCH', auth: true, body: { archived: false } });
                  document.getElementById('conversations-heading')?.focus(); list.reload();
                } catch (failure) { setError(errorText(failure)); }
              }}>{t('messages.restore', { name: item.recipientName })}</button>}
            </li>
          ))}</ul>
          <Pagination pagination={list.data?.pagination} onPage={setListPage} disabled={list.loading} label={t('messages.conversationPages')} />
        </section>
        <section className="thread-pane" aria-labelledby={conversation ? 'thread-heading' : undefined} aria-label={!conversation ? t('messages.conversation') : undefined}>
          {thread.error && <ErrorState message={thread.error} onRetry={thread.reload} />}
          {thread.data && !conversation && <ErrorState message={t('messages.mismatch')} onRetry={thread.reload} />}
          {!id ? <p>{t('messages.select')}</p> : !thread.data && !thread.error ? <Spinner label={t('messages.loadingMessages')} /> : conversation && <>
            <h2 className="heading-md" id="thread-heading" tabIndex="-1"><a href={`#musician?id=${conversation.recipientId}`}>{conversation.recipientName}</a></h2>
            <div className="compact-actions">
              <button className="text-link" type="button" disabled={busy} onClick={() => changeConversation({ archived: true })}>{t('messages.archive')}</button>
              <button className="text-link" type="button" disabled={busy} onClick={() => changeConversation({ blocked: !conversation.blockedByMe })}>{conversation.blockedByMe ? t('messages.unblock') : t('messages.block')}</button>
              <ReportButton userId={conversation.recipientId} name={conversation.recipientName} />
            </div>
            {conversation.blockedByMe && <p className="status-message">{t('messages.blockedNotice')}</p>}
            {!conversation.recipientAvailable && <p className="status-message">{t('messages.unavailable')}</p>}
            <ConversationSecurity own={currentKey} peer={conversation.recipientKey} peerId={conversation.recipientId} conversationId={conversation.id} onReady={setPeerReady} onChecked={setPeerChecked} />
            {thread.data.messages.some(message => message.encryptionVersion === 0 && !message.isDeleted) && <p className="status-message">{t('messages.legacy')}</p>}
            <p className="field-hint">{t('messages.newestFirst')}</p>
            <div className="message-log" role="log" aria-label={t('messages.log')} aria-live="polite" aria-relevant="additions text" ref={log} tabIndex="0">
              {[...thread.data.messages].reverse().map(item => <EncryptedMessage key={item.id} message={item} conversation={conversation} ownId={ownId}
                keys={thread.data.keys} vault={vault} peerChecked={peerChecked} busy={busy} onRemove={remove} onUnlock={keyId => {
                  setNeededKeyId(keyId);
                  document.getElementById('encryption-heading')?.scrollIntoView({ block: 'center' });
                }} />)}
            </div>
            <Pagination pagination={thread.data.pagination} onPage={setMessagePage} disabled={thread.loading} label={t('messages.messagePages')} />
            <form className="form-stack message-composer" onSubmit={send}>
              <FormField id="message-body" label={t('messages.messageLabel')} hint={t('messages.messageHint')} required>
                <textarea className="input" value={body} onChange={event => setBody(event.target.value)} maxLength="4000"
                  disabled={busy || conversation.blockedByMe || !conversation.recipientAvailable || !unlocked || !peerReady} />
              </FormField>
              <button className="btn btn-primary" type="submit" disabled={busy || !body.trim() || conversation.blockedByMe || !conversation.recipientAvailable || !unlocked || !peerReady}>{busy ? t('messages.sending') : t('musicians.profile.message')}</button>
            </form>
          </>}
        </section>
      </div>
    </div>
  );
}
