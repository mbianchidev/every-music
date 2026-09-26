import { OAuth2Client } from 'google-auth-library';
import { realmConfig } from '../../config/realm.js';

class GoogleIdentityBridge {
  constructor() {
    this.client = null;
    this.logger = console;
  }

  initialize(logger = console) {
    this.logger = logger;

    if (realmConfig.googleGateway.identityKey && realmConfig.googleGateway.identityLock) {
      this.client = new OAuth2Client(
        realmConfig.googleGateway.identityKey,
        realmConfig.googleGateway.identityLock
      );
      this.logger.info('Google identity bridge initialized');
    } else {
      this.logger.info('Google identity bridge is not configured');
    }
  }

  async verifyCredential(idToken) {
    if (!this.client) {
      throw new Error('Google identity bridge not initialized');
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
      };
    } catch (err) {
      this.logger.warn({ err }, 'Google credential verification failed');
      throw new Error('Google credential verification failed');
    }
  }
}

export const googleIdentityBridge = new GoogleIdentityBridge();
