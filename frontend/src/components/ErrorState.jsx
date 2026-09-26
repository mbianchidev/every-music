const ErrorState = ({
  title = 'Could not load this page',
  message,
  onRetry,
}) => (
  <div className="card" role="alert">
    <p className="eyebrow">Connection problem</p>
    <h2 className="heading-md">{title}</h2>
    <p className="body-muted">{message || 'Check your connection and try again.'}</p>
    {onRetry && (
      <button className="btn btn-secondary" type="button" onClick={onRetry}>
        TRY AGAIN
      </button>
    )}
  </div>
);

export default ErrorState;
