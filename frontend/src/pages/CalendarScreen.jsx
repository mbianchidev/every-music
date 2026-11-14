import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { blankEntry, entryBody } from '../lib/calendar.js';
import PageHeader from '../components/PageHeader.jsx';
import CalendarView from '../components/CalendarView.jsx';
import CalendarEntryForm from '../components/CalendarEntryForm.jsx';
import { errorText } from '../lib/error-text.js';

export default function CalendarScreen() {
  const { t } = useI18n();
  const pages = useResource('/organizations/mine', { events: 'organizations.changed' });
  const [draft, setDraft] = useState(() => blankEntry());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const bands = (pages.data?.organizations ?? []).filter(item => item.kind === 'band' && item.permissions?.includes('manage_calendar'));
  const calendars = [{ id: null }, ...bands.map(item => ({ id: item.id, name: item.name }))];
  const create = async () => {
    setBusy(true); setError('');
    try {
      const entry = await conduit.transmit('/calendar/entries', { method: 'POST', auth: true, body: entryBody(draft, { creating: true }) });
      window.location.hash = `#calendar-entry?id=${entry.id}`;
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return (
    <div className="container">
      <PageHeader eyebrow={t('calendar.screen.eyebrow')} title={t('calendar.screen.title')} subtitle={t('calendar.screen.subtitle')} />
      <section className="card" aria-labelledby="calendar-list-heading">
        <h2 className="sr-only" id="calendar-list-heading">{t('calendar.screen.title')}</h2>
        <CalendarView path="/calendar" />
        <p className="field-hint">{t('calendar.screen.subscribe')} <a href="#settings?section=calendar">{t('calendar.screen.subscribeLink')}</a></p>
      </section>
      <section className="detail-section" aria-labelledby="calendar-new-heading">
        <h2 className="heading-md" id="calendar-new-heading">{t('calendar.screen.newEntry')}</h2>
        {pages.error && <p className="field-error" role="alert">{pages.error}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <CalendarEntryForm id="new-entry" draft={draft} onChange={setDraft} onSubmit={create} busy={busy} creating calendars={calendars} />
      </section>
    </div>
  );
}
