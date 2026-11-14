import { useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { saveFile } from '../lib/download.js';
import { endLocalSession } from '../lib/end-session.js';
import Spinner from './Spinner.jsx';
import ErrorState from './ErrorState.jsx';
import TwoFactorSettings from './TwoFactorSettings.jsx';
import ReauthenticationFields, { emptyReauthentication, reauthenticationBody, reauthenticationReady } from './ReauthenticationFields.jsx';

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const run = async (operation) => {
    setBusy(true); setError(''); setMessage('');
    try { setMessage(await operation() || ''); } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };
  const feedback = <>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="success" role="status">{message}</p>}
  </>;
  return { busy, run, feedback };
}

function SignOutEverywhere() {
  const { t } = useI18n();
  const { busy, run, feedback } = useAction();
  const revoke = () => {
    if (!window.confirm(t('accountSecurity.sessions.confirm'))) return;
    return run(async () => {
      await conduit.transmit('/account/sessions/revoke', { method: 'POST', auth: true, body: {} });
      await endLocalSession('#login?signedOut=everywhere');
    });
  };
  return (
    <section className="card account-trust-card" aria-labelledby="sessions-heading">
      <h3 id="sessions-heading">{t('accountSecurity.sessions.heading')}</h3>
      <p>{t('accountSecurity.sessions.intro')}</p>
      {feedback}
      <div><button className="btn btn-secondary" type="button" disabled={busy} onClick={revoke}>
        {busy ? t('accountSecurity.sessions.working') : t('accountSecurity.sessions.action')}
      </button></div>
    </section>
  );
}

function DataExport() {
  const { t } = useI18n();
  const { busy, run, feedback } = useAction();
  const download = () => run(async () => {
    const data = await conduit.transmit('/account/export', { auth: true });
    const file = `every-music-data-${new Date().toISOString().slice(0, 10)}.json`;
    saveFile(file, JSON.stringify(data, null, 2), 'application/json');
    return t('accountSecurity.export.done', { file });
  });
  return (
    <section className="card account-trust-card" aria-labelledby="export-heading">
      <h3 id="export-heading">{t('accountSecurity.export.heading')}</h3>
      <p>{t('accountSecurity.export.intro')}</p>
      {feedback}
      <div><button className="btn btn-secondary" type="button" disabled={busy} onClick={download}>
        {busy ? t('accountSecurity.export.working') : t('accountSecurity.export.action')}
      </button></div>
    </section>
  );
}

function AccountDeletion({ security }) {
  const { t } = useI18n();
  const { busy, run, feedback } = useAction();
  const [proof, setProof] = useState(emptyReauthentication);
  const [understood, setUnderstood] = useState(false);
  const secondFactor = security.twoFactor.enabled;
  const remove = event => {
    event.preventDefault();
    return run(async () => {
      await conduit.transmit('/account', { method: 'DELETE', auth: true, body: { ...reauthenticationBody(proof), confirm: true } });
      await endLocalSession('#login?accountDeleted=1');
    });
  };
  return (
    <section className="card account-trust-card danger-zone" aria-labelledby="deletion-heading">
      <h3 id="deletion-heading">{t('accountSecurity.deletion.heading')}</h3>
      <p>{t('accountSecurity.deletion.intro')}</p>
      <h4>{t('accountSecurity.deletion.whatHappens')}</h4>
      <ul className="deletion-facts">
        {['profile', 'conversations', 'reports', 'backups'].map(key => <li key={key}>{t(`accountSecurity.deletion.${key}`)}</li>)}
      </ul>
      <p className="body-muted">{t('accountSecurity.deletion.exportFirst')}</p>
      {feedback}
      <form className="form-stack" onSubmit={remove}>
        <ReauthenticationFields id="account-deletion" security={security} values={proof} onChange={setProof} disabled={busy} secondFactor={secondFactor} />
        <label className="checkbox-label"><input type="checkbox" checked={understood} onChange={event => setUnderstood(event.target.checked)} disabled={busy} />
          {t('accountSecurity.deletion.confirmCheck')}</label>
        <button className="btn btn-danger" type="submit" disabled={busy || !understood || !reauthenticationReady(security, proof, secondFactor)}>
          {busy ? t('accountSecurity.deletion.working') : t('accountSecurity.deletion.action')}
        </button>
      </form>
    </section>
  );
}

export default function SecuritySettings() {
  const { t } = useI18n();
  const resource = useResource('/account/security', { events: 'security.changed' });
  return (
    <section className="detail-section account-trust" aria-labelledby="security-heading">
      <h2 className="heading-md" id="security-heading">{t('accountSecurity.heading')}</h2>
      <p className="body-muted">{t('accountSecurity.intro')}</p>
      {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
      {!resource.data && !resource.error ? <Spinner label={t('accountSecurity.loading')} /> : resource.data && <>
        <TwoFactorSettings security={resource.data} onChanged={resource.reload} />
        <SignOutEverywhere />
        <DataExport />
        <AccountDeletion security={resource.data} />
      </>}
    </section>
  );
}
