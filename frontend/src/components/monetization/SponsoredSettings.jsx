import { useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useResource } from '../../lib/resources.js';
import { useI18n } from '../../lib/i18n.js';
import Spinner from '../Spinner.jsx';
import ErrorState from '../ErrorState.jsx';

// Premium perk: paid plans may hide first-party sponsored cards.
export default function SponsoredSettings() {
  const { t } = useI18n();
  const resource = useResource('/monetization/settings', { events: 'entitlements.changed', reconnect: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const data = resource.data;
  const change = async (event) => {
    const hideSponsored = event.target.checked;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit('/monetization/settings', { method: 'PUT', auth: true, body: { hideSponsored } });
      setMessage(t('monetization.settings.saved'));
      resource.reload();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return (
    <section className="detail-section" aria-labelledby="sponsored-settings-heading">
      <h2 className="heading-md" id="sponsored-settings-heading">{t('monetization.settings.title')}</h2>
      <p>{t('monetization.settings.text')}</p>
      {resource.error && <ErrorState title={t('monetization.settings.loadError')} message={resource.error} onRetry={resource.reload} />}
      {!data && !resource.error ? <Spinner label={t('monetization.settings.loading')} /> : data && <>
        <label className="checkbox-label">
          <input type="checkbox" checked={data.hideSponsored} disabled={busy || (!data.eligible && !data.hideSponsored)}
            aria-describedby={data.eligible ? undefined : 'sponsored-settings-premium'} onChange={change} />
          {t('monetization.settings.hide')}
        </label>
        {!data.eligible && <p className="field-hint" id="sponsored-settings-premium">{t('monetization.settings.premiumOnly')} <a href="#store">{t('monetization.settings.upgrade')}</a></p>}
      </>}
      {message && <p className="success" role="status">{message}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
