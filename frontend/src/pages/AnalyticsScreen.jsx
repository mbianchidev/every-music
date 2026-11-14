import { useResource } from '../lib/resources.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import ActivityReport from '../components/ActivityReport.jsx';
import UpgradeNotice from '../components/UpgradeNotice.jsx';
import { useQuotas } from '../components/QuotaNotice.jsx';
import { useI18n } from '../lib/i18n.js';

export default function AnalyticsScreen() {
  const { t } = useI18n();
  const quotas = useQuotas();
  const allowed = quotas.data?.announcementStats === true;
  const resource = useResource(allowed ? '/analytics' : null, { events: 'preferences.changed,announcements.changed,messages.changed,analytics.changed' });
  const preferences = useResource('/preferences', { events: 'preferences.changed' });
  return (
    <div className="container">
      <PageHeader eyebrow="Your space" title="Analytics" subtitle="Your last 30 days of opted-in activity, not unique visitors or total platform traffic." />
      {preferences.data?.analytics === false && <p className="status-message">Analytics is off. <a href="#settings">Opt in from settings</a> to start collecting daily totals.</p>}
      <p className="body-muted">Only activity where both musicians consent is counted. No visitor identities or message content are included. Figures can be lower than your total engagement.</p>
      {(resource.error || preferences.error || quotas.error) && <ErrorState message={resource.error || preferences.error || quotas.error} onRetry={() => { resource.reload(); preferences.reload(); quotas.reload(); }} />}
      {quotas.data && !allowed && <UpgradeNotice title={t('adExtras.analytics.upgradeTitle')} plan={quotas.data.plan}>{t('adExtras.analytics.upgradeBody')}</UpgradeNotice>}
      {(!quotas.data || allowed) && (!resource.data && !resource.error && !quotas.error ? <Spinner label="Loading analytics" /> : resource.data && <ActivityReport daily={resource.data.daily} content={resource.data.content} />)}
    </div>
  );
}
