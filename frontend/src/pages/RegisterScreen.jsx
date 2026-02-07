import { Component } from 'react';
import conduit from '../lib/conduit.js';
import FormField from '../components/FormField.jsx';

class RegisterScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { email: '', password: '', confirmPwd: '', error: '', loading: false, success: false };
  }
  
  handleRegister = async () => {
    const { email, password, confirmPwd } = this.state;
    
    if (!email.includes('@')) {
      this.setState({ error: 'Valid email required' });
      return;
    }
    
    if (password.length < 8) {
      this.setState({ error: 'Password must be at least 8 characters' });
      return;
    }
    
    if (password !== confirmPwd) {
      this.setState({ error: 'Passwords do not match' });
      return;
    }
    
    this.setState({ loading: true, error: '' });
    
    try {
      await conduit.transmit('/auth/register', { method: 'POST', body: { email, password } });
      this.setState({ success: true, loading: false });
    } catch (err) {
      this.setState({ error: err.message, loading: false });
    }
  };
  
  render() {
    const { email, password, confirmPwd, error, loading, success } = this.state;
    
    if (success) {
      return (
        <div className="container-narrow" style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: '100%' }}>
            <h1 className="heading-lg">CHECK YOUR EMAIL! 📬</h1>
            <div className="success">We sent a verification link to {email}</div>
            <p style={{ marginBottom: '2rem' }}>Click the link in the email to verify your account, then come back here to log in.</p>
            <button className="btn btn-primary" onClick={() => window.location.hash = '#login'}>GO TO LOGIN</button>
          </div>
        </div>
      );
    }
    
    return (
      <div className="container-narrow" style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ width: '100%' }}>
          <h1 className="heading-lg">JOIN THE BAND</h1>
          <p style={{ opacity: 0.7, marginBottom: '2rem' }}>Create your musician profile</p>
          
          {error && <div className="error">{error}</div>}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <FormField label="Email">
              <input type="email" className="input" value={email} onChange={e => this.setState({ email: e.target.value })} placeholder="your@email.com" disabled={loading} />
            </FormField>
            
            <FormField label="Password">
              <input type="password" className="input" value={password} onChange={e => this.setState({ password: e.target.value })} placeholder="••••••••" disabled={loading} />
            </FormField>
            
            <FormField label="Confirm Password">
              <input type="password" className="input" value={confirmPwd} onChange={e => this.setState({ confirmPwd: e.target.value })} placeholder="••••••••" disabled={loading} />
            </FormField>
            
            <button className="btn btn-primary" onClick={this.handleRegister} disabled={loading}>
              {loading ? 'CREATING ACCOUNT...' : 'CREATE ACCOUNT'}
            </button>
            
            <div style={{ textAlign: 'center', marginTop: '2rem' }}>
              <p>Already have an account? <span style={{ color: '#00F5FF', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => window.location.hash = '#login'}>Log in</span></p>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default RegisterScreen;
