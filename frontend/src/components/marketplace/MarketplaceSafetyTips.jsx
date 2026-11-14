import { useI18n } from '../../lib/i18n.js';

const TIP_COUNT = 6;

export default function MarketplaceSafetyTips({ headingId = 'marketplace-safety' }) {
  const { t } = useI18n();
  return (
    <section className="card marketplace-safety" aria-labelledby={headingId}>
      <h2 className="heading-md" id={headingId}>{t('marketplace.safety.title')}</h2>
      <p>{t('marketplace.safety.offPlatform')}</p>
      <ul>{Array.from({ length: TIP_COUNT }, (_, index) => <li key={index}>{t(`marketplace.safety.tips.${index}`)}</li>)}</ul>
    </section>
  );
}
