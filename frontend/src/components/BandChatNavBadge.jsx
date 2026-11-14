import { useI18n } from '../lib/i18n.js';
import { useBandChatUnread } from '../lib/band-chat-unread.js';

// Unread band chat messages next to the "Your pages" navigation entry.
export default function BandChatNavBadge() {
  const { t } = useI18n();
  const { total } = useBandChatUnread();
  if (!total) return null;
  return <span className="nav-badge band-chat-nav-badge">
    <span aria-hidden="true">{total > 99 ? '99+' : total}</span>
    <span className="sr-only">{t('bandChatUnread.nav', { count: total })}</span>
  </span>;
}
