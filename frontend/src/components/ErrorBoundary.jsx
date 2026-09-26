import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Every.music interface crashed', { error, info });
  }

  handleReset = () => {
    this.setState({ error: null });
    window.location.hash = '#feed';
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main className="container-narrow center-content" id="main-content" tabIndex="-1">
        <div className="card" role="alert">
          <p className="eyebrow">Something went wrong</p>
          <h1 className="heading-lg">THE AMP CUT OUT</h1>
          <p className="body-muted">The interface hit an unexpected error. Your account data is still safe.</p>
          <button className="btn btn-primary" type="button" onClick={this.handleReset}>
            RETURN TO THE FEED
          </button>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
