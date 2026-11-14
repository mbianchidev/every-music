import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';

// "Publish as" selector for announcements: yourself, or a page where you may
// post announcements. Renders nothing when you have no such page.
export default function AnnouncementOrganizationField({ value, current, onChange, disabled }) {
  const { t } = useI18n();
  const resource = useResource('/organizations/mine', { reconnect: false });
  const pages = (resource.data?.organizations ?? []).filter(item => item.managed && item.permissions.includes('post_announcements'));
  if (current && !pages.some(item => item.id === current.id)) pages.push(current);
  if (resource.error) return <p className="field-error" role="alert">{t('organizations.announcement.loadError', { message: resource.error })} <button className="text-link" type="button" onClick={resource.reload}>{t('organizations.common.retry')}</button></p>;
  if (!pages.length) return null;
  return (
    <FormField id="announcement-organization" label={t('organizations.announcement.publishAs')} hint={t('organizations.announcement.hint')}>
      <select className="input" value={value || ''} disabled={disabled} onChange={event => onChange(event.target.value || null)}>
        <option value="">{t('organizations.announcement.myself')}</option>
        {pages.map(page => <option key={page.id} value={page.id}>{page.name} ({t(`organizations.kinds.${page.kind}`)})</option>)}
      </select>
    </FormField>
  );
}
