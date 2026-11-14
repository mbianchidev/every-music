import { useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { useDebounced, useResource } from '../lib/resources.js';
import FormField from './FormField.jsx';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';

export const MAX_PROJECT_INSTRUMENTS = 10;
const blank = { name: '', role: '', yearsActive: '', description: '', spotifyLink: '', youtubeLink: '', bandcampLink: '', soundcloudLink: '', websiteLink: '', collaborators: [], instruments: [] };
const linkFields = ['spotifyLink', 'youtubeLink', 'bandcampLink', 'soundcloudLink', 'websiteLink'];

export default function ProjectManager() {
  const { t } = useI18n();
  const resource = useResource('/profiles/me', { reconnect: false });
  const catalog = useResource('/catalog/instruments', { auth: false, reconnect: false });
  const [draft, setDraft] = useState({ ...blank });
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const term = useDebounced(search);
  const results = useResource(term.trim().length >= 2 ? `/profiles/search?searchTerm=${encodeURIComponent(term.trim())}&pageSize=10` : null, { reconnect: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const field = (key, value) => setDraft(previous => ({ ...previous, [key]: value }));
  const reset = () => { setEditing(null); setDraft({ ...blank }); setSearch(''); setNotice(''); };
  const musician = person => person.artistName || t('musicianProjects.musician');
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const { instruments, ...values } = draft;
      await conduit.transmit(`/profiles/me/projects${editing ? `/${editing}` : ''}`, {
        method: editing ? 'PUT' : 'POST', auth: true,
        body: {
          ...values, name: draft.name.trim(), instrumentIds: instruments.map(item => item.id),
          collaborators: draft.collaborators.map(({ userId, role }) => ({ userId, role: role.trim() })),
        },
      });
      setMessage(t(editing ? 'musicianProjects.updated' : 'musicianProjects.added')); reset(); resource.reload();
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
      instruments: (project.instruments || []).map(item => ({ id: item.instrument_id, name: item.name })),
    });
    document.getElementById('project-name')?.focus();
  };
  const remove = async project => {
    if (!window.confirm(t('musicianProjects.confirmRemove', { name: project.name }))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(`/profiles/me/projects/${project.id}`, { method: 'DELETE', auth: true });
      if (editing === project.id) reset();
      setMessage(t('musicianProjects.removed')); resource.reload();
      document.getElementById('projects-heading')?.focus();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const full = draft.instruments.length >= MAX_PROJECT_INSTRUMENTS;
  const available = (catalog.data?.instruments || []).filter(item => !draft.instruments.some(chosen => chosen.id === item.id));
  return (
    <section className="detail-section" aria-labelledby="projects-heading">
      <h2 className="heading-md" id="projects-heading" tabIndex="-1">{t('musicianProjects.heading')}</h2>
      <p className="body-muted">{t('musicianProjects.intro')}</p>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!resource.data && !resource.error && <Spinner label={t('musicianProjects.loading')} />}
      <div className="project-list">{resource.data?.projects.map(project => (
        <article className="card" key={project.id}>
          <h3>{project.name}</h3><p>{project.role} {project.years_active}</p>
          {!!project.instruments?.length && <p className="body-muted">{t('musicianProjects.played')}: {project.instruments.map(item => item.name).join(', ')}</p>}
          <div className="compact-actions">
            <button className="btn btn-secondary" type="button" onClick={() => edit(project)} disabled={busy}>{t('musicianProjects.edit', { name: project.name })}</button>
            <button className="btn btn-ghost" type="button" onClick={() => remove(project)} disabled={busy}>{t('musicianProjects.remove', { name: project.name })}</button>
          </div>
        </article>
      ))}</div>
      <form className="form-stack detail-section" onSubmit={save}>
        <h3>{t(editing ? 'musicianProjects.editHeading' : 'musicianProjects.addHeading')}</h3>
        <FormField id="project-name" label={t('musicianProjects.name')} required><input className="input" value={draft.name} onChange={event => field('name', event.target.value)} maxLength="255" disabled={busy} /></FormField>
        <FormField id="project-role" label={t('musicianProjects.role')}><input className="input" value={draft.role} onChange={event => field('role', event.target.value)} maxLength="255" disabled={busy} /></FormField>
        <FormField id="project-years" label={t('musicianProjects.years')} hint={t('musicianProjects.yearsHint')}><input className="input" value={draft.yearsActive} onChange={event => field('yearsActive', event.target.value)} maxLength="100" disabled={busy} /></FormField>
        <FormField id="project-description" label={t('musicianProjects.description')}><textarea className="input" value={draft.description} onChange={event => field('description', event.target.value)} maxLength="5000" disabled={busy} /></FormField>
        <fieldset disabled={busy}>
          <legend>{t('musicianProjects.instruments.legend')}</legend>
          {catalog.error && <ErrorState message={`${t('musicianProjects.instruments.loadError')}: ${catalog.error}`} onRetry={catalog.reload} />}
          {!catalog.data && !catalog.error && <Spinner label={t('musicianProjects.instruments.loading')} />}
          {catalog.data && <FormField id="project-instrument" label={t('musicianProjects.instruments.add')}
            hint={full ? t('musicianProjects.instruments.full', { max: MAX_PROJECT_INSTRUMENTS }) : t('musicianProjects.instruments.hint', { max: MAX_PROJECT_INSTRUMENTS })}>
            <select className="input" value="" disabled={full} onChange={event => {
              const instrument = available.find(item => item.id === event.target.value);
              if (!instrument) return;
              field('instruments', [...draft.instruments, { id: instrument.id, name: instrument.name }]);
              setNotice(t('musicianProjects.instruments.added', { name: instrument.name }));
            }}>
              <option value="">{t('musicianProjects.instruments.choose')}</option>
              {available.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </FormField>}
          {draft.instruments.length ? <ul className="project-instrument-choices" aria-label={t('musicianProjects.instruments.selected')}>
            {draft.instruments.map(item => <li key={item.id}><span>{item.name}</span>
              <button className="text-link" type="button" onClick={() => {
                field('instruments', draft.instruments.filter(chosen => chosen.id !== item.id));
                setNotice(t('musicianProjects.instruments.removed', { name: item.name }));
                requestAnimationFrame(() => document.getElementById('project-instrument')?.focus());
              }}>{t('musicianProjects.instruments.remove', { name: item.name })}</button>
            </li>)}
          </ul> : <p className="body-muted">{t('musicianProjects.instruments.none')}</p>}
          <p className="sr-only" role="status">{notice}</p>
        </fieldset>
        <details className="selection-panel"><summary>{t('musicianProjects.links')}</summary><div className="form-stack" style={{ padding: '1rem' }}>
          {linkFields.map(key => <FormField key={key} id={`project-${key}`} label={t(`musicianProjects.linkLabels.${key}`)}>
            <input className="input" type="url" value={draft[key]} onChange={event => field(key, event.target.value)} maxLength="2048" disabled={busy} />
          </FormField>)}
        </div></details>
        <fieldset disabled={busy}>
          <legend>{t('musicianProjects.collaborators.legend')}</legend>
          <FormField id="collaborator-search" label={t('musicianProjects.collaborators.search')} hint={t('musicianProjects.collaborators.searchHint')}>
            <input className="input" value={search} onChange={event => setSearch(event.target.value)} maxLength="200" />
          </FormField>
          {results.error && <ErrorState message={results.error} onRetry={results.reload} />}
          {results.data && <FormField id="collaborator-results" label={t('musicianProjects.collaborators.results')}>
            <select className="input" value="" disabled={draft.collaborators.length >= 20} onChange={event => {
              const person = results.data.profiles.find(item => item.userId === event.target.value);
              if (person) field('collaborators', [...draft.collaborators, { userId: person.userId, artistName: musician(person), role: '' }]);
              setSearch('');
            }}>
              <option value="">{t('musicianProjects.collaborators.choose')}</option>
              {results.data.profiles.filter(person => person.userId !== nucleus.payload.persona?.userId && !draft.collaborators.some(item => item.userId === person.userId))
                .map(person => <option key={person.userId} value={person.userId}>{musician(person)}{person.city ? ` (${person.city})` : ''}</option>)}
            </select>
          </FormField>}
          {draft.collaborators.map((person, index) => <div className="collaborator-row" key={person.userId}>
            <FormField id={`collaborator-role-${person.userId}`} label={t('musicianProjects.collaborators.role', { name: person.artistName || t('musicianProjects.collaborators.fallback') })} required>
              <input className="input" value={person.role} maxLength="100" onChange={event => field('collaborators', draft.collaborators.map((item, i) => i === index ? { ...item, role: event.target.value } : item))} />
            </FormField>
            <button className="text-link" type="button" onClick={() => {
              field('collaborators', draft.collaborators.filter(item => item.userId !== person.userId));
              document.getElementById('collaborator-search')?.focus();
            }}>{t('musicianProjects.collaborators.remove', { name: person.artistName || t('musicianProjects.collaborators.fallback') })}</button>
          </div>)}
        </fieldset>
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('musicianProjects.saving') : t(editing ? 'musicianProjects.save' : 'musicianProjects.add')}</button>
          {editing && <button className="btn btn-ghost" type="button" disabled={busy} onClick={reset}>{t('musicianProjects.cancel')}</button>}
        </div>
      </form>
    </section>
  );
}
