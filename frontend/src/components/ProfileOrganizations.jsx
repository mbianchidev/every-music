import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { organizationHref } from '../lib/organizations.js';
import VerifiedBadge from './VerifiedBadge.jsx';

// "Bands and pages" a musician currently belongs to, shown on profiles.
export default function ProfileOrganizations({ userId }) {
  const { t } = useI18n();
  const resource = useResource(userId ? `/users/${encodeURIComponent(userId)}/organizations` : null, { events: 'organizations.changed' });
  const items = resource.data?.organizations ?? [];
  if (resource.error) return <p className="field-error" role="alert">{t('organizations.profile.memberOfError', { message: resource.error })} <button className="text-link" type="button" onClick={resource.reload}>{t('organizations.common.retry')}</button></p>;
  if (!items.length) return null;
  return (
    <section className="detail-section" aria-labelledby={`member-of-${userId}`}>
      <h2 className="heading-md" id={`member-of-${userId}`}>{t('organizations.profile.memberOf')}</h2>
      <ul className="inline-list">{items.map(item => <li key={item.id}>
        <a href={organizationHref(item)}>{item.name}</a> <span className="body-muted">({[t(`organizations.kinds.${item.kind}`), item.title].filter(Boolean).join(', ')})</span>
        <VerifiedBadge verified={item.verified} />
      </li>)}</ul>
    </section>
  );
}
