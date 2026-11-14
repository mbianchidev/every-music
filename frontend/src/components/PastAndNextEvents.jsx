import { useState } from 'react';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';
import EventCard from './events/EventCard.jsx';

const PAGE_SIZE = 4;

function EventList({ subject, when, heading }) {
  const { t } = useI18n();
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const base = subject.type === 'organization' ? `/gigs/organizations/${subject.id}` : `/gigs/profiles/${subject.id}`;
  const resource = useResource(`${base}?when=${when}&pageSize=${pageSize}`, { events: 'gigs.changed' });
  const events = resource.data?.events || [];
  return (
    <div className="events-extension-list">
      <h3>{heading}</h3>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('events.extension.loading')} /> : resource.data && (events.length
        ? <div className="stack">{events.map(event => <EventCard key={event.id} event={event} headingLevel={4} relations={event.relations} />)}</div>
        : <p className="body-muted">{t(when === 'upcoming' ? 'events.extension.noneNext' : 'events.extension.nonePast')}</p>)}
      {resource.data?.pagination.hasMore && <button className="btn btn-ghost" type="button" disabled={resource.loading}
        onClick={() => setPageSize(size => Math.min(100, size + PAGE_SIZE * 2))}>{t('events.extension.more', { heading })}</button>}
    </div>
  );
}

// "Next events" and "Past events" for an organization page (organized,
// performed, or hosted) or a profile (performing, or going when shared).
// `subject` is { type: 'organization' | 'profile', id }.
export default function PastAndNextEvents({ subject }) {
  const { t } = useI18n();
  const heading = `events-heading-${subject.type}-${subject.id}`;
  return (
    <section className="detail-section events-extension" aria-labelledby={heading} data-events-subject={subject.type}>
      <h2 className="heading-md" id={heading}>{t('events.extension.title')}</h2>
      <div className="form-grid">
        <EventList subject={subject} when="upcoming" heading={t('events.extension.next')} />
        <EventList subject={subject} when="past" heading={t('events.extension.past')} />
      </div>
    </section>
  );
}
