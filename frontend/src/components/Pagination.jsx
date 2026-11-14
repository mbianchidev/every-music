import { useI18n } from '../lib/i18n.js';

export default function Pagination({ pagination, onPage, disabled = false, label }) {
  const { t } = useI18n();
  if (!pagination || (pagination.page === 1 && !pagination.hasMore)) return null;
  return (
    <nav className="pagination" aria-label={label || t('ui.pagination.label')}>
      <button className="btn btn-ghost" type="button" disabled={disabled || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>{t('ui.pagination.previous')}</button>
      <span role="status" aria-atomic="true">{t('ui.pagination.page', { page: pagination.page })}</span>
      <button className="btn btn-secondary" type="button" disabled={disabled || !pagination.hasMore} onClick={() => onPage(pagination.page + 1)}>{t('ui.pagination.next')}</button>
    </nav>
  );
}
