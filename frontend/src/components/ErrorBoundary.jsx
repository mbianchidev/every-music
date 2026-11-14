import { Component } from 'react';
import { t } from '../lib/i18n.js';

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
          <p className="eyebrow">{t('app.crash.eyebrow')}</p>
          <h1 className="heading-lg">{t('app.crash.title')}</h1>
          <p className="body-muted">{t('app.crash.message')}</p>
          <button className="btn btn-primary" type="button" onClick={this.handleReset}>
            {t('app.crash.action')}
          </button>
        </div>
      </main>
    );
  }
}

export default ErrorBoundary;
