import { OAuth2Client } from 'google-auth-library';
import { realmConfig } from '../../config/realm.js';

class GoogleIdentityBridge {
  constructor() {
    this.client = null;
  }

  initialize() {
    if (realmConfig.googleGateway.identityKey && realmConfig.googleGateway.identityLock) {
      this.client = new OAuth2Client(
        realmConfig.googleGateway.identityKey,
        realmConfig.googleGateway.identityLock
      );
      console.log('✓ Google identity bridge initialized');
    } else {
      console.warn('⚠ Google identity bridge not configured');
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
      throw new Error(`Google verification failed: ${err.message}`);
    }
  }
}

export const googleIdentityBridge = new GoogleIdentityBridge();
