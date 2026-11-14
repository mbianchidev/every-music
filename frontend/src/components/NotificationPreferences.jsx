import { useEffect, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import {
  NOTIFICATION_CHANNELS, groupNotificationKinds, notificationKindLabel,
} from '../lib/notification-text.js';
import ErrorState from './ErrorState.jsx';
import Spinner from './Spinner.jsx';

const requestedSection = () => new URLSearchParams(window.location.hash.split('?')[1] || '').get('section');

export default function NotificationPreferences() {
  const { t } = useI18n();
  const resource = useResource('/preferences/notifications', { events: 'preferences.changed', reconnect: false });
  const [overview, setOverview] = useState(null);
  const [changes, setChanges] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const heading = useRef(null);
  const revealed = useRef(false);
  useEffect(() => { if (resource.data) setOverview(resource.data); }, [resource.data]);
  useEffect(() => {
    if (overview && !revealed.current && requestedSection() === 'notifications') {
      revealed.current = true;
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: 'start' });
    }
  }, [overview]);

  const value = (item, channel) => changes[item.kind]?.[channel] ?? item.channels[channel].enabled;
  const toggle = (kind, channel, enabled) => {
    setMessage('');
    setChanges(previous => ({ ...previous, [kind]: { ...previous[kind], [channel]: enabled } }));
  };
  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await conduit.transmit('/preferences/notifications', { method: 'PUT', auth: true, body: { kinds: changes } });
      setOverview(saved); setChanges({}); setMessage(t('notifications.preferences.saved'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };

  const notes = (item) => {
    const list = [];
    if (item.category && !item.categoryEnabled) {
      list.push(t('notifications.preferences.categoryOff', { category: t(`notifications.categories.${item.category}`) }));
    }
    if (item.planFeature) {
      list.push(t(item.planAllowed ? 'notifications.preferences.planIncluded' : 'notifications.preferences.planMissing'));
    }
    return list;
  };

  return (
    <section className="detail-section notification-preferences" aria-labelledby="notification-preferences-heading">
      <h2 className="heading-md" id="notification-preferences-heading" ref={heading} tabIndex={-1}>
        {t('notifications.preferences.heading')}
      </h2>
      {resource.error && !overview && (
        <ErrorState title={t('notifications.preferences.loadError')} message={resource.error} onRetry={resource.reload} />
      )}
      {!overview && !resource.error ? <Spinner label={t('notifications.preferences.loading')} /> : overview && (
        <form className="form-stack" onSubmit={save}>
          <p>{t('notifications.preferences.intro')}</p>
          <ul className="notification-channel-notes">
            <li id="notification-unavailable-help">{t('notifications.preferences.unavailableHelp')}</li>
            <li>{t('notifications.preferences.emailAddress', { email: overview.email.address })}</li>
            {!overview.email.verified && <li>{t('notifications.preferences.emailUnverified')}</li>}
            {!overview.email.configured && <li>{t('notifications.preferences.emailNotConfigured')}</li>}
            <li>{t(overview.pushConfigured ? 'notifications.preferences.pushOff' : 'notifications.preferences.pushNotConfigured')}</li>
          </ul>
          {groupNotificationKinds(overview.kinds).map(({ group, kinds }) => (
            <div className="notification-group" key={group}>
              <h3 className="notification-group-heading">{t(`notifications.groups.${group}`)}</h3>
              {kinds.map((item) => {
                const label = notificationKindLabel(t, item.kind);
                const itemNotes = notes(item);
                const noteId = `notification-note-${item.kind}`;
                return (
                  <fieldset className="notification-kind" key={item.kind} disabled={busy}
                    aria-describedby={itemNotes.length ? noteId : undefined}>
                    <legend>{label}</legend>
                    <div className="notification-channels">
                      {NOTIFICATION_CHANNELS.map((channel) => {
                        const unavailable = item.channels[channel].availability === 'off';
                        return (
                          <label className="checkbox-label" key={channel}>
                            <input
                              type="checkbox"
                              checked={!unavailable && value(item, channel)}
                              disabled={unavailable}
                              aria-describedby={unavailable ? 'notification-unavailable-help' : undefined}
                              onChange={event => toggle(item.kind, channel, event.target.checked)}
                            />
                            {t(`notifications.channels.${channel}`)}
                            {unavailable && ` (${t('notifications.preferences.unavailable')})`}
                          </label>
                        );
                      })}
                    </div>
                    {itemNotes.length > 0 && <p className="body-muted notification-kind-note" id={noteId}>{itemNotes.join(' ')}</p>}
                  </fieldset>
                );
              })}
            </div>
          ))}
          {error && <p className="error" role="alert">{error}</p>}
          {message && <p className="success" role="status">{message}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t('notifications.preferences.saving') : t('notifications.preferences.save')}
          </button>
        </form>
      )}
    </section>
  );
}
