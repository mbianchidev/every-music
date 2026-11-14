import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { saveFile } from '../../lib/download.js';
import { useI18n } from '../../lib/i18n.js';
import { REMINDER_PRESETS, calendarFileName, reminderAvailable } from '../../lib/events.js';
import { errorText } from '../../lib/error-text.js';

// Calendar file and Google Calendar link, plus user-chosen reminders.
export default function EventPlanning({ event, onChanged }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [offsets, setOffsets] = useState(event.viewer.reminders || []);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const download = async () => {
    setDownloading(true); setError(''); setMessage('');
    try {
      const response = await conduit.transmit(`/gigs/${event.id}/calendar.ics`, { auth: true, stream: true });
      const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || calendarFileName(event.title);
      saveFile(name, await response.text(), 'text/calendar');
      setMessage(t('events.calendar.downloaded'));
    } catch (failure) { setError(errorText(failure)); }
    finally { setDownloading(false); }
  };
  const save = async submitted => {
    submitted.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/gigs/${event.id}/reminders`, { method: 'PUT', auth: true, body: { offsets } });
      setMessage(t(offsets.length ? 'events.reminders.saved' : 'events.reminders.cleared'));
      onChanged();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  const remindable = event.upcoming && event.status !== 'cancelled' && event.visibility === 'published';
  return (
    <section className="detail-section event-planning" aria-labelledby="event-calendar-heading">
      <h2 className="heading-md" id="event-calendar-heading">{t('events.calendar.heading')}</h2>
      <div className="compact-actions">
        <button className="btn btn-secondary" type="button" disabled={downloading} onClick={download}>
          {downloading ? t('events.calendar.downloading') : t('events.calendar.ics')}</button>
        <a className="btn btn-ghost" href={event.calendar.googleUrl} target="_blank" rel="noopener noreferrer">
          {t('events.calendar.google')}<span className="sr-only"> {t('events.detail.external')}</span></a>
      </div>
      {remindable && <form className="form-stack" onSubmit={save}>
        <fieldset disabled={busy}>
          <legend>{t('events.reminders.heading')}</legend>
          <p className="field-hint">{t('events.reminders.intro')}</p>
          <div className="choice-grid">{REMINDER_PRESETS.map(minutes => {
            const available = reminderAvailable(event, minutes);
            return <label className="checkbox-label" key={minutes}>
              <input type="checkbox" checked={offsets.includes(minutes)} disabled={!available && !offsets.includes(minutes)}
                onChange={changed => setOffsets(previous => (changed.target.checked ? [...previous, minutes] : previous.filter(value => value !== minutes)))} />
              {t(`events.reminders.offsets.${minutes}`)}{!available && <span className="body-muted"> {t('events.reminders.passed')}</span>}
            </label>;
          })}</div>
        </fieldset>
        <div><button className="btn btn-secondary" type="submit" disabled={busy}>{busy ? t('events.reminders.saving') : t('events.reminders.save')}</button></div>
      </form>}
      <div role="status">{message && <p className="success">{message}</p>}</div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
