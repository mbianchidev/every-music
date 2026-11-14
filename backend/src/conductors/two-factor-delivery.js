import { realmConnector } from '../repositories/realm-connector.js';
import { twoFactorRepository, maskEmail, maskPhone } from '../repositories/two-factor-repository.js';
import { accountMailer } from '../engines/account-mailer.js';
import { createSmsGateway } from '../engines/sms-gateway.js';
import { cipherEngine } from '../engines/cipher-engine.js';
import { secretBox } from '../engines/secret-box.js';

// Delivers one-time codes and starts the second sign-in step. Shared by the
// password and Google sign-in flows, which call beginLogin after the first
// factor succeeds and before any token is issued.
class TwoFactorDelivery {
  constructor() {
    this.sms = createSmsGateway();
    this.logger = console;
  }

  configure({ sms, logger } = {}) {
    if (sms !== undefined) this.sms = sms;
    if (logger) this.logger = logger;
  }

  methods() {
    return ['totp', ...(accountMailer.available() ? ['email'] : []), ...(this.sms ? ['sms'] : [])];
  }

  async deliver(method, destination, purpose, code) {
    if (!destination) return false;
    if (method === 'email') return accountMailer.sendCode(destination, purpose, code);
    if (method !== 'sms' || !this.sms) return false;
    try {
      await this.sms.send(destination, `Every.music: ${code} is your verification code. It expires in 10 minutes.`);
      return true;
    } catch (error) {
      // Provider errors can echo phone numbers, so log only the status.
      this.logger.error({ provider: this.sms.name, statusCode: error.statusCode }, 'SMS code delivery failed');
      return false;
    }
  }

  destination(row, email) {
    if (row.method === 'email') return { destination: email, hint: maskEmail(email) };
    if (row.method !== 'sms') return { destination: null, hint: null };
    try {
      const phone = secretBox.open(row.phone_number);
      return { destination: phone, hint: maskPhone(phone) };
    } catch (error) {
      if (error.code !== 'TWO_FACTOR_KEY_CHANGED') throw error;
      return { destination: null, hint: null };
    }
  }

  async beginLogin(identity) {
    const row = await twoFactorRepository.enabled(realmConnector, identity.id);
    if (!row) return null;
    await twoFactorRepository.assertNotLocked(realmConnector, identity.id);
    const code = row.method === 'totp' ? null : cipherEngine.generateNumericCode(6);
    const { destination, hint } = this.destination(row, identity.email);
    const { token, expiresAt } = await twoFactorRepository.createChallenge(identity.id, row.method, code);
    return {
      twoFactorRequired: true,
      challengeToken: token,
      method: row.method,
      destinationHint: hint,
      codeSent: code ? await this.deliver(row.method, destination, 'login', code) : null,
      expiresAt,
    };
  }
}

export const twoFactorDelivery = new TwoFactorDelivery();
