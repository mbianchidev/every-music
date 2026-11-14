import { useI18n } from '../../lib/i18n.js';

// Text first; the bar only repeats the same percentage visually.
export default function CapacityBar({ event }) {
  const { t, formatNumber } = useI18n();
  if (!event.capacity) return null;
  const percent = event.ticketsSoldPercent ?? 0;
  return (
    <div className="capacity">
      <p className="capacity-text">
        {event.soldOut ? <strong>{t('events.detail.soldOut')}. </strong> : null}
        {t('events.detail.sold', { sold: formatNumber(event.ticketsSold), capacity: formatNumber(event.capacity), percent })}
      </p>
      <div className="capacity-bar" aria-hidden="true"><span style={{ width: `${percent}%` }} /></div>
    </div>
  );
}
