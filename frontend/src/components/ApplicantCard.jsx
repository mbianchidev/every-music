import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import Avatar from './Avatar.jsx';
import Icon from './Icon.jsx';
import FormField from './FormField.jsx';
import ApplicationDetails from './ApplicationDetails.jsx';

export const OWNER_STATUSES = ['new', 'shortlisted', 'accepted', 'declined'];

export default function ApplicantCard({ application, showAnnouncement = false, onChanged = () => {} }) {
  const { t, formatDate } = useI18n();
  const { applicant, announcement } = application;
  const name = applicant.artistName;
  const [note, setNote] = useState(application.ownerNote ?? '');
  const [status, setStatus] = useState(application.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setNote(application.ownerNote ?? ''), [application.ownerNote]);
  useEffect(() => setStatus(application.status), [application.status]);
  // Controls stay enabled while saving so keyboard focus is never dropped.
  const run = async (operation, success) => {
    if (busy) return false;
    setBusy(true); setError(''); setMessage('');
    try {
      await operation();
      if (success) setMessage(success);
      return true;
    } catch (failure) { setError(failure.message); return false; }
    finally { setBusy(false); }
  };
  const update = (body, success) => run(async () => {
    await conduit.transmit(`/applications/${application.id}`, { method: 'PATCH', auth: true, body });
    onChanged();
  }, success);
  const startConversation = () => run(async () => {
    const result = await conduit.transmit('/conversations', { method: 'POST', auth: true, body: { recipientUserId: applicant.userId } });
    window.location.hash = `#messages?id=${result.id}`;
  });
  const id = application.id;
  return (
    <article className="card application-card" aria-labelledby={`applicant-${id}`}>
      <div className="musician-summary application-summary">
        <Avatar name={name} src={applicant.pictureUrl} />
        <div>
          <h2 className="heading-md" id={`applicant-${id}`}><a href={`#musician?id=${applicant.userId}`}>{name}</a></h2>
          <p className="body-muted application-meta"><Icon name="location" size={13} />{applicant.city || t('applications.card.locationUnknown')}</p>
        </div>
        <span className="tag application-status">{t(`applications.status.${application.status}`)}</span>
      </div>
      {showAnnouncement && <p className="application-meta">
        <a href={`#applications?announcement=${announcement.id}`}>{t('applications.card.appliedTo', { title: announcement.title })}</a>
        {!announcement.isOpen && <span className="tag tag-muted">{t('applications.card.closed')}</span>}
      </p>}
      <p className="field-hint"><time dateTime={application.createdAt}>{t('applications.card.appliedOn', { date: formatDate(application.createdAt) })}</time></p>
      {!!applicant.instruments.length && <>
        <h3 className="application-label">{t('applications.card.plays')}</h3>
        <div className="tag-list">{applicant.instruments.map(item => (
          <span className="tag tag-muted" key={item.instrumentId}>{item.skillLevel ? `${item.name} (${t(`applications.skill.${item.skillLevel}`)})` : item.name}</span>
        ))}</div>
      </>}
      <ApplicationDetails application={application} />
      <div className="application-controls">
        <FormField id={`application-status-${id}`} label={t('applications.card.statusLabel', { name })}
          hint={announcement.isOpen ? undefined : t('applications.card.closedHint')}>
          <select className="input" value={status} disabled={!announcement.isOpen} onChange={async event => {
            const next = event.target.value;
            setStatus(next);
            if (!await update({ status: next }, t('applications.card.statusSaved', { status: t(`applications.status.${next}`) }))) setStatus(application.status);
          }}>
            {OWNER_STATUSES.map(status => <option key={status} value={status}>{t(`applications.status.${status}`)}</option>)}
          </select>
        </FormField>
        <form className="application-note" onSubmit={event => { event.preventDefault(); update({ ownerNote: note }, t('applications.card.noteSaved')); }}>
          <FormField id={`application-note-${id}`} label={t('applications.card.note', { name })} hint={t('applications.card.noteHint')}>
            <textarea className="input" rows="2" maxLength="2000" value={note} onChange={event => setNote(event.target.value)} />
          </FormField>
          <button className="btn btn-secondary" type="submit" aria-label={t('applications.card.saveNoteNamed', { name })}>{t('applications.card.saveNote')}</button>
        </form>
      </div>
      <div className="compact-actions">
        <button className="btn btn-primary" type="button" disabled={!application.canMessage} onClick={startConversation}
          aria-label={t('applications.card.messageApplicantNamed', { name })}>
          <Icon name="message" size={16} />{t('applications.card.messageApplicant')}
        </button>
        {!application.canMessage && <p className="field-hint">{t('applications.card.messagingUnavailable')}</p>}
      </div>
      {busy && <p className="sr-only" role="status">{t('applications.card.working')}</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
    </article>
  );
}
