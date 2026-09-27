import { Component } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';

class AuthScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      email: '',
      password: '',
      error: '',
      errorCode: '',
      loading: false,
      message: '',
    };
  }

  handleLogin = async (event) => {
    event.preventDefault();
    const { email, password } = this.state;

    if (!email.includes('@') || !password) {
      this.setState({ error: 'Enter your email and password.', errorCode: '' });
      return;
    }

    this.setState({ loading: true, error: '', errorCode: '', message: '' });

    try {
      const response = await conduit.transmit('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      nucleus.login(response.user, {
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
      });
      window.location.hash = '#feed';
    } catch (error) {
      this.setState({
        error: error.message,
        errorCode: error.code,
        loading: false,
      });
    }
  };

  handleResend = async () => {
    this.setState({ loading: true, error: '', message: '' });

    try {
      const response = await conduit.transmit('/auth/resend-verification', {
        method: 'POST',
        body: { email: this.state.email },
      });
      this.setState({ loading: false, message: response.message });
    } catch (error) {
      this.setState({ loading: false, error: error.message });
    }
  };

  render() {
    const { email, password, error, errorCode, loading, message } = this.state;

    return (
      <div className="container-narrow center-content">
        <div style={{ width: '100%' }}>
          <PageHeader
            eyebrow="Member access"
            title="WELCOME BACK"
            subtitle="Sign in to your musician profile."
          />

          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="success" role="status">{message}</div>}

          <form className="form-stack" onSubmit={this.handleLogin}>
            <FormField id="login-email" label="Email" required>
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

            <FormField id="login-password" label="Password" required>
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
              {loading ? 'SIGNING IN…' : 'SIGN IN'}
            </button>

            <button className="text-link" type="button" onClick={() => { window.location.hash = '#forgot-password'; }}>
              Forgot your password?
            </button>

            {errorCode === 'EMAIL_NOT_VERIFIED' && (
              <button className="btn btn-secondary" type="button" onClick={this.handleResend} disabled={loading}>
                RESEND VERIFICATION EMAIL
              </button>
            )}

            <p>
              New to Every.music?{' '}
              <button className="text-link" type="button" onClick={() => { window.location.hash = '#register'; }}>
                Create an account
              </button>
            </p>
          </form>
        </div>
      </div>
    );
  }
}

export default AuthScreen;
