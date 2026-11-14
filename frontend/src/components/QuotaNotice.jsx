import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';

export const QUOTA_EVENTS = 'announcements.changed,saved.changed,saved-searches.changed,entitlements.changed';

export function useQuotas() {
  return useResource('/quotas', { events: QUOTA_EVENTS });
}

// Remaining-quota hint for one plan cap, e.g. "3 of 5 active announcements".
export default function QuotaNotice({ kind, quotas: provided }) {
  const { t } = useI18n();
  const own = useResource(provided ? null : '/quotas', { events: QUOTA_EVENTS });
  const resource = provided || own;
  if (resource.error) {
    return <p className="field-error quota-notice" role="alert">{t('adExtras.quota.failed')}{' '}
      <button className="text-link" type="button" onClick={resource.reload}>{t('common.actions.retry')}</button></p>;
  }
  const usage = resource.data?.[kind];
  if (!usage) return null;
  return (
    <p className={`quota-notice ${usage.remaining === 0 ? 'quota-full' : ''}`}>
      {usage.limit === null
        ? t(`adExtras.quota.${kind}.unlimited`, { count: usage.used })
        : t(`adExtras.quota.${kind}.limited`, { count: usage.limit, used: usage.used, limit: usage.limit })}
      {usage.remaining === 0 && <> {t(`adExtras.quota.${kind}.full`)}</>}
    </p>
  );
}
