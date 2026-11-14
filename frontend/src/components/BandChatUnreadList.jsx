import { useI18n } from '../lib/i18n.js';
import { useBandChatUnread } from '../lib/band-chat-unread.js';
import ErrorState from './ErrorState.jsx';

// Your bands' chats with unread counts, linking straight to each band chat.
// Hidden for people without a band; shown with a retry when loading fails.
export default function BandChatUnreadList() {
  const { t, formatDate } = useI18n();
  const { chats, error, reload } = useBandChatUnread();
  if (!chats?.length && !error) return null;
  return (
    <section className="detail-section band-chat-unread" aria-labelledby="band-chats-heading">
      <h2 className="heading-md" id="band-chats-heading">{t('bandChatUnread.heading')}</h2>
      {error && <ErrorState title={t('bandChatUnread.loadError')} message={error} onRetry={reload} />}
      {!!chats?.length && <ul className="band-chat-unread-list">{chats.map(chat => (
        <li key={chat.organizationId} className={chat.unreadCount ? 'has-unread' : undefined}>
          <a href={`#organization?id=${encodeURIComponent(chat.organizationId)}&section=chat`}>{t('bandChatUnread.open', { name: chat.name })}</a>
          <span className={chat.unreadCount ? 'band-chat-count' : 'body-muted'}>
            {chat.unreadCount ? t('bandChatUnread.unread', { count: chat.unreadCount }) : t('bandChatUnread.read')}
          </span>
          {chat.lastMessageAt && <span className="body-muted">
            {t('bandChatUnread.last', { date: formatDate(chat.lastMessageAt, { dateStyle: 'medium', timeStyle: 'short' }) })}
          </span>}
        </li>
      ))}</ul>}
    </section>
  );
}
