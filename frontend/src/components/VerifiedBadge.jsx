import { useI18n } from '../lib/i18n.js';
import Icon from './Icon.jsx';

export default function VerifiedBadge({ verified }) {
  const { t } = useI18n();
  if (!verified) return null;
  return <span className="tag verified-badge"><Icon name="shield" size={13} />{t('organizations.verified.badge')}</span>;
}
