import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';

export default function FollowVisibilitySetting() {
  const { t } = useI18n();
  const resource = useResource('/follows/visibility', { reconnect: false });
  const [visible, setVisible] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (resource.data) setVisible(resource.data.visible); }, [resource.data]);
  const change = async next => {
    setBusy(true); setError(''); setMessage('');
    try {
      const saved = await conduit.transmit('/follows/visibility', { method: 'PUT', auth: true, body: { visible: next } });
      setVisible(saved.visible); setMessage(t('organizations.settings.saved'));
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="follow-visibility-heading">
      <h2 className="heading-md" id="follow-visibility-heading">{t('organizations.settings.title')}</h2>
      {resource.error && <p className="error" role="alert">{resource.error} <button className="text-link" type="button" onClick={resource.reload}>{t('organizations.common.retry')}</button></p>}
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}
      {visible !== null && <label className="checkbox-label">
        <input type="checkbox" checked={visible} disabled={busy} onChange={event => change(event.target.checked)} />
        {t('organizations.settings.visible')}
      </label>}
      <p className="body-muted">{t('organizations.settings.hint')}</p>
    </section>
  );
}
