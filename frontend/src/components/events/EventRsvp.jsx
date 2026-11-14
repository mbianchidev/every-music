import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';

export default function EventRsvp({ event, onChanged }) {
  const { t, formatNumber } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const current = event.viewer.attendance;
  const save = async body => {
    setBusy(true); setError(''); setMessage('');
    try {
      if (body) await conduit.transmit(`/gigs/${event.id}/attendance`, { method: 'PUT', auth: true, body });
      else await conduit.transmit(`/gigs/${event.id}/attendance`, { method: 'DELETE', auth: true });
      setMessage(t(body ? 'events.rsvp.saved' : 'events.rsvp.removed'));
      onChanged();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const closed = event.status === 'cancelled' || event.visibility !== 'published';
  return (
    <section className="detail-section event-rsvp" aria-labelledby="event-rsvp-heading">
      <h2 className="heading-md" id="event-rsvp-heading">{t('events.rsvp.heading')}</h2>
      <p className="body-muted">{t('events.rsvp.counts', {
        going: formatNumber(event.attendance.going), interested: formatNumber(event.attendance.interested),
      })}</p>
      {closed ? <p className="body-muted">{t(event.status === 'cancelled' ? 'events.rsvp.cancelled' : 'events.rsvp.draft')}</p> : <>
        <div className="compact-actions" role="group" aria-label={t('events.rsvp.heading')}>
          {['going', 'interested'].map(status => <button key={status} className={`btn ${current === status ? 'btn-primary' : 'btn-secondary'}`}
            type="button" aria-pressed={current === status} disabled={busy} onClick={() => save({ status })}>{t(`events.rsvp.${status}`)}</button>)}
          {current && <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => save(null)}>{t('events.rsvp.remove')}</button>}
        </div>
        {current === 'going' && <label className="checkbox-label">
          <input type="checkbox" checked={event.viewer.showOnProfile !== false} disabled={busy}
            onChange={changed => save({ status: current, showOnProfile: changed.target.checked })} />
          {t('events.rsvp.showOnProfile')}
        </label>}
      </>}
      <div role="status">{message && <p className="success">{message}</p>}</div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
