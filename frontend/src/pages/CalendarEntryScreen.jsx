import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import nucleus from '../lib/nucleus.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import {
  CALENDAR_RESPONSES, MAX_REMINDERS, REMINDER_OFFSETS, changedFields, downloadEntryIcs, entryBody, entryDraft, formatEntryTime,
  googleCalendarLink, localTimeZone, mapLinks,
} from '../lib/calendar.js';
import PageHeader from '../components/PageHeader.jsx';
import ErrorState from '../components/ErrorState.jsx';
import Spinner from '../components/Spinner.jsx';
import Avatar from '../components/Avatar.jsx';
import EntityPicker from '../components/EntityPicker.jsx';
import CalendarEntryForm from '../components/CalendarEntryForm.jsx';
import { errorText } from '../lib/error-text.js';

function Participants({ entry, own, busy, onRemove }) {
  const { t } = useI18n();
  const role = person => (person.organizer ? t('calendar.entry.organizerRole') : person.member ? t('calendar.entry.memberRole') : t('calendar.entry.inviteeRole'));
  return (
    <section className="detail-section" aria-labelledby="entry-people-heading">
      <h2 className="heading-md" id="entry-people-heading" tabIndex="-1">{t('calendar.entry.participants')}</h2>
      <ul className="member-list">{entry.participants.map(person => (
        <li className="member-row" key={person.userId}>
          <Avatar name={person.name} />
          <div>
            <a href={`#musician?id=${person.userId}`}>{person.name}</a>
            <p className="body-muted">{role(person)} / {t(`calendar.responses.${person.organizer && person.response === 'pending' ? 'yes' : person.response}`)}</p>
          </div>
          {person.invited && (entry.viewer.canManage || person.userId === own) && <button className="text-link" type="button" disabled={busy}
            onClick={() => onRemove(person)}>{person.userId === own ? t('calendar.entry.leave') : t('calendar.form.removeInvitee', { name: person.name })}</button>}
        </li>
      ))}</ul>
    </section>
  );
}

export default function CalendarEntryScreen({ route }) {
  const { t, locale } = useI18n();
  const id = route.query.get('id');
  const resource = useResource(`/calendar/entries/${encodeURIComponent(id || 'missing')}`, { events: 'calendar.changed' });
  const entry = resource.data;
  const own = nucleus.payload.persona?.userId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reminders, setReminders] = useState(null);
  const [rsvp, setRsvp] = useState(null);
  const [draft, setDraft] = useState(null);
  const [base, setBase] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!entry) return;
    setReminders(entry.viewer.reminders);
    if (!dirty) { setDraft(entryDraft(entry)); setBase(entry); }
  }, [entry?.id, entry?.updatedAt, entry?.viewer.reminders.join(',')]);
  const act = async (operation, success, focus) => {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await operation();
      if (success) setMessage(success);
      resource.reload();
      if (focus) document.getElementById(focus)?.focus();
      return result;
    } catch (failure) { setError(errorText(failure)); return null; }
    finally { setBusy(false); }
  };
  const path = `/calendar/entries/${entry?.id}`;
  const respond = async response => {
    setRsvp(response);
    const saved = await act(() => conduit.transmit(`${path}/response`, { method: 'PUT', auth: true, body: { response } }), t('calendar.entry.rsvpSaved'));
    if (!saved) setRsvp(null);
  };
  const answer = rsvp ?? entry?.viewer.response;
  const saveReminders = event => {
    event.preventDefault();
    act(() => conduit.transmit(`${path}/reminders`, { method: 'PUT', auth: true, body: { offsets: reminders } }), t('calendar.entry.remindersSaved'));
  };
  const update = changes => act(() => conduit.transmit(path, { method: 'PATCH', auth: true, body: changes }), t('calendar.entry.saved'), 'main-content');
  // Sends only the fields edited since the form was loaded, so a concurrent
  // edit by another organizer is not silently reverted.
  const saveDraft = async () => {
    const changes = changedFields(entryBody(draft), entryBody(entryDraft(base)));
    if (!Object.keys(changes).length) { setDirty(false); setMessage(t('calendar.entry.saved')); return; }
    if (await update(changes)) setDirty(false);
  };
  const removeEntry = async () => {
    if (!window.confirm(t('calendar.entry.removeConfirm'))) return;
    setBusy(true); setError('');
    try {
      await conduit.transmit(path, { method: 'DELETE', auth: true });
      window.location.hash = entry.organization ? `#organization?id=${entry.organization.id}` : '#calendar';
    } catch (failure) { setError(errorText(failure)); setBusy(false); }
  };
  const removeInvitee = async person => {
    const self = person.userId === own;
    if (self && !window.confirm(t('calendar.entry.leaveConfirm'))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`${path}/invitees/${person.userId}`, { method: 'DELETE', auth: true });
      if (self) { window.location.hash = '#calendar'; return; }
      setMessage(t('calendar.entry.inviteeRemoved')); resource.reload();
      document.getElementById('entry-people-heading')?.focus();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const download = async () => {
    setError('');
    try { await downloadEntryIcs(entry); }
    catch (failure) { setError(`${t('calendar.entry.downloadFailed')} ${errorText(failure)}`); }
  };
  const links = entry ? mapLinks(entry) : null;
  const viewerZone = localTimeZone();
  return (
    <div className="container">
      <PageHeader eyebrow={entry ? `${t(`calendar.kinds.${entry.kind}`)} / ${entry.organization?.name ?? t('calendar.list.personal')}` : t('calendar.routes.entry')}
        title={entry?.title || t('calendar.routes.entry')} />
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {!entry && !resource.error ? <Spinner label={t('calendar.entry.loading')} /> : entry && <>
        <article className="card">
          {entry.status === 'cancelled' && <p className="status-message">{t('calendar.entry.cancelledNotice')}</p>}
          <dl className="detail-list">
            <div><dt>{t('calendar.entry.when')}</dt><dd><time dateTime={entry.startsAt}>{formatEntryTime(entry, locale)}</time> ({entry.timeZone.replace(/_/g, ' ')})</dd></div>
            {formatEntryTime(entry, locale, viewerZone) !== formatEntryTime(entry, locale) && <div><dt>{t('calendar.entry.yourTime')}</dt><dd>{formatEntryTime(entry, locale, viewerZone)}</dd></div>}
            {entry.place && <div><dt>{t('calendar.entry.place')}</dt><dd>{entry.place.label}</dd></div>}
            {entry.address && <div><dt>{t('calendar.entry.address')}</dt><dd className="detail-text">{entry.address}</dd></div>}
            {entry.organization && <div><dt>{t('calendar.entry.band')}</dt><dd><a href={`#organization?id=${entry.organization.id}`}>{entry.organization.name}</a></dd></div>}
            {entry.createdBy && <div><dt>{t('calendar.entry.organizer')}</dt><dd><a href={`#musician?id=${entry.createdBy.userId}`}>{entry.createdBy.name}</a></dd></div>}
          </dl>
          {links && <p className="compact-actions" aria-describedby="entry-map-hint">
            <a href={links.openStreetMap} target="_blank" rel="noopener noreferrer">{t('calendar.entry.openStreetMap')}</a>
            <a href={links.googleMaps} target="_blank" rel="noopener noreferrer">{t('calendar.entry.googleMaps')}</a>
            <span className="sr-only" id="entry-map-hint">{t('calendar.entry.maps')}</span>
          </p>}
          {entry.notes && <section className="detail-section"><h2 className="heading-md">{t('calendar.entry.notes')}</h2><p className="detail-text">{entry.notes}</p></section>}
          <div className="compact-actions">
            <button className="btn btn-secondary" type="button" onClick={download}>{t('calendar.entry.download')}</button>
            <a className="btn btn-ghost" href={googleCalendarLink(entry)} target="_blank" rel="noopener noreferrer">{t('calendar.entry.google')}</a>
          </div>
        </article>
        {entry.ownerId !== own && <fieldset className="detail-section rsvp-group" disabled={busy}>
          <legend className="heading-md">{t('calendar.entry.rsvp')}</legend>
          <div className="rsvp-options">
            {CALENDAR_RESPONSES.map(response => <label key={response} className={`rsvp-option ${answer === response ? 'is-selected' : ''}`}>
              <input type="radio" name="calendar-rsvp" value={response} checked={answer === response} onChange={() => respond(response)} />
              {t(`calendar.responses.${response}`)}
            </label>)}
          </div>
        </fieldset>}
        {reminders && <form className="detail-section form-stack" onSubmit={saveReminders}>
          <fieldset className="reminder-options" disabled={busy}>
            <legend className="heading-md">{t('calendar.entry.reminders')}</legend>
            <p className="field-hint">{t('calendar.form.remindersHint')}</p>
            <div className="reminder-grid">{REMINDER_OFFSETS.map(offset => <label className="checkbox-label" key={offset}>
              <input type="checkbox" checked={reminders.includes(offset)}
                disabled={!reminders.includes(offset) && reminders.length >= MAX_REMINDERS}
                onChange={() => setReminders(reminders.includes(offset) ? reminders.filter(value => value !== offset) : [...reminders, offset].sort((a, b) => a - b))} />
              {t(`calendar.offsets.${offset}`)}
            </label>)}</div>
          </fieldset>
          <button className="btn btn-secondary" type="submit" disabled={busy}>{t('calendar.entry.saveReminders')}</button>
        </form>}
        <Participants entry={entry} own={own} busy={busy} onRemove={removeInvitee} />
        {entry.viewer.canManage && <section className="detail-section" aria-labelledby="entry-manage-heading">
          <h2 className="heading-md" id="entry-manage-heading">{t('calendar.entry.manage')}</h2>
          <EntityPicker id="entry-invite" type="musician" label={t('calendar.form.invite')} disabled={busy}
            exclude={entry.participants.map(person => person.userId)}
            onPick={userId => act(() => conduit.transmit(`${path}/invitees`, { method: 'POST', auth: true, body: { userIds: [userId] } }),
              t('calendar.entry.inviteSaved'), 'entry-people-heading')} />
          {draft && <details className="calendar-create">
            <summary>{t('calendar.entry.edit')}</summary>
            <CalendarEntryForm id="edit-entry" draft={draft} onChange={value => { setDraft(value); setDirty(true); }} busy={busy}
              submitLabel={t('calendar.form.save')} onSubmit={saveDraft} />
          </details>}
          <div className="compact-actions">
            {entry.status === 'cancelled'
              ? <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => update({ status: 'scheduled' })}>{t('calendar.entry.restore')}</button>
              : <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => {
                if (window.confirm(t('calendar.entry.cancelConfirm'))) update({ status: 'cancelled' });
              }}>{t('calendar.entry.cancel')}</button>}
            <button className="btn btn-ghost" type="button" disabled={busy} onClick={removeEntry}>{t('calendar.entry.remove')}</button>
          </div>
        </section>}
      </>}
    </div>
  );
}
