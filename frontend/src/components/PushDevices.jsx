import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import Spinner from './Spinner.jsx';
import ErrorState from './ErrorState.jsx';

export default function PushDevices() {
  const { t, formatDate } = useI18n();
  const resource = useResource('/push/devices');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const devices = resource.data?.devices ?? [];
  const providers = resource.data?.providers ?? {};
  const configured = Boolean(providers.android || providers.ios);
  if (resource.data && !configured && !devices.length) return null;

  const remove = async device => {
    setBusy(device.id); setError(''); setMessage('');
    try {
      await conduit.transmit(`/push/devices/${device.id}`, { method: 'DELETE', auth: true });
      setMessage(t('devices.removed', { device: t(`devices.platform.${device.platform}`) }));
      resource.reload();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="detail-section" aria-labelledby="push-devices-heading">
      <h2 className="heading-md" id="push-devices-heading">{t('devices.title')}</h2>
      <p>{t('devices.description')}</p>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {resource.error && <ErrorState title={t('devices.loadError')} message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error && <Spinner label={t('devices.loading')} />}
      {resource.data && !configured && <p className="status-message">{t('devices.notConfigured')}</p>}
      {resource.data && !devices.length && <p className="body-muted">{t('devices.empty')}</p>}
      {!!devices.length && (
        <ul className="project-list device-list">
          {devices.map(device => {
            const name = t(`devices.platform.${device.platform}`);
            return (
              <li className="card" key={device.id}>
                <h3>{name}</h3>
                <p>{t('devices.registered', { date: formatDate(device.createdAt) })}</p>
                <p>{t('devices.updated', { date: formatDate(device.updatedAt) })}</p>
                <div className="compact-actions">
                  <button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => remove(device)}
                    aria-label={t('devices.removeLabel', { device: name, date: formatDate(device.createdAt) })}>
                    {busy === device.id ? t('devices.removing') : t('devices.remove')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
