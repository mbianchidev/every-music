import { Component } from 'react';
import conduit from '../lib/conduit.js';
import FormField from '../components/FormField.jsx';
import { t } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

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
      this.setState({ error: t('auth.reset.incomplete') });
      return;
    }

    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      this.setState({ error: t('auth.reset.passwordRules') });
      return;
    }

    if (password !== confirmPassword) {
      this.setState({ error: t('auth.register.mismatch') });
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
      this.setState({ loading: false, error: errorText(error) });
    }
  };

  render() {
    const { password, confirmPassword, loading, error, success } = this.state;

    return (
      <div className="container-narrow center-content">
        <div className="card" style={{ width: '100%' }}>
          <p className="eyebrow">{t('auth.recovery')}</p>
          <h1 className="heading-lg">{t('auth.reset.title')}</h1>
          {error && <div className="error" role="alert">{error}</div>}
          {success ? (
            <>
              <div className="success" role="status">{t('auth.reset.done')}</div>
              <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#login'; }}>
                {t('auth.login.submit')}
              </button>
            </>
          ) : (
            <form className="form-stack" onSubmit={this.handleSubmit}>
              <FormField id="reset-password" label={t('auth.fields.newPassword')} required>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(event) => this.setState({ password: event.target.value })}
                  autoComplete="new-password"
                  disabled={loading}
                />
              </FormField>
              <FormField id="reset-confirm-password" label={t('auth.fields.confirmNewPassword')} required>
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
                {loading ? t('auth.reset.submitting') : t('auth.reset.submit')}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }
}

export default ResetPasswordScreen;
