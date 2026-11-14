import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import ActivityReport from '../components/ActivityReport.jsx';
import UpgradeNotice from '../components/UpgradeNotice.jsx';
import { useQuotas } from '../components/QuotaNotice.jsx';
import { useI18n } from '../lib/i18n.js';
import { richText } from '../lib/rich-text.jsx';

export default function AnalyticsScreen() {
  const { t } = useI18n();
  const quotas = useQuotas();
  const allowed = quotas.data?.announcementStats === true;
  const resource = useResource(allowed ? '/analytics' : null, { events: 'preferences.changed,announcements.changed,messages.changed,analytics.changed' });
  const preferences = useResource('/preferences', { events: 'preferences.changed' });
  return (
    <div className="container">
      <PageHeader eyebrow={t('app.nav.sections.yourSpace')} title={t('app.routes.analytics')} subtitle={t('analytics.subtitle')} />
      {preferences.data?.analytics === false && <p className="status-message">{richText(t('analytics.off'), { link: <a href="#settings">{t('analytics.optIn')}</a> })}</p>}
      <p className="body-muted">{t('analytics.consent')}</p>
      {(resource.error || preferences.error || quotas.error) && <ErrorState message={resource.error || preferences.error || quotas.error} onRetry={() => { resource.reload(); preferences.reload(); quotas.reload(); }} />}
      {quotas.data && !allowed && <UpgradeNotice title={t('adExtras.analytics.upgradeTitle')} plan={quotas.data.plan}>{t('adExtras.analytics.upgradeBody')}</UpgradeNotice>}
      {(!quotas.data || allowed) && (!resource.data && !resource.error && !quotas.error ? <Spinner label={t('analytics.loading')} /> : resource.data && <ActivityReport daily={resource.data.daily} content={resource.data.content} />)}
    </div>
  );
}
