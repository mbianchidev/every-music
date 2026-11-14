import { useEffect, useRef, useState } from 'react';
import conduit from '../lib/conduit.js';
import { finishSignIn } from '../lib/sign-in.js';

let sdk;
function loadGoogleIdentity() {
  if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google.accounts.id);
  if (sdk) return sdk;
  sdk = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timer = setTimeout(() => { script.remove(); reject(new Error('Google sign-in timed out. Check your connection and retry.')); }, 15000);
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      clearTimeout(timer);
      if (globalThis.google?.accounts?.id) resolve(globalThis.google.accounts.id);
      else reject(new Error('Google sign-in could not initialize.'));
    };
    script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Google sign-in could not load. Check browser privacy settings or use email.')); };
    document.head.appendChild(script);
  }).catch(error => { sdk = null; throw error; });
  return sdk;
}

export default function GoogleSignIn() {
  const container = useRef(null);
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
      const challenge = await conduit.transmit('/auth/google/challenge', { method: 'POST', body: {}, signal: controller.signal });
      if (!active) return;
      identity.initialize({
        client_id: clientId, nonce: challenge.nonce, auto_select: false,
        callback: async ({ credential }) => {
          if (!active || signingIn) return;
          signingIn = true; setBusy(true); setError('');
          try {
            const response = await conduit.transmit('/auth/login/google', {
              method: 'POST', body: { idToken: credential, challengeId: challenge.id }, signal: controller.signal,
            });
            if (active) finishSignIn(response);
          } catch (failure) { if (active) setError(failure.message); }
          finally { signingIn = false; if (active) setBusy(false); }
        },
      });
      container.current.replaceChildren();
      identity.renderButton(container.current, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: Math.min(320, container.current.clientWidth || 280) });
    };
    setError('');
    initialize().catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; controller.abort(); };
  }, [revision]);
  return (
    <div className="google-signin" aria-busy={busy}>
      <div ref={container} />
      {enabled && globalThis.__TAURI_INTERNALS__ && <p className="field-hint">Google sign-in uses a system browser and is available in the web app, not an embedded WebView. Use email sign-in or password recovery here.</p>}
      {busy && <p role="status">Signing in with Google...</p>}
      {error && <><p className="field-error" role="alert">{error}</p><button className="text-link" type="button" onClick={() => setRevision(value => value + 1)}>Retry Google sign-in</button></>}
    </div>
  );
}
