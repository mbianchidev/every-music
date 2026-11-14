import Icon from '../Icon.jsx';
import { useI18n } from '../../lib/i18n.js';

// Text label (not color alone) for paid placements in discovery results.
export default function PromotedLabel({ promotion }) {
  const { t } = useI18n();
  if (!promotion) return null;
  return <span className="tag tag-promoted"><Icon name="star" size={13} />
    {t(promotion.kind === 'pinned' ? 'monetization.promotedPinned' : 'monetization.promoted')}</span>;
}
