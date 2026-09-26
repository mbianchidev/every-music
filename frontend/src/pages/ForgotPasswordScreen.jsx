import { Component } from 'react';
import conduit from '../lib/conduit.js';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';

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
      this.setState({ error: 'Enter a valid email address.' });
      return;
    }

    this.setState({ loading: true, error: '', message: '' });

    try {
      const response = await conduit.transmit('/auth/password-reset/initiate', {
        method: 'POST',
        body: { email },
      });
      this.setState({ loading: false, message: response.message });
    } catch (error) {
      this.setState({ loading: false, error: error.message });
    }
  };

  render() {
    const { email, loading, error, message } = this.state;

    return (
      <div className="container-narrow center-content">
        <div style={{ width: '100%' }}>
          <PageHeader
            eyebrow="Account recovery"
            title="RESET ACCESS"
            subtitle="We will email a secure password reset link if the account exists."
          />
          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="success" role="status">{message}</div>}

          <form className="form-stack" onSubmit={this.handleSubmit}>
            <FormField id="forgot-password-email" label="Email" required>
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
              {loading ? 'SENDING…' : 'SEND RESET LINK'}
            </button>
            <button className="text-link" type="button" onClick={() => { window.location.hash = '#login'; }}>
              Return to sign in
            </button>
          </form>
        </div>
      </div>
    );
  }
}

export default ForgotPasswordScreen;
