import { useI18n } from '../lib/i18n.js';
import { organizationHref } from '../lib/organizations.js';
import VerifiedBadge from './VerifiedBadge.jsx';

// Shows the page an announcement was published for, on cards and details.
export default function OrganizationByline({ organization }) {
  const { t } = useI18n();
  if (!organization) return null;
  return (
    <p className="organization-byline">
      {t('organizations.announcement.byline')}{' '}
      <a href={organizationHref(organization)}>{organization.name}</a> <VerifiedBadge verified={organization.verified} />
    </p>
  );
}
