import { useEffect, useState } from 'react';
import conduit from '../lib/conduit.js';
import { useI18n } from '../lib/i18n.js';
import { useResource } from '../lib/resources.js';
import { signOut } from '../lib/sign-out.js';
import { CLIENT_VERSION, refreshApp, versionStatus } from '../lib/app-version.js';
import Icon from './Icon.jsx';
import Spinner from './Spinner.jsx';
import ProductTour from './ProductTour.jsx';
import UpdateInstructions from './UpdateInstructions.jsx';
import { errorText } from '../lib/error-text.js';

// Help and legal pages stay reachable while the app asks for an update or
// for acceptance of new terms, so people can read what they are agreeing to.
const OPEN_ROUTES = new Set(['help', 'legal']);
const DISMISSED_KEY = 'everymusic.update-dismissed';

function readDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY); } catch { return null; }
}

function UpdateRequired({ info }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <div className="container-narrow center-content">
      <section className="card update-required" aria-labelledby="update-required-title">
        <p className="eyebrow">{t('onboarding.version.requiredEyebrow')}</p>
        <h1 className="heading-lg" id="update-required-title">{t('onboarding.version.requiredTitle')}</h1>
        <p className="body-muted">{t('onboarding.version.requiredBody', { current: CLIENT_VERSION, minimum: info.minimumClientVersion })}</p>
        <button className="btn btn-primary" type="button" disabled={busy} onClick={() => { setBusy(true); void refreshApp(); }}>
          {busy ? t('onboarding.version.reloading') : t('onboarding.version.reload')}
        </button>
        <UpdateInstructions updateUrl={info.updateUrl} />
      </section>
    </div>
  );
}

function TermsPrompt({ state, onAccepted }) {
  const { t, formatDate } = useI18n();
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const accept = async () => {
    setBusy('accept'); setError('');
    try {
      await conduit.transmit('/legal/acceptance', { method: 'POST', auth: true, body: { termsVersion: state.termsVersion } });
      onAccepted();
    } catch (failure) {
      setError(errorText(failure));
      if (failure.code === 'TERMS_VERSION_CHANGED') onAccepted();
      setBusy('');
    }
  };
  return (
    <div className="container-narrow center-content">
      <section className="card terms-gate" aria-labelledby="terms-gate-title">
        <p className="eyebrow">{t('onboarding.terms.eyebrow')}</p>
        <h1 className="heading-lg" id="terms-gate-title">{t('onboarding.terms.title')}</h1>
        <p>{t('onboarding.terms.body', { version: state.termsVersion })}</p>
        {state.acceptedVersion && <p className="body-muted">{t('onboarding.terms.previous', {
          version: state.acceptedVersion, date: formatDate(state.acceptedAt),
        })}</p>}
        <ul className="terms-gate-links">
          <li><a href="#legal?page=terms">{t('onboarding.terms.read')}</a></li>
          <li><a href="#legal?page=privacy">{t('onboarding.terms.privacy')}</a></li>
        </ul>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="button-row">
          <button className="btn btn-primary" type="button" disabled={Boolean(busy)} onClick={accept}>
            {busy === 'accept' ? t('onboarding.terms.accepting') : t('onboarding.terms.accept')}
          </button>
          <button className="btn btn-ghost" type="button" disabled={Boolean(busy)} onClick={() => { setBusy('signout'); void signOut(); }}>
            {busy === 'signout' ? t('onboarding.terms.signingOut') : t('onboarding.terms.signOut')}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function ShellGate({ route, session, children }) {
  const { t } = useI18n();
  const version = useResource('/app/version', { auth: false });
  const terms = useResource(session.authorized ? '/legal/acceptance' : null);
  // Offline is already shown by the shell; the check retries on reconnect.
  const termsFailed = terms.error && terms.errorCode !== 'NETWORK_ERROR';
  const [dismissed, setDismissed] = useState(readDismissed);
  const [notice, setNotice] = useState('');
  const open = OPEN_ROUTES.has(route.name);
  const status = versionStatus(version.data);
  const { reload } = terms;

  useEffect(() => {
    if (version.error) console.warn('The supported app versions could not be checked', version.error);
  }, [version.error]);
  useEffect(() => { setNotice(''); }, [session.persona?.userId]);

  if (status === 'required' && !open) return <UpdateRequired info={version.data} />;
  if (session.authorized && !open) {
    if (!terms.data && !terms.error) return <Spinner label={t('common.actions.loading')} />;
    if (terms.data?.required) {
      return <TermsPrompt state={terms.data} onAccepted={() => {
        reload();
        window.dispatchEvent(new CustomEvent('everymusic:onboarding-changed'));
      }} />;
    }
  }
  const dismiss = () => {
    setDismissed(version.data.latestClientVersion);
    try { localStorage.setItem(DISMISSED_KEY, version.data.latestClientVersion); }
    catch (error) { console.warn('The dismissed update notice could not be remembered', error); }
  };
  return (
    <>
      {status === 'available' && dismissed !== version.data.latestClientVersion && <div className="update-banner" role="status">
        <p>{t('onboarding.version.available', { latest: version.data.latestClientVersion, current: CLIENT_VERSION })}</p>
        <a href="#help?view=updates">{t('onboarding.version.howTo')}</a>
        <button className="icon-button" type="button" aria-label={t('onboarding.version.dismiss')} onClick={dismiss}><Icon name="close" size={18} /></button>
      </div>}
      {session.authorized && termsFailed && <p className="field-error shell-notice" role="alert">
        {t('onboarding.terms.loadFailed')} {terms.error} <button className="text-link" type="button" onClick={reload}>{t('common.actions.retry')}</button>
      </p>}
      {notice && <p className="field-error shell-notice" role="alert">{notice} <button className="text-link" type="button" onClick={() => setNotice('')}>{t('common.actions.close')}</button></p>}
      {children}
      {session.authorized && terms.data && !terms.data.required && <ProductTour key={session.persona?.userId} userId={session.persona?.userId} onError={setNotice} />}
    </>
  );
}
