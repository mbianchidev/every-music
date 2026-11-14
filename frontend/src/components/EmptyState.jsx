const EmptyState = ({ title, message, actionLabel, actionHash }) => (
  <section className="card empty-state">
    <h2 className="heading-md">{title}</h2>
    {message && <p className="body-muted">{message}</p>}
    {actionLabel && (
      <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = actionHash; }}>
        {actionLabel}
      </button>
    )}
  </section>
);

export default EmptyState;
