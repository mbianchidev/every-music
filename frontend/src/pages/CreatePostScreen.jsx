import { Component } from 'react';
import conduit from '../lib/conduit.js';
import Navigation from '../components/Navigation.jsx';
import FormField from '../components/FormField.jsx';
import PageHeader from '../components/PageHeader.jsx';

class CreatePostScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      title: '',
      description: '',
      city: '',
      isRemote: false,
      error: '',
      saving: false,
    };
  }

  handleCreate = async (event) => {
    event.preventDefault();
    const { title, description, city, isRemote } = this.state;

    if (title.trim().length < 5) {
      this.setState({ error: 'Title must be at least 5 characters.' });
      return;
    }

    if (description.trim().length < 20) {
      this.setState({ error: 'Description must be at least 20 characters.' });
      return;
    }

    this.setState({ saving: true, error: '' });

    try {
      await conduit.transmit('/announcements/', {
        method: 'POST',
        auth: true,
        body: {
          title: title.trim(),
          description: description.trim(),
          city: city.trim(),
          isRemote,
          isCoverBand: false,
          instrumentIds: [],
          genreIds: [],
          links: [],
        },
      });
      window.location.hash = '#my-posts';
    } catch (error) {
      this.setState({ error: error.message, saving: false });
    }
  };

  render() {
    const { title, description, city, isRemote, error, saving } = this.state;

    return (
      <div className="container">
        <PageHeader
          eyebrow="Open call"
          title="CREATE ANNOUNCEMENT"
          subtitle="Be specific about the sound, commitment, and collaborator you need."
        />

        {error && <div className="error" role="alert">{error}</div>}

        <form className="form-stack" onSubmit={this.handleCreate}>
          <FormField id="announcement-title" label="Title" required>
            <input
              className="input"
              value={title}
              onChange={(event) => this.setState({ title: event.target.value })}
              minLength="5"
              maxLength="255"
              disabled={saving}
            />
          </FormField>

          <FormField
            id="announcement-description"
            label="Description"
            hint="Include style, goals, availability, and expectations."
            required
          >
            <textarea
              className="input"
              style={{ minHeight: '180px', resize: 'vertical' }}
              value={description}
              onChange={(event) => this.setState({ description: event.target.value })}
              minLength="20"
              maxLength="5000"
              disabled={saving}
            />
          </FormField>

          <FormField id="announcement-city" label="City">
            <input
              className="input"
              value={city}
              onChange={(event) => this.setState({ city: event.target.value })}
              autoComplete="address-level2"
              maxLength="255"
              disabled={saving}
            />
          </FormField>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minHeight: '48px' }}>
            <input
              type="checkbox"
              checked={isRemote}
              onChange={(event) => this.setState({ isRemote: event.target.checked })}
              disabled={saving}
              style={{ width: '24px', height: '24px' }}
            />
            Remote collaboration is welcome
          </label>

          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'PUBLISHING…' : 'PUBLISH'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { window.location.hash = '#feed'; }} disabled={saving}>
              CANCEL
            </button>
          </div>
        </form>

        <Navigation active="create" />
      </div>
    );
  }
}

export default CreatePostScreen;
