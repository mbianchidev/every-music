import { useI18n } from '../lib/i18n.js';
import { backFallback, goBack } from '../lib/back-navigation.js';
import Icon from './Icon.jsx';

export default function BackButton({ route, authorized }) {
  const { t } = useI18n();
  const fallback = backFallback(route, authorized);
  if (!fallback) return null;
  return (
    <div className="back-bar">
      <a className="back-link" href={fallback} onClick={event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        goBack(fallback);
      }}><Icon name="back" size={18} />{t('onboarding.back.label')}</a>
    </div>
  );
}
