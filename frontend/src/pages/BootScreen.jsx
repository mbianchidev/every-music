import { useI18n } from '../lib/i18n.js';
import Icon from '../components/Icon.jsx';

const BootScreen = () => {
  const { t } = useI18n();
  return (
    <div className="boot-screen" role="status">
      <span className="boot-emblem" aria-hidden="true"><Icon name="emblem" size={34} /></span>
      <p className="brand-mark" aria-hidden="true">Every<span className="brand-dot">.</span>music</p>
      <span className="sr-only">{t('onboarding.boot.starting')}</span>
    </div>
  );
};

export default BootScreen;
