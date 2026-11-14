import { useI18n } from '../lib/i18n.js';

// Expiry for everyone; reactions and statistics only for the owner, who
// receives `stats` from the API. Views and saves need the owner's plan.
export default function AnnouncementStats({ post }) {
  const { t, formatDate, formatNumber } = useI18n();
  const stats = post.stats;
  return (
    <>
      <p className="field-hint">{post.expiresAt
        ? t('adExtras.expiry.until', { date: formatDate(post.expiresAt) })
        : t('adExtras.expiry.open')}</p>
      {stats && <section className="announcement-stats" aria-label={t('adExtras.stats.heading')}>
        <p className="eyebrow">{t('adExtras.stats.ownerOnly')}</p>
        <dl className="metric-grid">
          <div className="card"><dt>{t('adExtras.stats.likes')}</dt><dd>{formatNumber(stats.likes)}</dd></div>
          <div className="card"><dt>{t('adExtras.stats.dislikes')}</dt><dd>{formatNumber(stats.dislikes)}</dd></div>
          {stats.views !== undefined && <div className="card"><dt>{t('adExtras.stats.views')}</dt><dd>{formatNumber(stats.views)}</dd></div>}
          {stats.saves !== undefined && <div className="card"><dt>{t('adExtras.stats.saves')}</dt><dd>{formatNumber(stats.saves)}</dd></div>}
        </dl>
        {post.statsLocked && <p className="field-hint">{t('adExtras.stats.locked')}</p>}
      </section>}
    </>
  );
}
