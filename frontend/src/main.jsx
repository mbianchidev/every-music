import { Component } from 'react';
import { createRoot } from 'react-dom/client';

// Nucleus - Bitwise state with base64 compression
class Nucleus {
  constructor() {
    this.bits = 0;
    this.payload = { persona: null, keys: null, tools: [], sounds: [] };
    this.listeners = [];
    this.storageId = 'em_n3';
    this.rehydrate();
  }
  
  rehydrate() {
    try {
      const cached = sessionStorage.getItem(this.storageId);
      if (cached) {
        const unpacked = JSON.parse(atob(cached));
        this.payload = { ...this.payload, ...unpacked };
        this.bits = unpacked.persona && unpacked.keys ? 1 : 0;
      }
    } catch {}
  }
  
  persist() {
    if (this.bits & 1) {
      const packed = btoa(JSON.stringify({ persona: this.payload.persona, keys: this.payload.keys }));
      sessionStorage.setItem(this.storageId, packed);
    }
  }
  
  emit() {
    this.persist();
    this.listeners.forEach(fn => fn({ ...this.payload, authorized: !!(this.bits & 1) }));
  }
  
  subscribe(fn) {
    this.listeners.push(fn);
    fn({ ...this.payload, authorized: !!(this.bits & 1) });
    return () => { const i = this.listeners.indexOf(fn); if (i > -1) this.listeners.splice(i, 1); };
  }
  
  login(persona, keys) {
    this.bits |= 1;
    this.payload.persona = persona;
    this.payload.keys = keys;
    this.emit();
  }
  
  logout() {
    this.bits &= ~1;
    this.payload.persona = null;
    this.payload.keys = null;
    sessionStorage.removeItem(this.storageId);
    this.emit();
  }
  
  mutate(persona) {
    this.payload.persona = persona;
    this.emit();
  }
}

const nucleus = new Nucleus();

// Conduit - XHR protocol
class Conduit {
  constructor() {
    this.base = '/realm';
  }
  
  transmit(path, opts = {}) {
    return new Promise((res, rej) => {
      const x = new XMLHttpRequest();
      x.open(opts.method || 'GET', `${this.base}${path}`);
      x.setRequestHeader('Content-Type', 'application/json');
      
      if (opts.auth && nucleus.payload.keys?.accessToken) {
        x.setRequestHeader('Authorization', `Bearer ${nucleus.payload.keys.accessToken}`);
      }
      
      x.onload = () => {
        try {
          const d = JSON.parse(x.responseText);
          x.status < 300 ? res(d.data) : rej(new Error(d.error?.message || 'Failed'));
        } catch { rej(new Error('Parse error')); }
      };
      
      x.onerror = () => rej(new Error('Network error'));
      x.send(opts.body ? JSON.stringify(opts.body) : null);
    });
  }
}

const conduit = new Conduit();

// Inline styles
const styles = `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Work Sans', sans-serif; background: #0A0A0A; color: #F8F8F8; overflow-x: hidden; }
@keyframes spin { to { transform: rotate(360deg); } }
.btn { padding: 1rem 2rem; font-family: 'Fredoka', sans-serif; font-size: 1.25rem; font-weight: 700; text-transform: uppercase; border: 4px solid #0A0A0A; cursor: pointer; box-shadow: 8px 8px 0 #0A0A0A; transition: all 0.15s; outline: none; }
.btn:hover { transform: translate(4px, 4px); box-shadow: 4px 4px 0 #0A0A0A; }
.btn:active { transform: translate(8px, 8px); box-shadow: none; }
.btn-primary { background: #FF006E; color: #F8F8F8; }
.btn-secondary { background: #00F5FF; color: #0A0A0A; }
.btn-tertiary { background: #CCFF00; color: #0A0A0A; }
.btn-ghost { background: transparent; color: #F8F8F8; border-color: #F8F8F8; }
.input { width: 100%; padding: 1rem; font-size: 1.125rem; border: 4px solid #F8F8F8; background: #2B2B2B; color: #F8F8F8; outline: none; }
.input:focus { border-color: #00F5FF; box-shadow: 0 0 0 4px rgba(0,245,255,0.2); }
.input::placeholder { color: rgba(248,248,248,0.4); }
.card { padding: 1.5rem; background: #2B2B2B; border: 4px solid #F8F8F8; margin-bottom: 1.5rem; }
.card-highlight { background: linear-gradient(135deg, #2B2B2B 0%, #1A1A1A 100%); border-color: #FF006E; }
.heading-xl { font-family: 'Fredoka', sans-serif; font-size: clamp(3rem, 8vw, 6rem); font-weight: 800; text-transform: uppercase; line-height: 0.9; margin-bottom: 1rem; }
.heading-lg { font-family: 'Fredoka', sans-serif; font-size: clamp(2rem, 5vw, 3.5rem); font-weight: 800; text-transform: uppercase; line-height: 1; margin-bottom: 1rem; }
.heading-md { font-family: 'Fredoka', sans-serif; font-size: clamp(1.5rem, 3vw, 2.5rem); font-weight: 700; line-height: 1.1; color: #00F5FF; margin-bottom: 1rem; }
.container { max-width: 1200px; margin: 0 auto; padding: 1.5rem; min-height: 100vh; }
.container-narrow { max-width: 600px; margin: 0 auto; padding: 1.5rem; min-height: 100vh; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; padding-bottom: 6rem; }
.nav { position: fixed; bottom: 0; left: 0; right: 0; background: #2B2B2B; border-top: 4px solid #F8F8F8; display: flex; justify-content: space-around; padding: 0.75rem; z-index: 1000; }
.nav-item { background: transparent; border: none; color: #F8F8F8; padding: 0.5rem 1rem; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 0.25rem; font-size: 0.875rem; font-weight: 600; outline: none; }
.nav-item-active { background: #FF006E; border: 2px solid #0A0A0A; }
.spinner { width: 60px; height: 60px; border: 4px solid #2B2B2B; border-top-color: #FF006E; border-radius: 50%; animation: spin 0.8s linear infinite; }
.error { padding: 1rem; background: rgba(255,0,110,0.2); border: 2px solid #FF006E; color: #FF006E; margin-bottom: 1rem; }
.success { padding: 1rem; background: rgba(204,255,0,0.2); border: 2px solid #CCFF00; color: #CCFF00; margin-bottom: 1rem; }
.tag { padding: 0.25rem 0.75rem; background: #00F5FF; color: #0A0A0A; font-size: 0.875rem; font-weight: 700; border: 2px solid #0A0A0A; display: inline-block; margin-right: 0.5rem; margin-bottom: 0.5rem; }
`;

// Boot Screen
class BootScreen extends Component {
  componentDidMount() {
    setTimeout(() => {
      const auth = nucleus.payload.keys !== null;
      window.location.hash = auth ? '#feed' : '#login';
    }, 1500);
  }
  
  render() {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column' }}>
        <h1 className="heading-xl" style={{ background: 'linear-gradient(135deg, #FF006E, #00F5FF)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textAlign: 'center' }}>
          EVERY<br/>MUSIC
        </h1>
        <p style={{ opacity: 0.7, textAlign: 'center' }}>Find your bandmates. Build your sound.</p>
      </div>
    );
  }
}

// Auth Screen
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
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email</label>
              <input type="email" className="input" value={email} onChange={e => this.setState({ email: e.target.value })} placeholder="your@email.com" disabled={loading} />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Password</label>
              <input type="password" className="input" value={password} onChange={e => this.setState({ password: e.target.value })} placeholder="••••••••" disabled={loading} />
            </div>
            
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

// Register Screen
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
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email</label>
              <input type="email" className="input" value={email} onChange={e => this.setState({ email: e.target.value })} placeholder="your@email.com" disabled={loading} />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Password</label>
              <input type="password" className="input" value={password} onChange={e => this.setState({ password: e.target.value })} placeholder="••••••••" disabled={loading} />
            </div>
            
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem' }}>Confirm Password</label>
              <input type="password" className="input" value={confirmPwd} onChange={e => this.setState({ confirmPwd: e.target.value })} placeholder="••••••••" disabled={loading} />
            </div>
            
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

// Feed Screen
class FeedScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { posts: [], loading: true };
  }
  
  componentDidMount() {
    this.loadPosts();
  }
  
  loadPosts = async () => {
    try {
      const resp = await conduit.transmit('/announcements/search');
      this.setState({ posts: resp.announcements || [], loading: false });
    } catch {
      this.setState({ loading: false });
    }
  };
  
  handleSave = async (id) => {
    try {
      await conduit.transmit(`/announcements/${id}/save`, { method: 'POST', auth: true });
      alert('Saved!');
    } catch (err) {
      alert(err.message);
    }
  };
  
  render() {
    const { posts, loading } = this.state;
    
    return (
      <div className="container">
        <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
          <h1 className="heading-lg">🎸 THE FEED</h1>
          <p style={{ opacity: 0.7 }}>Musicians looking for bandmates</p>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="card">
            <h2 className="heading-md">No announcements yet!</h2>
            <p>Be the first to post one</p>
            <button className="btn btn-primary" style={{ marginTop: '1.5rem' }} onClick={() => window.location.hash = '#create'}>
              CREATE ANNOUNCEMENT
            </button>
          </div>
        ) : (
          <div className="grid">
            {posts.map(post => (
              <div key={post.id} className="card">
                <h3 className="heading-md">{post.title}</h3>
                <p style={{ opacity: 0.8, marginBottom: '1rem', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                  {post.description}
                </p>
                
                {post.instruments && post.instruments.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    {post.instruments.slice(0, 3).map((inst, i) => (
                      <span key={i} className="tag">{inst.name}</span>
                    ))}
                  </div>
                )}
                
                <div style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1rem' }}>
                  <span>📍 {post.location?.city || 'Remote'}</span>
                  {post.isRemote && <span style={{ marginLeft: '0.5rem' }}>🌐 Remote</span>}
                </div>
                
                <button className="btn btn-tertiary" onClick={() => this.handleSave(post.id)}>💾 SAVE</button>
              </div>
            ))}
          </div>
        )}
        
        <Navigation active="feed" />
      </div>
    );
  }
}

// Profile Screen
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
          <div className="spinner" />
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

// Edit Profile Screen
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
          <div className="spinner" />
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
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Artist Name *</label>
            <input type="text" className="input" value={artistName} onChange={e => this.setState({ artistName: e.target.value })} placeholder="Your stage name" disabled={saving} />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>First Name</label>
            <input type="text" className="input" value={firstName} onChange={e => this.setState({ firstName: e.target.value })} placeholder="First name" disabled={saving} />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Last Name</label>
            <input type="text" className="input" value={lastName} onChange={e => this.setState({ lastName: e.target.value })} placeholder="Last name" disabled={saving} />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>City</label>
            <input type="text" className="input" value={city} onChange={e => this.setState({ city: e.target.value })} placeholder="Your city" disabled={saving} />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Bio</label>
            <textarea className="input" style={{ minHeight: '120px', resize: 'vertical' }} value={bio} onChange={e => this.setState({ bio: e.target.value })} placeholder="Tell us about yourself..." disabled={saving} />
          </div>
          
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

// Create Post Screen
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
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Title *</label>
            <input type="text" className="input" value={title} onChange={e => this.setState({ title: e.target.value })} placeholder="Looking for a bassist" disabled={saving} />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>Description *</label>
            <textarea className="input" style={{ minHeight: '150px', resize: 'vertical' }} value={description} onChange={e => this.setState({ description: e.target.value })} placeholder="Describe what you're looking for..." disabled={saving} />
          </div>
          
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem' }}>City</label>
            <input type="text" className="input" value={city} onChange={e => this.setState({ city: e.target.value })} placeholder="Los Angeles" disabled={saving} />
          </div>
          
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

// My Posts Screen
class MyPostsScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { posts: [], loading: true };
  }
  
  componentDidMount() {
    this.loadPosts();
  }
  
  loadPosts = async () => {
    try {
      const resp = await conduit.transmit('/announcements/me', { auth: true });
      this.setState({ posts: resp.announcements || [], loading: false });
    } catch {
      this.setState({ loading: false });
    }
  };
  
  handleDelete = async (id) => {
    if (!confirm('Delete this announcement?')) return;
    
    try {
      await conduit.transmit(`/announcements/${id}`, { method: 'DELETE', auth: true });
      this.setState({ posts: this.state.posts.filter(p => p.id !== id) });
    } catch (err) {
      alert(err.message);
    }
  };
  
  render() {
    const { posts, loading } = this.state;
    
    return (
      <div className="container">
        <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
          <h1 className="heading-lg">MY ANNOUNCEMENTS</h1>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="card">
            <h2 className="heading-md">No announcements yet!</h2>
            <p style={{ opacity: 0.7, margin: '1rem 0' }}>Create your first announcement</p>
            <button className="btn btn-primary" onClick={() => window.location.hash = '#create'}>CREATE ANNOUNCEMENT</button>
          </div>
        ) : (
          <div className="grid">
            {posts.map(post => (
              <div key={post.id} className="card">
                <h3 className="heading-md">{post.title}</h3>
                <p style={{ opacity: 0.8, marginBottom: '1rem' }}>{post.description}</p>
                
                <div style={{ fontSize: '0.875rem', opacity: 0.7, marginBottom: '1rem' }}>
                  <span>📍 {post.location?.city || 'Remote'}</span>
                  {post.isRemote && <span style={{ marginLeft: '0.5rem' }}>🌐 Remote</span>}
                </div>
                
                <button className="btn btn-primary" onClick={() => this.handleDelete(post.id)}>🗑️ DELETE</button>
              </div>
            ))}
          </div>
        )}
        
        <Navigation active="my-posts" />
      </div>
    );
  }
}

// Saved Posts Screen
class SavedPostsScreen extends Component {
  constructor(props) {
    super(props);
    this.state = { posts: [], loading: true };
  }
  
  componentDidMount() {
    this.loadPosts();
  }
  
  loadPosts = async () => {
    try {
      const resp = await conduit.transmit('/announcements/saved', { auth: true });
      this.setState({ posts: resp.announcements || [], loading: false });
    } catch {
      this.setState({ loading: false });
    }
  };
  
  render() {
    const { posts, loading } = this.state;
    
    return (
      <div className="container">
        <div style={{ padding: '2rem 0', borderBottom: '4px solid #F8F8F8', marginBottom: '2rem' }}>
          <h1 className="heading-lg">SAVED ANNOUNCEMENTS</h1>
        </div>
        
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="card">
            <h2 className="heading-md">No saved announcements!</h2>
            <p style={{ opacity: 0.7, margin: '1rem 0' }}>Start saving announcements from the feed</p>
            <button className="btn btn-primary" onClick={() => window.location.hash = '#feed'}>GO TO FEED</button>
          </div>
        ) : (
          <div className="grid">
            {posts.map(post => (
              <div key={post.id} className="card">
                <h3 className="heading-md">{post.title}</h3>
                <p style={{ opacity: 0.8, marginBottom: '1rem' }}>{post.description}</p>
                
                {post.instruments && post.instruments.length > 0 && (
                  <div style={{ marginBottom: '1rem' }}>
                    {post.instruments.slice(0, 3).map((inst, i) => (
                      <span key={i} className="tag">{inst.name}</span>
                    ))}
                  </div>
                )}
                
                <div style={{ fontSize: '0.875rem', opacity: 0.7 }}>
                  <span>📍 {post.location?.city || 'Remote'}</span>
                  {post.isRemote && <span style={{ marginLeft: '0.5rem' }}>🌐 Remote</span>}
                </div>
              </div>
            ))}
          </div>
        )}
        
        <Navigation active="saved" />
      </div>
    );
  }
}

// Navigation Component
const Navigation = ({ active }) => {
  const items = [
    { id: 'feed', icon: '🎵', label: 'Feed', hash: '#feed' },
    { id: 'create', icon: '📢', label: 'Post', hash: '#create' },
    { id: 'my-posts', icon: '📋', label: 'My Ads', hash: '#my-posts' },
    { id: 'saved', icon: '💾', label: 'Saved', hash: '#saved' },
    { id: 'profile', icon: '👤', label: 'Profile', hash: '#profile' }
  ];
  
  return (
    <nav className="nav">
      {items.map(item => (
        <button key={item.id} className={`nav-item ${active === item.id ? 'nav-item-active' : ''}`} onClick={() => window.location.hash = item.hash}>
          <span style={{ fontSize: '1.5rem' }}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
};

// Orchestrator
class Orchestrator extends Component {
  constructor(props) {
    super(props);
    this.state = { route: window.location.hash.slice(1) || 'boot' };
  }
  
  componentDidMount() {
    window.addEventListener('hashchange', this.handleRoute);
  }
  
  componentWillUnmount() {
    window.removeEventListener('hashchange', this.handleRoute);
  }
  
  handleRoute = () => {
    this.setState({ route: window.location.hash.slice(1) || 'boot' });
  };
  
  render() {
    const screens = {
      'boot': BootScreen,
      'login': AuthScreen,
      'register': RegisterScreen,
      'feed': FeedScreen,
      'profile': ProfileScreen,
      'edit-profile': EditProfileScreen,
      'create': CreatePostScreen,
      'my-posts': MyPostsScreen,
      'saved': SavedPostsScreen
    };
    
    const Screen = screens[this.state.route] || BootScreen;
    return <Screen />;
  }
}

// Initialize
const styleTag = document.createElement('style');
styleTag.textContent = styles;
document.head.appendChild(styleTag);

const root = createRoot(document.getElementById('root'));
root.render(<Orchestrator />);
