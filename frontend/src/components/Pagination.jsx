export default function Pagination({ pagination, onPage, disabled = false, label = 'Results pages' }) {
  if (!pagination || (pagination.page === 1 && !pagination.hasMore)) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <button className="btn btn-ghost" type="button" disabled={disabled || pagination.page <= 1} onClick={() => onPage(pagination.page - 1)}>Previous</button>
      <span role="status" aria-atomic="true">Page {pagination.page}</span>
      <button className="btn btn-secondary" type="button" disabled={disabled || !pagination.hasMore} onClick={() => onPage(pagination.page + 1)}>Next</button>
    </nav>
  );
}
