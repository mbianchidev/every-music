import { useI18n } from '../lib/i18n.js';

function Tick() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path className="verified-seal" d="M12 1.5l2.6 2.1 3.3-.4 1.1 3.1 3 1.6-.8 3.2 1.6 2.9-2.4 2.3-.2 3.3-3.3.6-2 2.6L12 21.4l-2.9 1.4-2-2.6-3.3-.6-.2-3.3L1.2 14l1.6-2.9L2 7.9l3-1.6 1.1-3.1 3.3.4z" />
      <path className="verified-tick" d="m7.5 12.2 3 3 6-6.4" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// People pass `verifiedAt` (icon only unless `label`); organization pages pass
// `verified` and always show the text badge.
export default function VerifiedBadge({ verifiedAt, verified, label = false }) {
  const { t } = useI18n();
  if (!verified && !verifiedAt) return null;
  const text = verified ? t('organizations.verified.badge') : label ? t('profileVerification.label') : null;
  if (text) return <span className="verified-badge verified-badge-label"><Tick />{text}</span>;
  return <span className="verified-badge" role="img" aria-label={t('profileVerification.badge')} title={t('profileVerification.badgeTitle')}><Tick /></span>;
}
