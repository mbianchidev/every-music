import { useI18n } from '../../lib/i18n.js';
import { formatEventTime, locationLabel, organizerNames } from '../../lib/events.js';
import Icon from '../Icon.jsx';
import ManagedImage from '../ManagedImage.jsx';

export default function EventCard({ event, headingLevel = 2, relations = [] }) {
  const { t, locale } = useI18n();
  const Heading = `h${headingLevel}`;
  const cover = event.images[0];
  const headliners = event.lineup.filter(entry => entry.role === 'headliner').map(entry => entry.name);
  const organizers = organizerNames(event);
  const location = locationLabel(event);
  return (
    <article className="card event-card">
      <div className="listing-card-labels">
        <span className="tag">{t(`events.types.${event.type}`)}</span>
        {event.status !== 'scheduled' && <span className={`tag ${event.status === 'cancelled' ? 'tag-warning' : 'tag-muted'}`}>{t(`events.statuses.${event.status}`)}</span>}
        {event.visibility === 'draft' && <span className="tag tag-muted">{t('events.visibility.draft')}</span>}
        {event.soldOut && <span className="tag tag-warning">{t('events.detail.soldOut')}</span>}
        {relations.map(relation => <span className="tag tag-muted" key={relation}>{t(`events.extension.relations.${relation}`)}</span>)}
      </div>
      <div className="call-card-heading">
        <Heading className="heading-md"><a href={`#event?id=${event.id}`}>{event.title}</a></Heading>
        {cover && <ManagedImage className="call-thumbnail" src={cover} authenticated={event.visibility === 'draft'}
          alt={t('events.card.image', { title: event.title })} width="72" height="72" loading="lazy" />}
      </div>
      <p className="event-card-date"><Icon name="calendar" size={15} />
        <time dateTime={event.startsAt}>{formatEventTime(event.startsAt, event.timezone, locale, { dateStyle: 'medium', timeStyle: 'short' })}</time>
      </p>
      {!!headliners.length && <p className="event-card-lineup">{headliners.join(', ')}</p>}
      <p className="announcement-meta">
        <span><Icon name="location" size={14} />{location || t('events.card.noLocation')}</span>
        {!!organizers.length && <span>{t('events.card.organizedBy', { names: organizers.join(', ') })}</span>}
      </p>
      <div className="card-footer">
        <span className="listing-card-seller">
          {t('events.card.going', { count: event.attendance.going })}{' / '}{t('events.card.interested', { count: event.attendance.interested })}
        </span>
        {event.viewer.attendance && <span className="tag">{t(`events.card.you.${event.viewer.attendance}`)}</span>}
      </div>
    </article>
  );
}
