import { Component } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';

class ProfileScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { profile: null, loading: true };
  }
  
  componentDidMount() {
    this.loadProfile();
  }
  
  loadProfile = async () => {
    try {
      const data = await conduit.transmit('/profiles/me', { auth: true });
      this.setState({ profile: data, loading: false });
    } catch {
      this.setState({ loading: false });
    }
  };
  
  handleLogout = async () => {
    try {
      await conduit.transmit('/auth/logout', { method: 'POST', auth: true });
    } catch {}
    nucleus.logout();
    window.location.hash = '#login';
  };
  
  render() {
    const { profile, loading } = this.state;
    
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
          <h1 className="heading-lg">MY PROFILE</h1>
        </div>
        
        {!profile || !profile.artistName ? (
          <div className="card">
            <h2 className="heading-md">Complete Your Profile!</h2>
            <p style={{ opacity: 0.7, margin: '1rem 0' }}>Set up your musician profile to start connecting</p>
            <button className="btn btn-primary" onClick={() => window.location.hash = '#edit-profile'}>CREATE PROFILE</button>
          </div>
        ) : (
          <div className="card card-highlight">
            <div style={{ marginBottom: '2rem' }}>
              <h2 className="heading-md" style={{ color: '#F8F8F8' }}>{profile.artistName}</h2>
              {(profile.firstName || profile.lastName) && (
                <p style={{ opacity: 0.7 }}>{profile.firstName} {profile.lastName}</p>
              )}
            </div>
            
            {profile.bio && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 className="heading-md">BIO</h3>
                <p>{profile.bio}</p>
              </div>
            )}
            
            {profile.instruments && profile.instruments.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 className="heading-md">INSTRUMENTS</h3>
                {profile.instruments.map((inst, i) => (
                  <div key={i} style={{ padding: '0.75rem', background: '#1A1A1A', border: '2px solid #CCFF00', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 700 }}>{inst.name}</div>
                    <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                      {inst.years_experience} years • {inst.skill_level}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {profile.genres && profile.genres.length > 0 && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 className="heading-md">GENRES</h3>
                {profile.genres.map((genre, i) => (
                  <span key={i} style={{ padding: '0.5rem 1rem', background: '#FF006E', color: '#F8F8F8', fontWeight: 700, border: '2px solid #0A0A0A', display: 'inline-block', marginRight: '0.5rem', marginBottom: '0.5rem' }}>
                    {genre.name}
                  </span>
                ))}
              </div>
            )}
            
            {profile.city && (
              <div style={{ marginBottom: '2rem' }}>
                <h3 className="heading-md">LOCATION</h3>
                <p>
                  📍 {profile.city}
                  {profile.state && `, ${profile.state}`}
                  {profile.country && ` • ${profile.country}`}
                </p>
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => window.location.hash = '#edit-profile'}>✏️ EDIT</button>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={this.handleLogout}>🚪 LOGOUT</button>
            </div>
          </div>
        )}
        
        <Navigation active="profile" />
      </div>
    );
  }
}

export default ProfileScreen;
