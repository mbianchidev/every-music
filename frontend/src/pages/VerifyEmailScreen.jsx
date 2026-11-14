import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Spinner from '../components/Spinner.jsx';
import { t } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

class VerifyEmailScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      loading: true,
      error: '',
      message: '',
    };
  }

  componentDidMount() {
    this.verify();
  }

  verify = async () => {
    const token = this.props.route.query.get('token');
    if (!token) {
      this.setState({ loading: false, error: t('auth.verify.incomplete') });
      return;
    }

    try {
      await conduit.transmit(`/auth/verify-email?token=${encodeURIComponent(token)}`);
      this.setState({ loading: false, message: t('auth.verify.done') });
    } catch (error) {
      this.setState({ loading: false, error: errorText(error) });
    }
  };

  render() {
    const { loading, error, message } = this.state;

    return (
      <div className="container-narrow center-content">
        <div className="card" style={{ width: '100%' }}>
          <p className="eyebrow">{t('auth.verify.eyebrow')}</p>
          <h1 className="heading-lg">{t('auth.verify.title')}</h1>
          {loading && <Spinner label={t('auth.verify.loading')} />}
          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="success" role="status">{message}</div>}
          {!loading && (
            <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#login'; }}>
              {t('auth.goToSignIn')}
            </button>
          )}
        </div>
      </div>
    );
  }
}

export default VerifyEmailScreen;
