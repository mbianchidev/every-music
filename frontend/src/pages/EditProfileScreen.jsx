import { Component } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import Navigation from '../components/Navigation.jsx';
import Spinner from '../components/Spinner.jsx';
import FormField from '../components/FormField.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PageHeader from '../components/PageHeader.jsx';

class EditProfileScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      artistName: '',
      firstName: '',
      lastName: '',
      city: '',
      bio: '',
      loading: true,
      saving: false,
      error: '',
    };
  }

  componentDidMount() {
    this.loadProfile();
  }

  loadProfile = async () => {
    this.setState({ loading: true, error: '' });
    try {
      const data = await conduit.transmit('/profiles/me', { auth: true });
      this.setState({
        artistName: data.artistName || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        city: data.city || '',
        bio: data.bio || '',
        loading: false,
      });
    } catch (error) {
      this.setState({ loading: false, error: error.message });
    }
  };

  handleSave = async (event) => {
    event.preventDefault();
    const { artistName, firstName, lastName, city, bio } = this.state;

    if (!artistName.trim()) {
      this.setState({ error: 'Artist name is required.' });
      return;
    }

    this.setState({ saving: true, error: '' });

    try {
      const updated = await conduit.transmit('/profiles/me', {
        method: 'PUT',
        auth: true,
        body: {
          artistName: artistName.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          city: city.trim(),
          bio: bio.trim(),
        },
      });
      nucleus.mutate(updated);
      window.location.hash = '#profile';
    } catch (error) {
      this.setState({ error: error.message, saving: false });
    }
  };

  render() {
    const { artistName, firstName, lastName, city, bio, loading, saving, error } = this.state;

    if (loading) {
      return (
        <div className="container">
          <Spinner label="Loading your profile" />
          <Navigation active="profile" />
        </div>
      );
    }

    if (error && !artistName && !firstName && !lastName && !city && !bio) {
      return (
        <div className="container">
          <PageHeader eyebrow="Your identity" title="EDIT PROFILE" />
          <ErrorState message={error} onRetry={this.loadProfile} />
          <Navigation active="profile" />
        </div>
      );
    }

    return (
      <div className="container">
        <PageHeader eyebrow="Your identity" title="EDIT PROFILE" subtitle="Keep it clear, current, and recognizably you." />
        {error && <div className="error" role="alert">{error}</div>}

        <form className="form-stack" onSubmit={this.handleSave}>
          <FormField id="profile-artist-name" label="Artist name" required>
            <input className="input" value={artistName} onChange={(event) => this.setState({ artistName: event.target.value })} maxLength="255" disabled={saving} />
          </FormField>
          <FormField id="profile-first-name" label="First name">
            <input className="input" value={firstName} onChange={(event) => this.setState({ firstName: event.target.value })} autoComplete="given-name" maxLength="100" disabled={saving} />
          </FormField>
          <FormField id="profile-last-name" label="Last name">
            <input className="input" value={lastName} onChange={(event) => this.setState({ lastName: event.target.value })} autoComplete="family-name" maxLength="100" disabled={saving} />
          </FormField>
          <FormField id="profile-city" label="City">
            <input className="input" value={city} onChange={(event) => this.setState({ city: event.target.value })} autoComplete="address-level2" maxLength="255" disabled={saving} />
          </FormField>
          <FormField id="profile-bio" label="Bio">
            <textarea className="input" style={{ minHeight: '140px', resize: 'vertical' }} value={bio} onChange={(event) => this.setState({ bio: event.target.value })} maxLength="5000" disabled={saving} />
          </FormField>

          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'SAVING…' : 'SAVE PROFILE'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { window.location.hash = '#profile'; }} disabled={saving}>
              CANCEL
            </button>
          </div>
        </form>

        <Navigation active="profile" />
      </div>
    );
  }
}

export default EditProfileScreen;
