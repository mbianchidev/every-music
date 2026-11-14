import { useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useDebounced, useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';

const blank = { name: '', role: '', yearsActive: '', description: '', spotifyLink: '', youtubeLink: '', bandcampLink: '', soundcloudLink: '', websiteLink: '', collaborators: [] };
const linkFields = { spotifyLink: 'Spotify', youtubeLink: 'YouTube', bandcampLink: 'Bandcamp', soundcloudLink: 'SoundCloud', websiteLink: 'Website' };

export default function ProjectManager() {
  const resource = useResource('/profiles/me', { reconnect: false });
  const [draft, setDraft] = useState({ ...blank });
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const results = useResource(term.trim().length >= 2 ? `/profiles/search?searchTerm=${encodeURIComponent(term.trim())}&pageSize=10` : null, { reconnect: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const field = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const reset = () => { setEditing(null); setDraft({ ...blank }); setSearch(''); };
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/profiles/me/projects${editing ? `/${editing}` : ''}`, {
        method: editing ? 'PUT' : 'POST', auth: true,
        body: { ...draft, name: draft.name.trim(), collaborators: draft.collaborators.map(({ userId, role }) => ({ userId, role: role.trim() })) },
      });
      setMessage(editing ? 'Project updated.' : 'Project added.'); reset(); resource.reload();
      document.getElementById('projects-heading')?.focus();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const edit = project => {
    setEditing(project.id);
    setDraft({
      name: project.name, role: project.role || '', yearsActive: project.years_active || '', description: project.description || '',
      spotifyLink: project.spotify_link || '', youtubeLink: project.youtube_link || '', bandcampLink: project.bandcamp_link || '',
      soundcloudLink: project.soundcloud_link || '', websiteLink: project.website_link || '', collaborators: project.collaborators || [],
    });
    document.getElementById('project-name')?.focus();
  };
  const remove = async project => {
    if (!window.confirm(`Remove "${project.name}" from your profile?`)) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/profiles/me/projects/${project.id}`, { method: 'DELETE', auth: true });
      if (editing === project.id) reset();
      setMessage('Project removed.'); resource.reload();
      document.getElementById('projects-heading')?.focus();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="projects-heading">
      <h2 className="heading-md" id="projects-heading" tabIndex="-1">Musical projects</h2>
      <p className="body-muted">Projects are saved separately from your profile. Add roles and collaborators so musicians can find the people behind the sound.</p>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!resource.data && !resource.error && <Spinner label="Loading your projects" />}
      <div className="project-list">{resource.data?.projects.map(project => (
        <article className="card" key={project.id}>
          <h3>{project.name}</h3><p>{project.role} {project.years_active}</p>
          <div className="compact-actions">
            <button className="btn btn-secondary" type="button" onClick={() => edit(project)} disabled={busy}>Edit {project.name}</button>
            <button className="btn btn-ghost" type="button" onClick={() => remove(project)} disabled={busy}>Remove {project.name}</button>
          </div>
        </article>
      ))}</div>
      <form className="form-stack detail-section" onSubmit={save}>
        <h3>{editing ? 'Edit project' : 'Add project'}</h3>
        <FormField id="project-name" label="Project name" required><input className="input" value={draft.name} onChange={event => field('name', event.target.value)} maxLength="255" disabled={busy} /></FormField>
        <FormField id="project-role" label="Your role"><input className="input" value={draft.role} onChange={event => field('role', event.target.value)} maxLength="255" disabled={busy} /></FormField>
        <FormField id="project-years" label="Years active" hint="For example, 2024-present."><input className="input" value={draft.yearsActive} onChange={event => field('yearsActive', event.target.value)} maxLength="100" disabled={busy} /></FormField>
        <FormField id="project-description" label="Project description"><textarea className="input" value={draft.description} onChange={event => field('description', event.target.value)} maxLength="5000" disabled={busy} /></FormField>
        <details className="selection-panel"><summary>Music and website links</summary><div className="form-stack" style={{ padding: '1rem' }}>
          {Object.entries(linkFields).map(([key, label]) => <FormField key={key} id={`project-${key}`} label={label}>
            <input className="input" type="url" value={draft[key]} onChange={event => field(key, event.target.value)} maxLength="2048" disabled={busy} />
          </FormField>)}
        </div></details>
        <fieldset disabled={busy}>
          <legend>Collaborators</legend>
          <FormField id="collaborator-search" label="Find a collaborator" hint="Type at least two characters of their artist name.">
            <input className="input" value={search} onChange={event => setSearch(event.target.value)} maxLength="200" />
          </FormField>
          {results.error && <ErrorState message={results.error} onRetry={results.reload} />}
          {results.data && <FormField id="collaborator-results" label="Matching musicians">
            <select className="input" value="" disabled={draft.collaborators.length >= 20} onChange={event => {
              const person = results.data.profiles.find(item => item.userId === event.target.value);
              if (person) field('collaborators', [...draft.collaborators, { userId: person.userId, artistName: person.artistName || 'Musician', role: '' }]);
              setSearch('');
            }}>
              <option value="">Choose a musician</option>
              {results.data.profiles.filter(person => person.userId !== nucleus.payload.persona?.userId && !draft.collaborators.some(item => item.userId === person.userId))
                .map(person => <option key={person.userId} value={person.userId}>{person.artistName || 'Musician'}{person.city ? ` (${person.city})` : ''}</option>)}
            </select>
          </FormField>}
          {draft.collaborators.map((person, index) => <div className="collaborator-row" key={person.userId}>
            <FormField id={`collaborator-role-${person.userId}`} label={`${person.artistName || 'Collaborator'} role`} required>
              <input className="input" value={person.role} maxLength="100" onChange={event => field('collaborators', draft.collaborators.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} />
            </FormField>
            <button className="text-link" type="button" onClick={() => {
              field('collaborators', draft.collaborators.filter(item => item.userId !== person.userId));
              document.getElementById('collaborator-search')?.focus();
            }}>Remove {person.artistName || 'collaborator'}</button>
          </div>)}
        </fieldset>
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving project...' : editing ? 'Save project changes' : 'Add project'}</button>
          {editing && <button className="btn btn-ghost" type="button" disabled={busy} onClick={reset}>Cancel project edit</button>}
        </div>
      </form>
    </section>
  );
}
