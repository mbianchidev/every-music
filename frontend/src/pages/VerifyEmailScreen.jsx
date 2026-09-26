import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Spinner from '../components/Spinner.jsx';

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
      this.setState({ loading: false, error: 'This verification link is incomplete.' });
      return;
    }

    try {
      const response = await conduit.transmit(`/auth/verify-email?token=${encodeURIComponent(token)}`);
      this.setState({ loading: false, message: response.message });
    } catch (error) {
      this.setState({ loading: false, error: error.message });
    }
  };

  render() {
    const { loading, error, message } = this.state;

    return (
      <div className="container-narrow center-content">
        <div className="card" style={{ width: '100%' }}>
          <p className="eyebrow">Account verification</p>
          <h1 className="heading-lg">VERIFY YOUR EMAIL</h1>
          {loading && <Spinner label="Verifying your email" />}
          {error && <div className="error" role="alert">{error}</div>}
          {message && <div className="success" role="status">{message}</div>}
          {!loading && (
            <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#login'; }}>
              GO TO SIGN IN
            </button>
          )}
        </div>
      </div>
    );
  }
}

export default VerifyEmailScreen;
