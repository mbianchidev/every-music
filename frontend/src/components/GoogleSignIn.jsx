import { useEffect, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { finishSignIn } from '../lib/sign-in.js';
import TwoStepSignIn from './TwoStepSignIn.jsx';
import { t, useI18n } from '../lib/i18n.js';
import { errorText } from '../lib/error-text.js';

let sdk;
let pendingChallenge;
function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google.accounts.id);
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new Error(t('auth.google.timeout'))); }, 15000);
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (globalThis.google?.accounts?.id) resolve(globalThis.google.accounts.id);
      else reject(new Error(t('auth.google.initialize')));
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error(t('auth.google.load'))); };
    document.head.appendChild(script);
  }).catch(error => { sdk = null; throw error; });
  return sdk;
}

export default function GoogleSignIn({ onTwoFactor }) {
  const { t: translate, locale } = useI18n();
  const container = useRef(null);
  const twoFactorHandler = useRef(onTwoFactor);
  twoFactorHandler.current = onTwoFactor;
  const [challenge, setChallenge] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let signingIn = false;
    const initialize = async () => {
      const { clientId } = await conduit.transmit('/auth/google/config', { signal: controller.signal });
      if (!clientId || !active) return;
      setEnabled(true);
      if (globalThis.__TAURI_INTERNALS__) return;
      const identity = await loadGoogleIdentity();
      const challenge = pendingChallenge?.clientId === clientId && pendingChallenge.expiresAt > Date.now()
        ? pendingChallenge.value
        : await conduit.transmit('/auth/google/challenge', { method: 'POST', body: {}, signal: controller.signal });
      if (!active) return;
      pendingChallenge = { clientId, value: challenge, expiresAt: pendingChallenge?.value === challenge ? pendingChallenge.expiresAt : Date.now() + 4 * 60 * 1000 };
      identity.initialize({
        client_id: clientId, nonce: challenge.nonce, auto_select: false,
        callback: async ({ credential }) => {
          if (!active || signingIn) return;
          pendingChallenge = null;
          signingIn = true; setBusy(true); setError('');
          try {
            const response = await conduit.transmit('/auth/login/google', {
              method: 'POST', body: { idToken: credential, challengeId: challenge.id }, signal: controller.signal,
            });
            if (active && response.twoFactorRequired) (twoFactorHandler.current ?? setChallenge)(response);
            else if (active) finishSignIn(response);
          } catch (failure) { if (active) setError(errorText(failure)); }
          finally { signingIn = false; if (active) setBusy(false); }
        },
      });
      container.current.replaceChildren();
      // Google renders its own button text in the language active at this point.
      identity.renderButton(container.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', locale, width: Math.min(320, container.current.clientWidth || 280) });
    };
    setError('');
    initialize().catch(failure => { if (active) setError(errorText(failure)); });
    return () => { active = false; controller.abort(); };
  }, [revision]);
  return (
    <div className="google-signin" aria-busy={busy}>
      <div ref={container} />
      {enabled && globalThis.__TAURI_INTERNALS__ && <p className="field-hint">{translate('auth.google.webOnly')}</p>}
      {busy && <p role="status">{translate('auth.google.busy')}</p>}
      {challenge && <TwoStepSignIn challenge={challenge} onCancel={() => { setChallenge(null); setRevision(value => value + 1); }} />}
      {error && <><p className="field-error" role="alert">{error}</p><button className="text-link" type="button" onClick={() => { pendingChallenge = null; setRevision(value => value + 1); }}>{translate('auth.google.retry')}</button></>}
    </div>
  );
}
