import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { RELEASE_TYPES, can } from '../lib/organizations.js';
import FormField from './FormField.jsx';
import LinkListEditor from './LinkListEditor.jsx';

const blank = { title: '', releaseType: 'single', releaseDate: '', links: [] };

export default function OrganizationReleases({ organization, onChanged }) {
  const { t, formatDate } = useI18n();
  const [draft, setDraft] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const manage = can(organization, 'manage_profile');
  const releases = organization.releases ?? [];
  if (!manage && !releases.length) return null;
  const run = async (operation, success) => {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); setMessage(success); onChanged(); return true; }
    catch (failure) { setError(failure.message); return false; }
    finally { setBusy(false); }
  };
  const save = async event => {
    event.preventDefault();
    const body = { ...draft, title: draft.title.trim(), releaseDate: draft.releaseDate || null, links: draft.links.filter(link => link.url.trim()) };
    const done = await run(() => conduit.transmit(`/organizations/${organization.id}/releases${editing ? `/${editing}` : ''}`, {
      method: editing ? 'PATCH' : 'POST', auth: true, body,
    }), editing ? t('organizations.releases.updated') : t('organizations.releases.added'));
    if (done) { setDraft(blank); setEditing(null); document.getElementById('releases-heading')?.focus(); }
  };
  const remove = async release => {
    if (!window.confirm(t('organizations.releases.confirmRemove', { title: release.title }))) return;
    if (await run(() => conduit.transmit(`/organizations/${organization.id}/releases/${release.id}`, { method: 'DELETE', auth: true }), t('organizations.releases.removed'))) {
      document.getElementById('releases-heading')?.focus();
    }
  };
  return (
    <section className="detail-section" aria-labelledby="releases-heading">
      <h2 className="heading-md" id="releases-heading" tabIndex="-1">{t('organizations.releases.title')}</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!releases.length && <p className="body-muted">{t('organizations.releases.empty')}</p>}
      <ul className="release-list">{releases.map(release => (
        <li key={release.id} className="card">
          <h3>{release.title}</h3>
          <p className="body-muted">{t(`organizations.releaseTypes.${release.releaseType}`)}{release.releaseDate && <> / <time dateTime={release.releaseDate}>{formatDate(`${release.releaseDate}T00:00:00`)}</time></>}</p>
          {!!release.links.length && <div className="compact-actions">{release.links.map((link, index) => (
            <a key={index} href={link.url} target="_blank" rel="noopener noreferrer">{t(`organizations.linkTypes.${link.linkType}`)}</a>
          ))}</div>}
          {manage && <div className="compact-actions">
            <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => {
              setEditing(release.id);
              setDraft({ title: release.title, releaseType: release.releaseType, releaseDate: release.releaseDate || '', links: release.links });
              document.getElementById('release-title')?.focus();
            }}>{t('organizations.releases.edit', { title: release.title })}</button>
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => remove(release)}>{t('organizations.releases.remove', { title: release.title })}</button>
          </div>}
        </li>
      ))}</ul>
      {manage && <form className="form-stack detail-section" onSubmit={save}>
        <h3>{editing ? t('organizations.releases.editTitle') : t('organizations.releases.addTitle')}</h3>
        <FormField id="release-title" label={t('organizations.releases.fields.title')} required>
          <input className="input" value={draft.title} maxLength="255" disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} />
        </FormField>
        <div className="form-grid">
          <FormField id="release-type" label={t('organizations.releases.fields.type')}>
            <select className="input" value={draft.releaseType} disabled={busy} onChange={event => setDraft({ ...draft, releaseType: event.target.value })}>
              {RELEASE_TYPES.map(type => <option key={type} value={type}>{t(`organizations.releaseTypes.${type}`)}</option>)}
            </select>
          </FormField>
          <FormField id="release-date" label={t('organizations.releases.fields.date')}>
            <input className="input" type="date" value={draft.releaseDate} disabled={busy} onChange={event => setDraft({ ...draft, releaseDate: event.target.value })} />
          </FormField>
        </div>
        <LinkListEditor id="release-links" legend={t('organizations.releases.fields.links')} links={draft.links} maximum={6} disabled={busy}
          onChange={links => setDraft({ ...draft, links })} />
        <div className="button-row">
          <button className="btn btn-primary" type="submit" disabled={busy || !draft.title.trim()}>{editing ? t('organizations.releases.save') : t('organizations.releases.add')}</button>
          {editing && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => { setEditing(null); setDraft(blank); }}>{t('organizations.common.cancel')}</button>}
        </div>
      </form>}
    </section>
  );
}
