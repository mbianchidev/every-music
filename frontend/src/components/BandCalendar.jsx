import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { can } from '../lib/organizations.js';
import { blankEntry, entryBody } from '../lib/calendar.js';
import CalendarView from './CalendarView.jsx';
import CalendarEntryForm from './CalendarEntryForm.jsx';
import { errorText } from '../lib/error-text.js';

export default function BandCalendar({ organization }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState(() => blankEntry(organization.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const manage = can(organization, 'manage_calendar');
  const create = async () => {
    setBusy(true); setError('');
    try {
      const entry = await conduit.transmit('/calendar/entries', { method: 'POST', auth: true, body: entryBody(draft, { creating: true }) });
      window.location.hash = `#calendar-entry?id=${entry.id}`;
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="band-calendar-heading">
      <h2 className="heading-md" id="band-calendar-heading">{t('calendar.band.title')}</h2>
      <p className="body-muted">{t('calendar.band.intro')}</p>
      <CalendarView path={`/organizations/${organization.id}/calendar`} showCalendar={false} />
      {manage ? <details className="calendar-create">
        <summary>{t('calendar.band.add')}</summary>
        {error && <p className="error" role="alert">{error}</p>}
        <CalendarEntryForm id="band-entry" draft={draft} onChange={setDraft} onSubmit={create} busy={busy} creating />
      </details> : <p className="field-hint">{t('calendar.band.noPermission')}</p>}
    </section>
  );
}
