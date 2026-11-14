import { realmConfig } from '../config/realm.js';
import { googleIdentityBridge } from '../src/engines/google-identity-bridge.js';
import { requestError } from '../src/engines/request-error.js';
import { startNexus } from '../src/nexus.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString
  || realmConfig.nexus.host !== '127.0.0.1'
  || realmConfig.googleGateway.identityKey !== 'synthetic-browser.apps.googleusercontent.com') {
  throw new Error('The browser provider fixture requires an isolated test database, loopback host, and synthetic Google client');
}

googleIdentityBridge.verifyCredential = async credential => {
  let claims;
  try { claims = JSON.parse(credential); }
  catch { throw requestError(401, 'SYNTHETIC_PROVIDER_INVALID', 'Invalid synthetic provider credential'); }
  if (!claims || claims.provider !== 'synthetic-browser-google' || typeof claims.nonce !== 'string'
    || !/^browser-[a-f0-9]{8}(?:-old)?-google@example\.test$/.test(claims.email)
    || claims.googleId !== `synthetic-${claims.email}`) {
    throw requestError(401, 'SYNTHETIC_PROVIDER_INVALID', 'Invalid synthetic provider credential');
  }
  return {
    googleId: claims.googleId, email: claims.email, emailVerified: true,
    nonce: claims.nonce, givenName: 'Demo', familyName: 'Google',
  };
};

await startNexus();
