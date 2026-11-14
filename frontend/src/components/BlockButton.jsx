import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

// Blocks a musician from their profile. Blocking also removes follows in
// both directions; conversations keep their own block rules.
export default function BlockButton({ userId, name, blocked, onChanged = () => {} }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const toggle = async () => {
    if (!blocked && !window.confirm(t('profileExtras.block.confirm', { name }))) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await conduit.transmit(`/profiles/${userId}/block`, { method: blocked ? 'DELETE' : 'POST', auth: true });
      setMessage(t(blocked ? 'profileExtras.block.unblocked' : 'profileExtras.block.blocked', { name }));
      onChanged();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return <>
    <button className="btn btn-ghost" type="button" disabled={busy} onClick={toggle}>
      {busy ? t('common.actions.saving') : blocked ? t('profileExtras.block.unblock') : t('profileExtras.block.block')}
    </button>
    {error && <p className="field-error" role="alert">{error}</p>}
    {message && <p className="field-hint" role="status">{message}</p>}
  </>;
}
