import { Component } from 'react';
import conduit from '../lib/conduit.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';

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
    };
  }

  validate() {
    const { email, password, confirmPassword } = this.state;

    if (!email.includes('@')) return 'Enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      return 'Password needs uppercase, lowercase, and a number.';
    }
    if (password !== confirmPassword) return 'Passwords do not match.';
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
        },
      });
      this.setState({
        successMessage: response.message,
        loading: false,
      });
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  };

  renderSuccess() {
    return (
      <div className="container-narrow center-content">
        <div className="card" style={{ width: '100%' }}>
          <p className="eyebrow">Account created</p>
          <h1 className="heading-lg">CHECK YOUR EMAIL</h1>
          <div className="success" role="status">{this.state.successMessage}</div>
          <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#login'; }}>
            GO TO SIGN IN
          </button>
        </div>
      </div>
    );
  }

  render() {
    const { email, password, confirmPassword, error, loading, successMessage } = this.state;

    if (successMessage) {
      return this.renderSuccess();
    }

    return (
      <div className="container-narrow center-content">
        <div style={{ width: '100%' }}>
          <PageHeader
            eyebrow="New member"
            title="JOIN THE BAND"
            subtitle="Create your account, verify your email, then build your profile."
          />

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

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
            </button>

            <p>
              Already a member?{' '}
              <button className="text-link" type="button" onClick={() => { window.location.hash = '#login'; }}>
                Sign in
              </button>
            </p>
          </form>
        </div>
      </div>
    );
  }
}

export default RegisterScreen;
