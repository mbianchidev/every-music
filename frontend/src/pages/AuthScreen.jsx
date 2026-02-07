import { Component } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import FormField from '../components/FormField.jsx';

class AuthScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { email: '', password: '', error: '', loading: false };
  }
  
  handleLogin = async () => {
    const { email, password } = this.state;
    
    if (!email.includes('@')) {
      this.setState({ error: 'Valid email required' });
      return;
    }
    
    if (password.length < 8) {
      this.setState({ error: 'Password must be at least 8 characters' });
      return;
    }
    
    this.setState({ loading: true, error: '' });
    
    try {
      const resp = await conduit.transmit('/auth/login', { method: 'POST', body: { email, password } });
      nucleus.login(resp.user, { accessToken: resp.accessToken, refreshToken: resp.refreshToken });
      window.location.hash = '#feed';
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
  };
  
  render() {
    const { email, password, error, loading } = this.state;
    
    return (
      <div className="container-narrow" style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '100%' }}>
          <h1 className="heading-lg">WELCOME BACK</h1>
          <p style={{ opacity: 0.7, marginBottom: '2rem' }}>Log in to your musician profile</p>
          
          {error && <div className="error">{error}</div>}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Email">
              <input type="email" className="input" value={email} onChange={e => this.setState({ email: e.target.value })} placeholder="your@email.com" disabled={loading} />
            </FormField>
            
            <FormField label="Password">
              <input type="password" className="input" value={password} onChange={e => this.setState({ password: e.target.value })} placeholder="••••••••" disabled={loading} />
            </FormField>
            
            <button className="btn btn-primary" onClick={this.handleLogin} disabled={loading}>
              {loading ? 'LOGGING IN...' : 'LOG IN'}
            </button>
            
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <p>New to Every.music? <span style={{ color: '#00F5FF', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => window.location.hash = '#register'}>Create account</span></p>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default AuthScreen;
