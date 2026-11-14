import { useMemo } from 'react';
import { useI18n } from '../lib/i18n.js';
import { CALENDAR_KINDS, MAX_REMINDERS, REMINDER_OFFSETS, timeZones } from '../lib/calendar.js';
import FormField from './FormField.jsx';
import PlacePicker from './PlacePicker.jsx';
import EntityPicker from './EntityPicker.jsx';

// Create/edit form for calendar entries. `calendars` lists where a new entry
// can go ({ id: null } is the personal calendar); omit it to hide the choice.
export default function CalendarEntryForm({ id, draft, onChange, onSubmit, busy, creating = false, calendars, submitLabel }) {
  const { t } = useI18n();
  const zones = useMemo(() => timeZones(draft.timeZone), [draft.timeZone]);
  const set = changes => onChange({ ...draft, ...changes });
  const invalidRange = draft.startLocal && draft.endLocal && draft.endLocal <= draft.startLocal;
  const toggleReminder = offset => set({
    reminderOffsets: draft.reminderOffsets.includes(offset)
      ? draft.reminderOffsets.filter(value => value !== offset) : [...draft.reminderOffsets, offset].sort((a, b) => a - b),
  });
  return (
    <form className="form-stack calendar-form" onSubmit={event => { event.preventDefault(); if (!invalidRange) onSubmit(); }}>
      {calendars && calendars.length > 1 && <FormField id={`${id}-calendar`} label={t('calendar.form.calendar')}>
        <select className="input" value={draft.organizationId ?? ''} disabled={busy} onChange={event => set({ organizationId: event.target.value || null, invitees: [] })}>
          {calendars.map(item => <option key={item.id ?? 'personal'} value={item.id ?? ''}>{item.id ? t('calendar.form.band', { name: item.name }) : t('calendar.form.personal')}</option>)}
        </select>
      </FormField>}
      <div className="form-grid">
        <FormField id={`${id}-kind`} label={t('calendar.form.kind')} required>
          <select className="input" value={draft.kind} disabled={busy} onChange={event => set({ kind: event.target.value })}>
            {CALENDAR_KINDS.map(kind => <option key={kind} value={kind}>{t(`calendar.kinds.${kind}`)}</option>)}
          </select>
        </FormField>
        <FormField id={`${id}-title`} label={t('calendar.form.title')} required>
          <input className="input" value={draft.title} maxLength="200" disabled={busy} onChange={event => set({ title: event.target.value })} />
        </FormField>
        <FormField id={`${id}-start`} label={t('calendar.form.starts')} required>
          <input className="input" type="datetime-local" value={draft.startLocal} disabled={busy} onChange={event => set({ startLocal: event.target.value })} />
        </FormField>
        <FormField id={`${id}-end`} label={t('calendar.form.ends')} required error={invalidRange ? t('calendar.form.endBeforeStart') : undefined}>
          <input className="input" type="datetime-local" value={draft.endLocal} min={draft.startLocal} disabled={busy} onChange={event => set({ endLocal: event.target.value })} />
        </FormField>
      </div>
      <FormField id={`${id}-zone`} label={t('calendar.form.timeZone')} hint={t('calendar.form.timeZoneHint')} required>
        <select className="input" value={draft.timeZone} disabled={busy} onChange={event => set({ timeZone: event.target.value })}>
          {zones.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>)}
        </select>
      </FormField>
      <PlacePicker id={`${id}-place`} label={t('calendar.form.city')} hint={t('calendar.form.cityHint')} value={draft.place} text={draft.placeText}
        disabled={busy} onChange={place => set({ place })} onText={placeText => set({ placeText })} />
      <FormField id={`${id}-address`} label={t('calendar.form.address')} hint={t('calendar.form.addressHint')}>
        <input className="input" value={draft.address} maxLength="500" disabled={busy} onChange={event => set({ address: event.target.value })} />
      </FormField>
      <FormField id={`${id}-notes`} label={t('calendar.form.notes')}>
        <textarea className="input" rows="3" value={draft.notes} maxLength="4000" disabled={busy} onChange={event => set({ notes: event.target.value })} />
      </FormField>
      {creating && <>
        <fieldset className="reminder-options" disabled={busy}>
          <legend>{t('calendar.form.reminders')}</legend>
          <p className="field-hint">{t('calendar.form.remindersHint')}</p>
          <div className="reminder-grid">{REMINDER_OFFSETS.map(offset => <label className="checkbox-label" key={offset}>
            <input type="checkbox" checked={draft.reminderOffsets.includes(offset)} onChange={() => toggleReminder(offset)}
              disabled={!draft.reminderOffsets.includes(offset) && draft.reminderOffsets.length >= MAX_REMINDERS} />
            {t(`calendar.offsets.${offset}`)}
          </label>)}</div>
        </fieldset>
        <div className="calendar-invitees">
          <EntityPicker id={`${id}-invite`} type="musician" label={t('calendar.form.invite')} disabled={busy}
            exclude={draft.invitees.map(person => person.id)}
            onPick={(personId, label) => set({ invitees: [...draft.invitees, { id: personId, label }] })} />
          <p className="field-hint">{t('calendar.form.inviteHint')}</p>
          {draft.invitees.length > 0 && <ul className="inline-list" aria-label={t('calendar.form.invited')}>
            {draft.invitees.map(person => <li className="tag" key={person.id}>{person.label}
              <button className="text-link" type="button" disabled={busy} onClick={() => set({ invitees: draft.invitees.filter(item => item.id !== person.id) })}>
                {t('calendar.form.removeInvitee', { name: person.label })}
              </button>
            </li>)}
          </ul>}
        </div>
      </>}
      <button className="btn btn-primary" type="submit" disabled={busy || !draft.title.trim() || invalidRange}>
        {busy ? t('calendar.form.saving') : submitLabel || t('calendar.form.create')}
      </button>
    </form>
  );
}
