import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Navigation from '../components/Navigation.jsx';
import FormField from '../components/FormField.jsx';

class CreatePostScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { title: '', description: '', city: '', isRemote: false, error: '', saving: false };
  }
  
  handleCreate = async () => {
    const { title, description, city, isRemote } = this.state;
    
    if (!title) {
      this.setState({ error: 'Title is required' });
      return;
    }
    
    if (!description) {
      this.setState({ error: 'Description is required' });
      return;
    }
    
    this.setState({ saving: true, error: '' });
    
    try {
      await conduit.transmit('/announcements/', {
        method: 'POST',
        auth: true,
        body: { title, description, city, isRemote, isCoverBand: false, instrumentIds: [], genreIds: [] }
      });
      window.location.hash = '#my-posts';
    } catch (err) {
      this.setState({ error: err.message, saving: false });
    }
  };
  
  render() {
    const { title, description, city, isRemote, error, saving } = this.state;
    
    return (
      <div className="container">
        <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
          <h1 className="heading-lg">CREATE ANNOUNCEMENT</h1>
        </div>
        
        {error && <div className="error">{error}</div>}
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', paddingBottom: '6rem' }}>
          <FormField label="Title" required>
            <input type="text" className="input" value={title} onChange={e => this.setState({ title: e.target.value })} placeholder="Looking for a bassist" disabled={saving} />
          </FormField>
          
          <FormField label="Description" required>
            <textarea className="input" style={{ minHeight: '150px', resize: 'vertical' }} value={description} onChange={e => this.setState({ description: e.target.value })} placeholder="Describe what you're looking for..." disabled={saving} />
          </FormField>
          
          <FormField label="City">
            <input type="text" className="input" value={city} onChange={e => this.setState({ city: e.target.value })} placeholder="Los Angeles" disabled={saving} />
          </FormField>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <input type="checkbox" id="remote" checked={isRemote} onChange={e => this.setState({ isRemote: e.target.checked })} disabled={saving} style={{ width: '20px', height: '20px' }} />
            <label htmlFor="remote">Remote collaboration OK</label>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={this.handleCreate} disabled={saving}>
              {saving ? 'POSTING...' : '📢 POST'}
            </button>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => window.location.hash = '#feed'} disabled={saving}>
              CANCEL
            </button>
          </div>
        </div>
        
        <Navigation active="create" />
      </div>
    );
  }
}

export default CreatePostScreen;
