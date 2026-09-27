import { Component } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PageHeader from '../components/PageHeader.jsx';

class ProfileScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      profile: null,
      loading: true,
      error: '',
      loggingOut: false,
    };
  }

  componentDidMount() {
    this.loadProfile();
  }

  loadProfile = async () => {
    this.setState({ loading: true, error: '' });
    try {
      const profile = await conduit.transmit('/profiles/me', { auth: true });
      this.setState({ profile, loading: false });
    } catch (error) {
      this.setState({ error: error.message, loading: false });
    }
  };

  handleLogout = async () => {
    this.setState({ loggingOut: true, error: '' });
    const refreshToken = nucleus.payload.keys?.refreshToken;

    try {
      await conduit.transmit('/auth/logout', {
        method: 'POST',
        auth: true,
        body: { refreshToken },
      });
    } catch (error) {
      console.warn('Server-side session revocation failed; clearing the local session', error);
    }

    nucleus.logout();
    window.location.hash = '#login';
  };

  renderProfile() {
    const { profile, loggingOut } = this.state;

    if (!profile?.artistName) {
      return (
        <div className="card">
          <p className="eyebrow">First step</p>
          <h2 className="heading-md">COMPLETE YOUR PROFILE</h2>
          <p className="body-muted">Tell other musicians who you are and what you play.</p>
          <button className="btn btn-primary" type="button" onClick={() => { window.location.hash = '#edit-profile'; }}>
            CREATE PROFILE
          </button>
        </div>
      );
    }

    return (
      <article className="card card-highlight">
        <header>
          <p className="eyebrow">Musician profile</p>
          <h2 className="heading-md" style={{ color: 'var(--paper)' }}>{profile.artistName}</h2>
          {(profile.firstName || profile.lastName) && (
            <p className="body-muted">{profile.firstName} {profile.lastName}</p>
          )}
        </header>

        {profile.bio && (
          <section>
            <h3 className="heading-md">ABOUT</h3>
            <p>{profile.bio}</p>
          </section>
        )}

        {profile.instruments?.length > 0 && (
          <section>
            <h3 className="heading-md">INSTRUMENTS</h3>
            <div className="tag-list">
              {profile.instruments.map((instrument) => (
                <span className="tag" key={instrument.instrument_id}>
                  {instrument.name} · {instrument.skill_level}
                </span>
              ))}
            </div>
          </section>
        )}

        {profile.genres?.length > 0 && (
          <section>
            <h3 className="heading-md">GENRES</h3>
            <div className="tag-list">
              {profile.genres.map((genre) => (
                <span className="tag" key={genre.genre_id}>{genre.name}</span>
              ))}
            </div>
          </section>
        )}

        {profile.city && (
          <section>
            <h3 className="heading-md">LOCATION</h3>
            <p>{[profile.city, profile.state, profile.country].filter(Boolean).join(', ')}</p>
          </section>
        )}

        <div className="button-row">
          <button className="btn btn-secondary" type="button" onClick={() => { window.location.hash = '#edit-profile'; }}>
            EDIT PROFILE
          </button>
          <button className="btn btn-ghost" type="button" onClick={this.handleLogout} disabled={loggingOut}>
            {loggingOut ? 'SIGNING OUT…' : 'SIGN OUT'}
          </button>
        </div>
      </article>
    );
  }

  render() {
    const { loading, error, profile } = this.state;

    return (
      <div className="container">
        <PageHeader eyebrow="Your identity" title="PROFILE" subtitle="Show collaborators what you bring to the room." />
        {loading ? (
          <Spinner label="Loading your profile" />
        ) : error && !profile ? (
          <ErrorState message={error} onRetry={this.loadProfile} />
        ) : (
          <>
            {error && <div className="error" role="alert">{error}</div>}
            {this.renderProfile()}
          </>
        )}
        <Navigation active="profile" />
      </div>
    );
  }
}

export default ProfileScreen;
