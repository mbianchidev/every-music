import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { formatEntryTime, localTimeZone } from '../lib/calendar.js';

// Entries as cards with their time in the viewer's zone, plus the entry's own
// zone when it differs.
export default function CalendarEntryList({ entries, showCalendar = true }) {
  const { t, locale } = useI18n();
  const viewerZone = localTimeZone();
  const own = nucleus.payload.persona?.userId;
  return (
    <ol className="calendar-list">{entries.map(entry => (
      <li className={`card calendar-item ${entry.status === 'cancelled' ? 'is-cancelled' : ''}`} key={entry.id}>
        <p className="eyebrow">
          {t(`calendar.kinds.${entry.kind}`)}
          {showCalendar && <> / {entry.organization ? entry.organization.name : t('calendar.list.personal')}</>}
        </p>
        <h3><a href={`#calendar-entry?id=${entry.id}`}>{entry.title}</a></h3>
        <p><time dateTime={entry.startsAt}>{formatEntryTime(entry, locale, viewerZone)}</time></p>
        {formatEntryTime(entry, locale) !== formatEntryTime(entry, locale, viewerZone) && <p className="body-muted">
          {t('calendar.list.zoneTime', { time: formatEntryTime(entry, locale), zone: entry.timeZone.replace(/_/g, ' ') })}
        </p>}
        {(entry.place || entry.address) && <p className="body-muted">{[entry.address, entry.place?.label].filter(Boolean).join(', ')}</p>}
        <p className="calendar-item-status">
          {entry.status === 'cancelled' && <span className="tag">{t('calendar.list.cancelled')}</span>}
          {entry.ownerId !== own && <span>{t('calendar.list.yourAnswer', { answer: t(`calendar.responses.${entry.viewer.response}`) })}</span>}
        </p>
      </li>
    ))}</ol>
  );
}
