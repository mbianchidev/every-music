import { useI18n } from '../lib/i18n.js';

const Spinner = ({ label }) => {
  const { t } = useI18n();
  return (
    <div className="loading-state" role="status">
      <div className="spinner" aria-hidden="true" />
      <span className="sr-only">{label || t('ui.loading')}</span>
    </div>
  );
};

export default Spinner;
