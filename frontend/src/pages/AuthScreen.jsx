import { Component } from 'react';
import conduit from '../lib/conduit.js';
import { finishSignIn } from '../lib/sign-in.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';
import GoogleSignIn from '../components/GoogleSignIn.jsx';
import TwoStepSignIn from '../components/TwoStepSignIn.jsx';
import { t } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';
import LanguageSelect from '../components/LanguageSelect.jsx';

class AuthScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      email: '',
      password: '',
      error: '',
      errorCode: '',
      loading: false,
      message: props.route?.query.get('signedOut') === 'local-only' ? t('auth.login.signedOutLocal')
        : props.route?.query.get('signedOut') === 'everywhere' ? t('accountSecurity.signedOutEverywhere')
          : props.route?.query.has('accountDeleted') ? t('accountSecurity.accountDeleted') : '',
      challenge: null,
    };
  }

  handleLogin = async (event) => {
    event.preventDefault();
    const { email, password } = this.state;

    if (!email.includes('@') || !password) {
      this.setState({ error: t('auth.login.missing'), errorCode: '' });
      return;
    }

    this.setState({ loading: true, error: '', errorCode: '', message: '' });

    try {
      const response = await conduit.transmit('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      if (response.twoFactorRequired) {
        this.setState({ challenge: response, password: '', loading: false });
        return;
      }
      finishSignIn(response);
    } catch (error) {
      this.setState({
        error: errorText(error),
        errorCode: error.code,
        loading: false,
      });
    }
  };

  handleResend = async () => {
    this.setState({ loading: true, error: '', message: '' });

    try {
      await conduit.transmit('/auth/resend-verification', {
        method: 'POST',
        body: { email: this.state.email },
      });
      this.setState({ loading: false, message: t('auth.login.resent') });
    } catch (error) {
      this.setState({ loading: false, error: errorText(error) });
    }
  };

  render() {
    const { email, password, error, errorCode, loading, message, challenge } = this.state;

    if (challenge) {
      return (
        <div className="container-narrow center-content">
          <div style={{ width: '100%' }}>
            <PageHeader eyebrow={t('auth.login.eyebrow')} title={t('auth.login.title')} />
            <TwoStepSignIn challenge={challenge} onCancel={() => this.setState({ challenge: null })} />
          </div>
        </div>
      );
    }

    return (
      <div className="container-narrow center-content">
        <div style={{ width: '100%' }}>
          <LanguageSelect compact />
          <PageHeader
            eyebrow={t('auth.login.eyebrow')}
            title={t('auth.login.title')}
            subtitle={t('auth.login.subtitle')}
          />

          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="success" role="status">{message}</div>}

          <form className="form-stack" onSubmit={this.handleLogin}>
            <FormField id="login-email" label={t('auth.fields.email')} required>
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

            <FormField id="login-password" label={t('auth.fields.password')} required>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(event) => this.setState({ password: event.target.value })}
                autoComplete="current-password"
                disabled={loading}
              />
            </FormField>

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? t('auth.login.submitting') : t('auth.login.submit')}
            </button>

            <button className="text-link" type="button" onClick={() => { window.location.hash = '#forgot-password'; }}>
              {t('auth.login.forgot')}
            </button>

            {errorCode === 'EMAIL_NOT_VERIFIED' && (
              <button className="btn btn-secondary" type="button" onClick={this.handleResend} disabled={loading}>
                {t('auth.login.resend')}
              </button>
            )}

            <p>
              {t('auth.login.newMember')}{' '}
              <button className="text-link" type="button" onClick={() => { window.location.hash = '#register'; }}>
                {t('auth.login.createAccount')}
              </button>
            </p>
          </form>
          <GoogleSignIn onTwoFactor={nextChallenge => this.setState({ challenge: nextChallenge, error: '', message: '' })} />
        </div>
      </div>
    );
  }
}

export default AuthScreen;
