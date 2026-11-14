import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { describeFilters, savedSearchFilters } from '../lib/discovery.js';
import FormField from './FormField.jsx';
import ModalDialog from './ModalDialog.jsx';
import { errorText } from '../lib/error-text.js';

// Saves the current feed filters and opts in to notifications for new matches.
export default function SaveSearchButton({ filters, nearMe, catalogs }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const body = savedSearchFilters(filters, nearMe);
  const empty = Object.keys(body).length === 0;
  const start = () => {
    setName(describeFilters({ ...filters, placeLabel: nearMe ? t('places.nearMe.label') : filters.placeLabel }, catalogs, t).slice(0, 100)
      || t('discoveryExtras.save.defaultName'));
    setNotify(true); setError(''); setSaved(''); setOpen(true);
  };
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const created = await conduit.transmit('/saved-searches', { method: 'POST', auth: true, body: { name: name.trim(), filters: body, notify } });
      setOpen(false);
      setSaved(t('discoveryExtras.save.saved', { name: created.name }));
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  };
  return <>
    <button className="btn btn-secondary" type="button" aria-haspopup="dialog" disabled={empty} onClick={start}>{t('discoveryExtras.save.button')}</button>
    {empty && <span className="field-hint">{t('discoveryExtras.save.emptyHint')}</span>}
    {saved && <p className="field-hint" role="status">{saved} <a href="#saved-searches">{t('discoveryExtras.save.manage')}</a></p>}
    <ModalDialog title={t('discoveryExtras.save.title')} open={open} onClose={() => setOpen(false)}>
      <p>{t('discoveryExtras.save.explanation')}</p>
      {nearMe && <p className="field-hint">{t('discoveryExtras.save.nearMeNote')}</p>}
      {error && <p className="field-error" role="alert">{error} <a href="#saved-searches">{t('discoveryExtras.save.manage')}</a></p>}
      <form className="form-stack" onSubmit={submit}>
        <FormField id="saved-search-name" label={t('discoveryExtras.save.name')} required>
          <input className="input" value={name} maxLength="100" disabled={busy} onChange={event => setName(event.target.value)} />
        </FormField>
        <label className="checkbox-label"><input type="checkbox" checked={notify} disabled={busy} onChange={event => setNotify(event.target.checked)} />
          {t('discoveryExtras.save.notify')}</label>
        <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>{busy ? t('common.actions.saving') : t('discoveryExtras.save.submit')}</button>
      </form>
    </ModalDialog>
  </>;
}
