import { useI18n } from '../lib/i18n.js';

const ErrorState = ({
  title,
  message,
  onRetry,
}) => {
  const { t } = useI18n();
  return (
    <div className="card" role="alert">
      <p className="eyebrow">{t('ui.errorState.eyebrow')}</p>
      <h2 className="heading-md">{title || t('ui.errorState.title')}</h2>
      <p className="body-muted">{message || t('ui.errorState.message')}</p>
      {onRetry && (
        <button className="btn btn-secondary" type="button" onClick={onRetry}>
          {t('ui.errorState.retry')}
        </button>
      )}
    </div>
  );
};

export default ErrorState;
