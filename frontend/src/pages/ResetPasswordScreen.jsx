import { Component } from 'react';
import conduit from '../lib/conduit.js';
import FormField from '../components/FormField.jsx';

class ResetPasswordScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      password: '',
      confirmPassword: '',
      loading: false,
      error: '',
      success: false,
    };
  }

  handleSubmit = async (event) => {
    event.preventDefault();
    const token = this.props.route.query.get('token');
    const { password, confirmPassword } = this.state;

    if (!token) {
      this.setState({ error: 'This password reset link is incomplete.' });
      return;
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      this.setState({ error: 'Password needs 8 characters, uppercase, lowercase, and a number.' });
      return;
    }

    if (password !== confirmPassword) {
      this.setState({ error: 'Passwords do not match.' });
      return;
    }

    this.setState({ loading: true, error: '' });

    try {
      await conduit.transmit('/auth/password-reset/complete', {
        method: 'POST',
        body: { token, newPassword: password },
      });
      this.setState({ loading: false, success: true });
    } catch (error) {
      this.setState({ loading: false, error: error.message });
    }
  };

  render() {
    const { password, confirmPassword, loading, error, success } = this.state;

    return (
      <div className="container-narrow center-content">
        <div className="card" style={{ width: '100%' }}>
          <p className="eyebrow">Account recovery</p>
          <h1 className="heading-lg">RESET PASSWORD</h1>
          {error && <div className="error" role="alert">{error}</div>}
          {success ? (
            <>
              <div className="success" role="status">Password updated. All previous sessions were signed out.</div>
              <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#login'; }}>
                SIGN IN
              </button>
            </>
          ) : (
            <form className="form-stack" onSubmit={this.handleSubmit}>
              <FormField id="reset-password" label="New password" required>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(event) => this.setState({ password: event.target.value })}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </FormField>
              <FormField id="reset-confirm-password" label="Confirm new password" required>
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
                {loading ? 'UPDATING…' : 'UPDATE PASSWORD'}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }
}

export default ResetPasswordScreen;
