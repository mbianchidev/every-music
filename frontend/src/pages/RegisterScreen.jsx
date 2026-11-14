import { Component } from 'react';
import conduit from '../lib/conduit.js';
import { t } from '../lib/i18n.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';
import GoogleSignIn from '../components/GoogleSignIn.jsx';

class RegisterScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      email: '',
      password: '',
      confirmPassword: '',
      error: '',
      loading: false,
      successMessage: '',
      acceptTerms: false,
      termsVersion: '',
      termsError: '',
    };
  }

  componentDidMount() {
    this.loadTerms();
  }

  loadTerms = async () => {
    this.setState({ termsError: '' });
    try {
      const legal = await conduit.transmit('/legal');
      this.setState({ termsVersion: legal.termsVersion });
    } catch (error) {
      console.error('The current Terms of Use could not be loaded', error);
      this.setState({ termsError: error.message });
    }
  };

  inviteCode() {
    const code = this.props.route?.query.get('invite')?.trim().toUpperCase();
    return code && /^[A-Z2-9]{8,16}$/.test(code) ? code : '';
  }

  validate() {
    const { email, password, confirmPassword } = this.state;

    if (!email.includes('@')) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      return 'Password needs uppercase, lowercase, and a number.';
    }
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (!this.state.acceptTerms) return t('legal.register.required');
    return '';
  }

  handleRegister = async (event) => {
    event.preventDefault();
    const validationError = this.validate();

    if (validationError) {
      this.setState({ error: validationError });
      return;
    }

    this.setState({ loading: true, error: '' });

    try {
      const response = await conduit.transmit('/auth/register', {
        method: 'POST',
        body: {
          email: this.state.email,
          password: this.state.password,
          acceptedTermsVersion: this.state.termsVersion,
          ...(this.inviteCode() ? { inviteCode: this.inviteCode() } : {}),
        },
      });
      this.setState({
        successMessage: response.message,
        loading: false,
      });
    } catch (error) {
      this.setState({ error: error.message, loading: false });
      if (error.code === 'TERMS_VERSION_CHANGED') this.setState({ acceptTerms: false }, this.loadTerms);
    }
  };

  renderSuccess() {
    return (
      <div className="container-narrow center-content">
        <div className="card" style={{ width: '100%' }}>
          <p className="eyebrow">Account created</p>
          <h1 className="heading-lg">Check your email</h1>
          <div className="success" role="status">{this.state.successMessage}</div>
          <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#login'; }}>
            Go to sign in
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { email, password, confirmPassword, error, loading, successMessage, acceptTerms, termsVersion, termsError } = this.state;
    const newTab = (href, label) => <a href={href} target="_blank" rel="noopener">{label}<span className="sr-only"> {t('legal.newTab')}</span></a>;
    const [beforeTerms, afterTerms = ''] = t('legal.register.read').split('{terms}');
    const [betweenLinks, afterPrivacy = ''] = afterTerms.split('{privacy}');

    if (successMessage) {
      return this.renderSuccess();
    }

    return (
      <div className="container-narrow center-content">
        <div style={{ width: '100%' }}>
          <PageHeader
            eyebrow="New member"
            title="Find your people"
            subtitle="Create your account, verify your email, then build your profile."
          />

          {this.inviteCode() && <p className="status-message">{t('monetization.register.invited')}</p>}
          {error && <div className="error" role="alert">{error}</div>}

          <form className="form-stack" onSubmit={this.handleRegister}>
            <FormField id="register-email" label="Email" required>
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

            <FormField
              id="register-password"
              label="Password"
              hint="At least 8 characters with uppercase, lowercase, and a number."
              required
            >
              <input
                type="password"
                className="input"
                value={password}
                onChange={(event) => this.setState({ password: event.target.value })}
                autoComplete="new-password"
                disabled={loading}
              />
            </FormField>

            <FormField id="register-confirm-password" label="Confirm password" required>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(event) => this.setState({ confirmPassword: event.target.value })}
                autoComplete="new-password"
                disabled={loading}
              />
            </FormField>

            <div className="consent-field">
              {termsError ? <p className="field-error" role="alert">
                {t('legal.register.unavailable')} {termsError}{' '}
                <button className="text-link" type="button" onClick={this.loadTerms}>{t('legal.register.retry')}</button>
              </p> : <>
                <label className="checkbox-label" htmlFor="register-terms">
                  <input id="register-terms" type="checkbox" checked={acceptTerms} disabled={loading || !termsVersion}
                    aria-describedby="register-terms-hint" onChange={(event) => this.setState({ acceptTerms: event.target.checked })} />
                  {t('legal.register.accept', { version: termsVersion || '...' })}
                </label>
                <p className="field-hint" id="register-terms-hint">
                  {beforeTerms}{newTab('#legal?page=terms', t('legal.register.terms'))}{betweenLinks}{newTab('#legal?page=privacy', t('legal.register.privacy'))}{afterPrivacy}
                </p>
              </>}
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading || !termsVersion}>
              {loading ? 'Creating account...' : 'Create account'}
            </button>

            <p>
              Already a member?{' '}
              <button className="text-link" type="button" onClick={() => { window.location.hash = '#login'; }}>
                Sign in
              </button>
            </p>
          </form>
          <GoogleSignIn />
        </div>
      </div>
    );
  }
}

export default RegisterScreen;
