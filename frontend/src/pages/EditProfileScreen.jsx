import { Component } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import Spinner from '../components/Spinner.jsx';
import FormField from '../components/FormField.jsx';
import ErrorState from '../components/ErrorState.jsx';
import PageHeader from '../components/PageHeader.jsx';
import CatalogSelections from '../components/CatalogSelections.jsx';
import ImageInput from '../components/ImageInput.jsx';
import ProjectManager from '../components/ProjectManager.jsx';
import { uploadImage } from '../lib/media.js';

class EditProfileScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      artistName: '',
      firstName: '',
      lastName: '',
      city: '',
      bio: '',
      profilePictureUrl: null,
      imageFile: null,
      instruments: [],
      genres: [],
      instrumentIds: [],
      genreIds: [],
      experience: {},
      loaded: false,
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
      const [data, instrumentCatalog, genreCatalog] = await Promise.all([
        conduit.transmit('/profiles/me', { auth: true }),
        conduit.transmit('/catalog/instruments'),
        conduit.transmit('/catalog/genres'),
      ]);
      this.setState({
        artistName: data.artistName || '',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        city: data.city || '',
        bio: data.bio || '',
        profilePictureUrl: data.profilePictureUrl,
        instruments: instrumentCatalog.instruments,
        genres: genreCatalog.genres,
        instrumentIds: data.instruments.map(item => item.instrument_id),
        genreIds: data.genres.map(item => item.genre_id),
        experience: Object.fromEntries(data.instruments.map(item => [item.instrument_id, { skillLevel: item.skill_level, yearsExperience: item.years_experience }])),
        loaded: true,
        loading: false,
      });
    } catch (error) {
      this.setState({ loading: false, error: error.message });
    }
  };

  handleSave = async (event) => {
    event.preventDefault();
    const { artistName, firstName, lastName, city, bio, instrumentIds, genreIds, experience, imageFile } = this.state;

    if (!artistName.trim()) {
      this.setState({ error: 'Artist name is required.' });
      return;
    }

    this.setState({ saving: true, error: '' });

    try {
      let profilePictureUrl = this.state.profilePictureUrl;
      if (imageFile) {
        profilePictureUrl = (await uploadImage(imageFile, 'profile')).url;
        this.setState({ profilePictureUrl, imageFile: null });
      }
      const updated = await conduit.transmit('/profiles/me', {
        method: 'PUT',
        auth: true,
        body: {
          artistName: artistName.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          city: city.trim(),
          bio: bio.trim(),
          profilePictureUrl,
          instruments: instrumentIds.map(instrumentId => ({ instrumentId, skillLevel: experience[instrumentId]?.skillLevel || 'beginner', yearsExperience: experience[instrumentId]?.yearsExperience ?? 0 })),
          genreIds,
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
        </div>
      );
    }

    if (error && !this.state.loaded) {
      return (
        <div className="container">
          <PageHeader eyebrow="Your space" title="Edit profile" />
          <ErrorState message={error} onRetry={this.loadProfile} />
        </div>
      );
    }

    return (
      <div className="container">
        <PageHeader eyebrow="Your space" title="Edit profile" subtitle="Your sound, your experience, and what you are working on." />
        {error && <div className="error" role="alert">{error}</div>}

        <form className="form-stack" onSubmit={this.handleSave}>
          <ImageInput id="profile-image" label="Profile image" value={this.state.profilePictureUrl} disabled={saving}
            onChange={profilePictureUrl => this.setState({ profilePictureUrl })} onFile={imageFile => this.setState({ imageFile })} />
          <FormField id="profile-artist-name" label="Artist name" required>
            <input className="input" value={artistName} onChange={(event) => this.setState({ artistName: event.target.value })} maxLength="255" disabled={saving} />
          </FormField>
          <div className="form-grid"><FormField id="profile-first-name" label="First name">
            <input className="input" value={firstName} onChange={(event) => this.setState({ firstName: event.target.value })} autoComplete="given-name" maxLength="100" disabled={saving} />
          </FormField>
          <FormField id="profile-last-name" label="Last name">
            <input className="input" value={lastName} onChange={(event) => this.setState({ lastName: event.target.value })} autoComplete="family-name" maxLength="100" disabled={saving} />
          </FormField></div>
          <FormField id="profile-city" label="City">
            <input className="input" value={city} onChange={(event) => this.setState({ city: event.target.value })} autoComplete="address-level2" maxLength="255" disabled={saving} />
          </FormField>
          <FormField id="profile-bio" label="Bio">
            <textarea className="input" style={{ minHeight: '140px', resize: 'vertical' }} value={bio} onChange={(event) => this.setState({ bio: event.target.value })} maxLength="5000" disabled={saving} />
          </FormField>
          <CatalogSelections instruments={this.state.instruments} genres={this.state.genres}
            instrumentIds={this.state.instrumentIds} genreIds={this.state.genreIds}
            onInstruments={instrumentIds => this.setState({ instrumentIds })} onGenres={genreIds => this.setState({ genreIds })}
            experience={this.state.experience} disabled={saving} onExperience={(id, key, value) => this.setState(state => ({
              experience: { ...state.experience, [id]: { ...state.experience[id], [key]: value } },
            }))} />

          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save profile'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { window.location.hash = '#profile'; }} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
        <ProjectManager />

      </div>
    );
  }
}

export default EditProfileScreen;
