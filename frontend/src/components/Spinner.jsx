const Spinner = ({ label = 'Loading' }) => (
  <div className="loading-state" role="status">
    <div className="spinner" aria-hidden="true" />
    <span className="sr-only">{label}</span>
  </div>
);

export default Spinner;
