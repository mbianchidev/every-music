import { useState } from 'react';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import Avatar from './Avatar.jsx';
import ErrorState from './ErrorState.jsx';
import Pagination from './Pagination.jsx';
import Spinner from './Spinner.jsx';
import UpgradeNotice from './UpgradeNotice.jsx';
import { useQuotas } from './QuotaNotice.jsx';

// "See who visited your profile": recent visitors who opted in to being
// shown, for plans with profileVisits. Others get an explanation instead.
export default function ProfileVisits() {
  const { t, formatDate } = useI18n();
  const quotas = useQuotas();
  const [page, setPage] = useState(1);
  const allowed = quotas.data?.profileVisits === true;
  const visits = useResource(allowed ? `/profile-visits?page=${page}&pageSize=20` : null, { events: 'profiles.changed' });
  const rows = visits.data?.visits || [];
  return (
    <section className="detail-section" aria-labelledby="profile-visits-heading">
      <h2 className="heading-md" id="profile-visits-heading">{t('profileExtras.visits.heading')}</h2>
      {quotas.error && <ErrorState message={quotas.error} onRetry={quotas.reload} />}
      {!quotas.data && !quotas.error && <Spinner label={t('profileExtras.visits.loading')} />}
      {quotas.data && !allowed && <UpgradeNotice title={t('profileExtras.visits.upgradeTitle')} plan={quotas.data.plan} level={3}>
        {t('profileExtras.visits.upgradeBody')}
      </UpgradeNotice>}
      {allowed && <>
        <p className="body-muted">{t('profileExtras.visits.explanation')} <a href="#settings">{t('profileExtras.visits.settingsLink')}</a></p>
        {visits.error && <ErrorState message={visits.error} onRetry={visits.reload} />}
        {!visits.data && !visits.error && <Spinner label={t('profileExtras.visits.loading')} />}
        {visits.data && (rows.length ? <ul className="person-list">{rows.map(visit => <li key={visit.userId}>
          <Avatar name={visit.artistName} src={visit.profilePictureUrl} />
          <a href={`#musician?id=${visit.userId}`}>{visit.artistName}</a>
          <span className="field-hint">{t('profileExtras.visits.last', {
            date: formatDate(visit.lastVisitedAt), count: visit.days,
          })}</span>
        </li>)}</ul> : <p>{t('profileExtras.visits.empty')}</p>)}
        <Pagination pagination={visits.data?.pagination} onPage={setPage} disabled={visits.loading} label={t('profileExtras.visits.pages')} />
      </>}
    </section>
  );
}
