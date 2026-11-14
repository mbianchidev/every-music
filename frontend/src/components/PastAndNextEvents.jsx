import { useI18n } from '../lib/i18n.js';

// Extension point for the events workstream: "Next events" and "Past events"
// for an organization page or a music-lover profile. `subject` is
// { type: 'organization' | 'profile', id }. It renders an empty state until
// events exist; replace the body, not the call sites, when events ship.
export default function PastAndNextEvents({ subject }) {
  const { t } = useI18n();
  const heading = `events-heading-${subject.type}-${subject.id}`;
  return (
    <section className="detail-section events-extension" aria-labelledby={heading} data-events-subject={subject.type}>
      <h2 className="heading-md" id={heading}>{t('organizations.events.title')}</h2>
      <div className="form-grid">
        <div><h3>{t('organizations.events.next')}</h3><p className="body-muted">{t('organizations.events.noneNext')}</p></div>
        <div><h3>{t('organizations.events.past')}</h3><p className="body-muted">{t('organizations.events.nonePast')}</p></div>
      </div>
    </section>
  );
}
