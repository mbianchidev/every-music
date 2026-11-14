import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import nucleus from '../../lib/nucleus.js';
import { useI18n } from '../../lib/i18n.js';
import { formatEventTime, lineupByRole, performerHref } from '../../lib/events.js';
import VerifiedBadge from '../VerifiedBadge.jsx';

// Lineup grouped by role with links to band pages and artist profiles.
// Performers (or managers of a listed band) can take themselves off it.
export default function EventLineup({ event, onChanged, managedBandIds = [] }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const own = nucleus.payload.persona?.userId;
  const leave = async entry => {
    if (!window.confirm(t('events.detail.leaveConfirm', { name: entry.name, title: event.title }))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/gigs/${event.id}/lineup/${entry.id}`, { method: 'DELETE', auth: true });
      onChanged();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const time = value => formatEventTime(value, event.timezone, locale, { timeStyle: 'short' });
  return (
    <section className="detail-section" aria-labelledby="event-lineup-heading">
      <h2 className="heading-md" id="event-lineup-heading">{t('events.detail.lineup')}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {!event.lineup.length ? <p className="body-muted">{t('events.detail.noLineup')}</p> : lineupByRole(event.lineup).map(group => (
        <div className="lineup-group" key={group.role}>
          <h3>{t(`events.roles.${group.role}`)}</h3>
          <ul className="lineup-list">{group.entries.map(entry => {
            const href = performerHref(entry);
            const mine = entry.artist?.userId === own || (entry.band && managedBandIds.includes(entry.band.id));
            return <li key={entry.id}>
              <span className="lineup-name">{href ? <a href={href}>{entry.name}</a> : entry.name}
                {entry.band?.verified && <VerifiedBadge verified />}{entry.artist?.verifiedAt && <VerifiedBadge verifiedAt={entry.artist.verifiedAt} />}</span>
              {entry.setStartsAt && <span className="body-muted">{entry.setEndsAt
                ? t('events.detail.setRange', { start: time(entry.setStartsAt), end: time(entry.setEndsAt) })
                : t('events.detail.set', { start: time(entry.setStartsAt) })}</span>}
              {mine && !event.viewer.canEdit && <button className="text-link" type="button" disabled={busy} onClick={() => leave(entry)}>
                {t('events.detail.leaveLineup', { name: entry.name })}</button>}
            </li>;
          })}</ul>
        </div>
      ))}
    </section>
  );
}
