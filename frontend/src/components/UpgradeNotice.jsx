import { useI18n } from '../lib/i18n.js';

// Explains a plan-gated feature instead of failing with an empty screen.
export default function UpgradeNotice({ title, children, plan = 'free', level = 2 }) {
  const { t } = useI18n();
  const Heading = `h${level}`;
  return (
    <section className="card upgrade-notice">
      <p className="eyebrow">{t('adExtras.upgrade.eyebrow')}</p>
      <Heading className="heading-md">{title}</Heading>
      <p className="body-muted">{children}</p>
      <p className="field-hint">{t('adExtras.upgrade.how', { plan: t(`adExtras.plans.${plan}`) })}</p>
    </section>
  );
}
