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
import AccountKindField from '../components/AccountKindField.jsx';
import { uploadImage } from '../lib/media.js';
import { t } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';
import PlacePicker from '../components/PlacePicker.jsx';
import ProfileLinksEditor from '../components/ProfileLinksEditor.jsx';

const contactFields = [
  ['telegramId', 'profile-telegram', 'text', 'off'],
  ['whatsapp', 'profile-whatsapp', 'tel', 'off'],
  ['signal', 'profile-signal', 'text', 'off'],
  ['phone', 'profile-phone', 'tel', 'tel'],
  ['websiteUrl', 'profile-website', 'url', 'url'],
];

class EditProfileScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      artistName: '',
      firstName: '',
      lastName: '',
      city: '',
      place: null,
      age: '',
      openToProjects: false,
      hasActiveAnnouncement: false,
      contactVisibility: 'members',
      telegramId: '',
      whatsapp: '',
      signal: '',
      phone: '',
      websiteUrl: '',
      links: [],
      publicDisplay: null,
      bio: '',
      profilePictureUrl: null,
      imageFile: null,
      instruments: [],
      genres: [],
      instrumentIds: [],
      genreIds: [],
      experience: {},
      accountKind: 'artist',
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
        place: data.place ? { id: data.place.id, label: data.place.label } : null,
        age: data.age ? String(data.age) : '',
        openToProjects: Boolean(data.openToProjectsManual),
        hasActiveAnnouncement: Boolean(data.hasActiveAnnouncement),
        contactVisibility: data.contactVisibility || 'members',
        ...Object.fromEntries(contactFields.map(([key]) => [key, data.contacts?.[key] || ''])),
        links: (data.links || []).map(link => ({ linkType: link.linkType, url: link.url })),
        publicDisplay: data.publicDisplay || null,
        bio: data.bio || '',
        profilePictureUrl: data.profilePictureUrl,
        instruments: instrumentCatalog.instruments,
        genres: genreCatalog.genres,
        instrumentIds: data.instruments.map(item => item.instrument_id),
        genreIds: data.genres.map(item => item.genre_id),
        experience: Object.fromEntries(data.instruments.map(item => [item.instrument_id, { skillLevel: item.skill_level, yearsExperience: item.years_experience }])),
        accountKind: data.accountKind || 'artist',
        loaded: true,
        loading: false,
      });
    } catch (error) {
      this.setState({ loading: false, error: errorText(error) });
    }
  };

  handleSave = async (event) => {
    event.preventDefault();
    const { artistName, firstName, lastName, city, bio, instrumentIds, genreIds, experience, imageFile, place, age, accountKind } = this.state;

    if (!artistName.trim()) {
      this.setState({ error: t('profile.editor.nameRequired') });
      return;
    }
    if (age && (!/^\d+$/.test(age) || Number(age) < 13 || Number(age) > 120)) {
      this.setState({ error: t('profileExtras.editor.ageInvalid') });
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
          placeId: place ? place.id : null,
          city: place ? undefined : city.trim(),
          age: age ? Number(age) : null,
          openToProjects: this.state.openToProjects,
          contactVisibility: this.state.contactVisibility,
          ...Object.fromEntries(contactFields.map(([key]) => [key, this.state[key].trim()])),
          links: this.state.links.filter(link => link.url.trim()).map(link => ({ linkType: link.linkType, url: link.url.trim() })),
          bio: bio.trim(),
          profilePictureUrl,
          ...(accountKind === 'artist' ? { instruments: instrumentIds.map(instrumentId => ({ instrumentId, skillLevel: experience[instrumentId]?.skillLevel || 'beginner', yearsExperience: experience[instrumentId]?.yearsExperience ?? 0 })) } : {}),
          genreIds,
          accountKind,
        },
      });
      nucleus.mutate(updated);
      window.location.hash = '#profile';
    } catch (error) {
      this.setState({ error: errorText(error), saving: false });
    }
  };

  render() {
    const { artistName, firstName, lastName, city, bio, loading, saving, error } = this.state;

    if (loading) {
      return (
        <div className="container">
          <Spinner label={t('profile.loading')} />
        </div>
      );
    }

    if (error && !this.state.loaded) {
      return (
        <div className="container">
          <PageHeader eyebrow={t('app.nav.sections.yourSpace')} title={t('app.routes.editProfile')} />
          <ErrorState message={error} onRetry={this.loadProfile} />
        </div>
      );
    }

    return (
      <div className="container">
        <PageHeader eyebrow={t('app.nav.sections.yourSpace')} title={t('app.routes.editProfile')} subtitle={t('profile.editor.subtitle')} />
        {error && <div className="error" role="alert">{error}</div>}

        <form className="form-stack" onSubmit={this.handleSave}>
          <AccountKindField value={this.state.accountKind} disabled={saving} onChange={accountKind => this.setState({ accountKind })} />
          <ImageInput id="profile-image" label={t('profile.editor.image')} value={this.state.profilePictureUrl} disabled={saving}
            onChange={profilePictureUrl => this.setState({ profilePictureUrl })} onFile={imageFile => this.setState({ imageFile })} />
          <FormField id="profile-artist-name" label={t('profile.editor.artistName')} required>
            <input className="input" value={artistName} onChange={(event) => this.setState({ artistName: event.target.value })} maxLength="255" disabled={saving} />
          </FormField>
          <div className="form-grid"><FormField id="profile-first-name" label={t('profile.editor.firstName')}>
            <input className="input" value={firstName} onChange={(event) => this.setState({ firstName: event.target.value })} autoComplete="given-name" maxLength="100" disabled={saving} />
          </FormField>
          <FormField id="profile-last-name" label={t('profile.editor.lastName')}>
            <input className="input" value={lastName} onChange={(event) => this.setState({ lastName: event.target.value })} autoComplete="family-name" maxLength="100" disabled={saving} />
          </FormField></div>
          <div className="form-grid"><FormField id="profile-age" label={t('profileExtras.editor.age')} hint={t('profileExtras.editor.ageHint')}>
            <input className="input" type="number" inputMode="numeric" min="13" max="120" value={this.state.age} onChange={(event) => this.setState({ age: event.target.value })} disabled={saving} />
          </FormField>
          <PlacePicker id="profile-city" label={t('places.city')} hint={t('places.cityHint')} value={this.state.place} text={city} disabled={saving}
            onChange={place => this.setState({ place })} onText={text => this.setState({ city: text })} /></div>
          <div className="field">
            <label className="checkbox-label"><input type="checkbox" checked={this.state.openToProjects} disabled={saving}
              aria-describedby="profile-open-hint" onChange={(event) => this.setState({ openToProjects: event.target.checked })} />{t('profileExtras.editor.openToProjects')}</label>
            <p className="field-hint" id="profile-open-hint">{this.state.hasActiveAnnouncement ? t('profileExtras.editor.openAutomatic') : t('profileExtras.editor.openHint')}</p>
          </div>
          <FormField id="profile-bio" label={t('profile.editor.bio')}>
            <textarea className="input" style={{ minHeight: '140px', resize: 'vertical' }} value={bio} onChange={(event) => this.setState({ bio: event.target.value })} maxLength="5000" disabled={saving} />
          </FormField>
          <CatalogSelections instruments={this.state.instruments} genres={this.state.genres} hideInstruments={this.state.accountKind === 'music_lover'}
            instrumentIds={this.state.instrumentIds} genreIds={this.state.genreIds}
            onInstruments={instrumentIds => this.setState({ instrumentIds })} onGenres={genreIds => this.setState({ genreIds })}
            experience={this.state.experience} disabled={saving} onExperience={(id, key, value) => this.setState(state => ({
              experience: { ...state.experience, [id]: { ...state.experience[id], [key]: value } },
            }))} />

          <fieldset className="form-stack" disabled={saving}>
            <legend>{t('profileExtras.contacts.heading')}</legend>
            <FormField id="profile-contact-visibility" label={t('profileExtras.editor.visibility')} hint={t('profileExtras.editor.visibilityHint')}>
              <select className="input" value={this.state.contactVisibility} onChange={(event) => this.setState({ contactVisibility: event.target.value })}>
                {['members', 'following', 'hidden'].map(level => <option key={level} value={level}>{t(`profileExtras.editor.visibilityOptions.${level}`)}</option>)}
              </select>
            </FormField>
            <div className="form-grid">{contactFields.map(([key, id, type, autoComplete]) => (
              <FormField key={key} id={id} label={t(`profileExtras.editor.contactLabels.${key}`)} hint={t(`profileExtras.editor.contactHints.${key}`)}>
                <input className="input" type={type} autoComplete={autoComplete} maxLength={key === 'websiteUrl' ? 2048 : 100} value={this.state[key]}
                  onChange={(event) => this.setState({ [key]: event.target.value })} />
              </FormField>
            ))}</div>
          </fieldset>
          <ProfileLinksEditor links={this.state.links} disabled={saving} onChange={links => this.setState({ links })}
            shownLimit={this.state.publicDisplay ? this.state.publicDisplay.maxContentShown : null} />

          <div className="button-row">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? t('common.actions.saving') : t('profile.editor.save')}
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => { window.location.hash = '#profile'; }} disabled={saving}>
              {t('common.actions.cancel')}
            </button>
          </div>
        </form>
        {this.state.accountKind === 'artist' && <ProjectManager />}

      </div>
    );
  }
}

export default EditProfileScreen;
