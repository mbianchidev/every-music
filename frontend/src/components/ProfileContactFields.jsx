import { useI18n } from '../lib/i18n.js';
import FormField from './FormField.jsx';

export default function ProfileContactFields({ websiteUrl, telegramId, onChange, disabled }) {
  const { t } = useI18n();
  return (
    <fieldset disabled={disabled}>
      <legend>{t('organizations.profile.contacts')}</legend>
      <p className="field-hint">{t('organizations.profile.contactsHint')}</p>
      <div className="form-grid">
        <FormField id="profile-website" label={t('organizations.profile.website')}>
          <input className="input" type="url" value={websiteUrl} maxLength="2048" autoComplete="url" onChange={event => onChange('websiteUrl', event.target.value)} />
        </FormField>
        <FormField id="profile-telegram" label={t('organizations.profile.telegram')}>
          <input className="input" value={telegramId} maxLength="100" onChange={event => onChange('telegramId', event.target.value)} />
        </FormField>
      </div>
    </fieldset>
  );
}
