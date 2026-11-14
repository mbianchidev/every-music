import { OAuth2Client } from 'google-auth-library';
import { realmConfig } from '../../config/realm.js';
import { requestError } from './request-error.js';

class GoogleIdentityBridge {
  constructor() {
    this.client = null;
    this.logger = console;
  }

  initialize(logger = console) {
    this.logger = logger;

    if (realmConfig.googleGateway.identityKey) {
      this.client = new OAuth2Client(realmConfig.googleGateway.identityKey);
      this.logger.info('Google identity bridge initialized');
    } else {
      this.logger.info('Google identity bridge is not configured');
    }
  }

  async verifyCredential(idToken) {
    if (!this.client) {
      throw requestError(503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured on this server');
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken: idToken,
        audience: realmConfig.googleGateway.identityKey,
      });

      const payload = ticket.getPayload();
      
      return {
        googleId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        name: payload.name,
        picture: payload.picture,
        givenName: payload.given_name,
        familyName: payload.family_name,
        nonce: payload.nonce,
      };
    } catch (err) {
      this.logger.warn({ code: err.code }, 'Google credential verification failed');
      const unavailable = ['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT'].includes(err.code) || err.response?.status >= 500;
      throw requestError(unavailable ? 502 : 401, 'GOOGLE_VERIFICATION_FAILED',
        unavailable ? 'Google sign-in is temporarily unavailable. Try again.' : 'Google sign-in expired or was invalid. Try again.');
    }
  }
}

export const googleIdentityBridge = new GoogleIdentityBridge();
