import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { defaultTimeZone, formatEventTime, organizationHref, zoneLabel } from '../lib/events.js';
import PageHeader from '../components/PageHeader.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import ManagedImage from '../components/ManagedImage.jsx';
import ShareButton from '../components/ShareButton.jsx';
import VerifiedBadge from '../components/VerifiedBadge.jsx';
import EventsNav from '../components/events/EventsNav.jsx';
import CapacityBar from '../components/events/CapacityBar.jsx';
import EventLineup from '../components/events/EventLineup.jsx';
import EventRsvp from '../components/events/EventRsvp.jsx';
import EventPlanning from '../components/events/EventPlanning.jsx';
import EventCommunications from '../components/events/EventCommunications.jsx';
import EventDiscussion from '../components/events/EventDiscussion.jsx';
import EventReportButton from '../components/events/EventReportButton.jsx';
import EventManageActions from '../components/events/EventManageActions.jsx';

function Facts({ event }) {
  const { t, locale } = useI18n();
  const format = value => formatEventTime(value, event.timezone, locale);
  const viewerZone = defaultTimeZone();
  const rows = [[t('events.detail.starts'), <>
    <time dateTime={event.startsAt}>{format(event.startsAt)}</time>
    <span className="body-muted"> {zoneLabel(event.startsAt, event.timezone, locale)}</span>
    {viewerZone !== event.timezone && <span className="event-your-time">
      {t('events.detail.yourTime', { time: formatEventTime(event.startsAt, viewerZone, locale) })}</span>}
  </>]];
  if (event.doorsOpenAt) rows.push([t('events.detail.doors'), <time dateTime={event.doorsOpenAt}>{format(event.doorsOpenAt)}</time>]);
  if (event.endsAt) rows.push([t('events.detail.ends'), <time dateTime={event.endsAt}>{format(event.endsAt)}</time>]);
  const where = [];
  if (event.venue) where.push(<a key="venue" href={organizationHref(event.venue)}>{event.venue.name}</a>);
  if (event.address) where.push(<span key="address">{event.address}</span>);
  if (event.place) where.push(<span key="place">{event.place.label}</span>);
  rows.push([t('events.detail.where'), where.length ? <>
    <span className="event-where">{where.reduce((list, item, index) => [...list, ...(index ? [', '] : []), item], [])}</span>
    {event.map && <span className="compact-actions event-map-links">
      <a href={event.map.map} target="_blank" rel="noopener noreferrer">{t('events.detail.map')}<span className="sr-only"> {t('events.detail.external')}</span></a>
      <a href={event.map.directions} target="_blank" rel="noopener noreferrer">{t('events.detail.directions')}<span className="sr-only"> {t('events.detail.external')}</span></a>
    </span>}
  </> : t('events.card.noLocation')]);
  rows.push([t('events.detail.organizedBy'), event.organizers.length
    ? <ul className="inline-list">{event.organizers.map(item => <li key={item.id}><a href={organizationHref(item)}>{item.name}</a>
      {item.verified && <VerifiedBadge verified />}</li>)}</ul>
    : event.owner ? <a href={`#musician?id=${event.owner.userId}`}>{event.owner.name}</a> : t('events.detail.unknownOrganizer')]);
  return <dl className="detail-list event-facts">{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>;
}

function Tickets({ event }) {
  const { t } = useI18n();
  if (!event.capacity && !event.ticketLinks.length) return null;
  return (
    <section className="detail-section" aria-labelledby="event-tickets-heading">
      <h2 className="heading-md" id="event-tickets-heading">{t('events.detail.tickets')}</h2>
      <CapacityBar event={event} />
      {event.ticketLinks.length ? <ul className="inline-list ticket-links">{event.ticketLinks.map(link => <li key={link.url}>
        <a className="btn btn-primary" href={link.url} target="_blank" rel="noopener noreferrer nofollow">
          {t('events.detail.buyOn', { label: link.label })}<span className="sr-only"> {t('events.detail.external')}</span></a>
      </li>)}</ul> : <p className="body-muted">{t('events.detail.noTickets')}</p>}
    </section>
  );
}

export default function EventScreen({ route }) {
  const { t } = useI18n();
  const id = route.query.get('id') || 'missing';
  const resource = useResource(`/gigs/${encodeURIComponent(id)}`, { events: 'gigs.changed' });
  const event = resource.data;
  const bands = event?.lineup.some(entry => entry.band) && !event.viewer.canEdit;
  const mine = useResource(bands ? '/organizations/mine' : null, { events: 'organizations.changed' });
  const managedBandIds = (mine.data?.organizations || []).filter(item => item.permissions.includes('manage_calendar')).map(item => item.id);
  const notice = event && (event.visibility === 'draft' ? 'draft' : ['cancelled', 'postponed', 'completed'].includes(event.status) ? event.status : null);
  return (
    <div className="container">
      <PageHeader eyebrow={event ? `${t(`events.types.${event.type}`)} / ${t(`events.statuses.${event.status}`)}` : t('events.routes.event')}
        title={event?.title || t('events.routes.event')} />
      <EventsNav />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!event && !resource.error ? <Spinner label={t('events.detail.loading')} /> : event && <>
        {notice && <p className={`status-message event-notice event-notice-${notice}`}>{t(`events.detail.notices.${notice}`)}</p>}
        <EventCommunications event={event} onChanged={resource.reload} />
        <article className="card event-detail">
          {event.images[0] && <ManagedImage className="event-cover" src={event.images[0]} authenticated={event.visibility === 'draft'}
            alt={t('events.detail.imageAlt', { index: 1, title: event.title })} width="960" height="540" />}
          <Facts event={event} />
          <Tickets event={event} />
          {!!event.genres.length && <div className="tag-list" aria-label={t('events.detail.genres')}>
            {event.genres.map(genre => <span className="tag" key={genre.id}>{genre.name}</span>)}</div>}
          {event.description && <section className="detail-section"><h2 className="heading-md">{t('events.detail.about')}</h2>
            <p className="detail-text">{event.description}</p></section>}
          {event.images.length > 1 && <section className="detail-section" aria-labelledby="event-photos-heading">
            <h2 className="heading-md" id="event-photos-heading">{t('events.detail.images')}</h2>
            <ul className="photo-grid">{event.images.slice(1).map((url, index) => <li key={url}><figure>
              <ManagedImage src={url} authenticated={event.visibility === 'draft'} alt={t('events.detail.imageAlt', { index: index + 2, title: event.title })}
                width="300" height="200" loading="lazy" /></figure></li>)}</ul>
          </section>}
          <div className="compact-actions event-actions">
            {event.viewer.canEdit && <EventManageActions event={event} onChanged={resource.reload} />}
            {event.visibility === 'published' && <ShareButton title={event.title} />}
            {!event.viewer.canEdit && <EventReportButton event={event} />}
          </div>
        </article>
        <EventLineup event={event} onChanged={resource.reload} managedBandIds={managedBandIds} />
        <EventRsvp event={event} onChanged={resource.reload} />
        <EventPlanning event={event} onChanged={resource.reload} />
        <EventDiscussion event={event} />
      </>}
    </div>
  );
}
