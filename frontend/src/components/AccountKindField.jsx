import { useI18n } from '../lib/i18n.js';

export default function AccountKindField({ value, onChange, disabled }) {
  const { t } = useI18n();
  return (
    <fieldset disabled={disabled}>
      <legend>{t('organizations.profile.accountKind')}</legend>
      {['artist', 'music_lover'].map(kind => <label className="checkbox-label" key={kind}>
        <input type="radio" name="account-kind" value={kind} checked={value === kind} onChange={() => onChange(kind)} />
        {t(`organizations.profile.kinds.${kind}`)}
      </label>)}
      <p className="field-hint">{value === 'music_lover' ? t('organizations.profile.musicLoverHint') : t('organizations.profile.artistHint')}</p>
    </fieldset>
  );
}
