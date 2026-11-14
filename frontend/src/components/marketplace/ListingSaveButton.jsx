import { useEffect, useState } from 'react';
import conduit from '../../lib/conduit.js';
import { useI18n } from '../../lib/i18n.js';
import Icon from '../Icon.jsx';

export default function ListingSaveButton({ listing, mode = 'toggle', onChanged = () => {}, disabled = false }) {
  const { t } = useI18n();
  const [saved, setSaved] = useState(listing.isSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => setSaved(listing.isSaved), [listing.isSaved]);
  const removing = mode === 'remove' || saved;
  const toggle = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/marketplace/listings/${listing.id}/save`, { method: removing ? 'DELETE' : 'POST', auth: true });
      setSaved(!removing);
      setMessage(t(removing ? 'marketplace.actions.unsavedMessage' : 'marketplace.actions.savedMessage'));
      onChanged(!removing);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const label = mode === 'remove' ? t('marketplace.actions.unsaveLabel', { title: listing.title })
    : t(saved ? 'marketplace.actions.savedLabel' : 'marketplace.actions.saveLabel', { title: listing.title });
  return <>
    <button className="btn btn-tertiary" type="button" onClick={toggle} disabled={disabled || busy}
      aria-pressed={mode === 'remove' ? undefined : Boolean(saved)} aria-label={label}>
      <Icon name="bookmark" size={15} />
      {busy ? t('marketplace.actions.working') : t(mode === 'remove' ? 'marketplace.actions.unsave' : saved ? 'marketplace.actions.saved' : 'marketplace.actions.save')}
    </button>
    {error && <p className="field-error" role="alert">{error}</p>}
    {message && <p className="sr-only" role="status">{message}</p>}
  </>;
}
