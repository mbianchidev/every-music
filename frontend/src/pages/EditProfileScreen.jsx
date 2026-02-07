import { Component } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import FormField from '../components/FormField.jsx';

class EditProfileScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { artistName: '', firstName: '', lastName: '', city: '', bio: '', loading: true, saving: false, error: '' };
  }
  
  componentDidMount() {
    this.loadProfile();
  }
  
  loadProfile = async () => {
    try {
      const data = await conduit.transmit('/profiles/me', { auth: true });
      this.setState({
        artistName: data.artistName || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        city: data.city || '',
        bio: data.bio || '',
        loading: false
      });
    } catch {
      this.setState({ loading: false });
    }
  };
  
  handleSave = async () => {
    const { artistName, firstName, lastName, city, bio } = this.state;
    
    if (!artistName) {
      this.setState({ error: 'Artist name is required' });
      return;
    }
    
    this.setState({ saving: true, error: '' });
    
    try {
      const updated = await conduit.transmit('/profiles/me', {
        method: 'PUT',
        auth: true,
        body: { artistName, firstName, lastName, city, bio }
      });
      nucleus.mutate(updated);
      window.location.hash = '#profile';
    } catch (err) {
      this.setState({ error: err.message, saving: false });
    }
  };
  
  render() {
    const { artistName, firstName, lastName, city, bio, loading, saving, error } = this.state;
    
    if (loading) {
      return (
        <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Spinner />
        </div>
      );
    }
    
    return (
      <div className="container">
        <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
          <h1 className="heading-lg">EDIT PROFILE</h1>
        </div>
        
        {error && <div className="error">{error}</div>}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '6rem' }}>
          <FormField label="Artist Name" required>
            <input type="text" className="input" value={artistName} onChange={e => this.setState({ artistName: e.target.value })} placeholder="Your stage name" disabled={saving} />
          </FormField>
          
          <FormField label="First Name">
            <input type="text" className="input" value={firstName} onChange={e => this.setState({ firstName: e.target.value })} placeholder="First name" disabled={saving} />
          </FormField>
          
          <FormField label="Last Name">
            <input type="text" className="input" value={lastName} onChange={e => this.setState({ lastName: e.target.value })} placeholder="Last name" disabled={saving} />
          </FormField>
          
          <FormField label="City">
            <input type="text" className="input" value={city} onChange={e => this.setState({ city: e.target.value })} placeholder="Your city" disabled={saving} />
          </FormField>
          
          <FormField label="Bio">
            <textarea className="input" style={{ minHeight: '120px', resize: 'vertical' }} value={bio} onChange={e => this.setState({ bio: e.target.value })} placeholder="Tell us about yourself..." disabled={saving} />
          </FormField>
          
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={this.handleSave} disabled={saving}>
              {saving ? 'SAVING...' : '💾 SAVE'}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => window.location.hash = '#profile'} disabled={saving}>
              CANCEL
            </button>
          </div>
        </div>
        
        <Navigation active="profile" />
      </div>
    );
  }
}

export default EditProfileScreen;
