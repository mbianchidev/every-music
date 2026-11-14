import { Component } from 'react';
import conduit from '../lib/conduit.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { t } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

class ForgotPasswordScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      email: '',
      loading: false,
      error: '',
      message: '',
    };
  }

  handleSubmit = async (event) => {
    event.preventDefault();
    const email = this.state.email.trim();

    if (!email.includes('@')) {
      this.setState({ error: t('auth.register.invalidEmail') });
      return;
    }

    this.setState({ loading: true, error: '', message: '' });

    try {
      await conduit.transmit('/auth/password-reset/initiate', {
        method: 'POST',
        body: { email },
      });
      this.setState({ loading: false, message: t('auth.forgot.sent') });
    } catch (error) {
      this.setState({ loading: false, error: errorText(error) });
    }
  };

  render() {
    const { email, loading, error, message } = this.state;

    return (
      <div className="container-narrow center-content">
        <div style={{ width: '100%' }}>
          <PageHeader
            eyebrow={t('auth.recovery')}
            title={t('auth.forgot.title')}
            subtitle={t('auth.forgot.subtitle')}
          />
          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="success" role="status">{message}</div>}

          <form className="form-stack" onSubmit={this.handleSubmit}>
            <FormField id="forgot-password-email" label={t('auth.fields.email')} required>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(event) => this.setState({ email: event.target.value })}
                autoComplete="email"
                inputMode="email"
                disabled={loading}
              />
            </FormField>
            <button className="btn btn-primary" type="submit" disabled={loading || Boolean(message)}>
              {loading ? t('auth.forgot.sending') : t('auth.forgot.submit')}
            </button>
            <button className="text-link" type="button" onClick={() => { window.location.hash = '#login'; }}>
              {t('auth.forgot.back')}
            </button>
          </form>
        </div>
      </div>
    );
  }
}

export default ForgotPasswordScreen;
