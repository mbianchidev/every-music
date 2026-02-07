const EmptyState = ({ title, message, actionLabel, actionHash }) => (
  <div className="card">
    <h2 className="heading-md">{title}</h2>
    {message && <p style={{ opacity: 0.7, margin: '1rem 0' }}>{message}</p>}
    {actionLabel && (
      <button className="btn btn-primary" style={{ marginTop: message ? 0 : '1.5rem' }} onClick={() => window.location.hash = actionHash}>
        {actionLabel}
      </button>
    )}
  </div>
);

export default EmptyState;
