import { useI18n } from '../lib/i18n.js';
import LanguageSelect from './LanguageSelect.jsx';

export default function LanguageSettings() {
  const { t } = useI18n();
  return (
    <section className="detail-section" aria-labelledby="language-heading">
      <h2 className="heading-md" id="language-heading">{t('settings.language.heading')}</h2>
      <p id="language-description">{t('settings.language.description')}</p>
      <LanguageSelect describedBy="language-description" />
    </section>
  );
}
