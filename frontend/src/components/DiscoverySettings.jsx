import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useResource } from '../lib/resources.js';
import { useI18n } from '../lib/i18n.js';
import { locationEnabled, setLocationEnabled } from '../lib/geolocation.js';
import ErrorState from './ErrorState.jsx';
import BlockedUsers from './BlockedUsers.jsx';

// Location opt-in (stored only in this browser), profile-visit sharing
// consent and the blocked musicians list.
export default function DiscoverySettings() {
  const { t } = useI18n();
  const sharing = useResource('/profile-visits/sharing', { events: 'preferences.changed' });
  const [useLocation, setUseLocation] = useState(() => locationEnabled());
  const [share, setShare] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { if (sharing.data) setShare(sharing.data.share); }, [sharing.data]);
  const toggleLocation = enabled => {
    setError(''); setMessage('');
    if (!setLocationEnabled(enabled)) { setError(t('places.settings.storageFailed')); return; }
    setUseLocation(enabled);
    setMessage(t(enabled ? 'places.settings.enabled' : 'places.settings.disabled'));
  };
  const toggleSharing = async enabled => {
    setBusy(true); setError(''); setMessage(''); setShare(enabled);
    try {
      const saved = await conduit.transmit('/profile-visits/sharing', { method: 'PUT', auth: true, body: { share: enabled } });
      setShare(saved.share);
      setMessage(t(enabled ? 'profileExtras.visits.sharingOn' : 'profileExtras.visits.sharingOff'));
    } catch (failure) { setShare(!enabled); setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <>
      <section className="detail-section" aria-labelledby="location-settings-heading">
        <h2 className="heading-md" id="location-settings-heading">{t('places.settings.heading')}</h2>
        {error && <p className="error" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        <label className="checkbox-label">
          <input type="checkbox" checked={useLocation} onChange={event => toggleLocation(event.target.checked)} />
          {t('places.settings.useLocation')}
        </label>
        <p className="field-hint">{t('places.settings.explanation')}</p>
        <p className="field-hint">{t('places.attribution')} <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>)</p>
      </section>
      <section className="detail-section" aria-labelledby="visit-settings-heading">
        <h2 className="heading-md" id="visit-settings-heading">{t('profileExtras.visits.settingsHeading')}</h2>
        {sharing.error && <ErrorState message={sharing.error} onRetry={sharing.reload} />}
        {share !== null && <label className="checkbox-label">
          <input type="checkbox" checked={share} disabled={busy} onChange={event => toggleSharing(event.target.checked)} />
          {t('profileExtras.visits.share')}
        </label>}
        <p className="field-hint">{t('profileExtras.visits.shareExplanation')}</p>
      </section>
      <BlockedUsers />
    </>
  );
}
