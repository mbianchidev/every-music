import { realmConnector } from '../repositories/realm-connector.js';
import { identityRepository } from '../repositories/identity-repository.js';
import { accountRepository } from '../repositories/account-repository.js';
import { twoFactorRepository, maskEmail, maskPhone } from '../repositories/two-factor-repository.js';
import { verificationRepository } from '../repositories/verification-repository.js';
import { authenticationConductor } from './authentication-conductor.js';
import { twoFactorDelivery } from './two-factor-delivery.js';
import { accountMailer } from '../engines/account-mailer.js';
import { cipherEngine } from '../engines/cipher-engine.js';
import { generateTotpSecret, otpauthUri } from '../engines/totp.js';
import { requestError } from '../engines/request-error.js';
import { ok, pagination, pageOf } from './response-helpers.js';

export const normalizePhone = value => String(value ?? '').replace(/[\s().-]/g, '');
export const isPhoneNumber = value => /^\+[1-9]\d{7,14}$/.test(value);

export class AccountTrustConductor {
  constructor(config) {
    this.config = config;
  }

  security = async (request, reply) => ok(reply, {
    ...await accountRepository.security(request.authenticatedUser.userId),
    availableMethods: twoFactorDelivery.methods(),
  });

  reauthenticationCode = async (request, reply) => {
    if (!accountMailer.available()) {
      throw requestError(503, 'MAIL_NOT_CONFIGURED', 'Email delivery is unavailable on this server, so a confirmation code cannot be sent.');
    }
    const { code, email, expiresAt } = await accountRepository.issueReauthenticationCode(request.authenticatedUser.userId);
    if (!await accountMailer.sendCode(email, 'reauthenticate', code)) {
      throw requestError(502, 'CODE_DELIVERY_FAILED', 'The confirmation email could not be sent. Try again later.');
    }
    return ok(reply, { sent: true, destinationHint: maskEmail(email), expiresAt });
  };

  setupTwoFactor = async (request, reply) => {
    const userId = request.authenticatedUser.userId;
    const { method } = request.body;
    if (!twoFactorDelivery.methods().includes(method)) {
      throw requestError(503, 'TWO_FACTOR_METHOD_UNAVAILABLE', 'This two-step method is not available on this server.');
    }
    const phone = method === 'sms' ? normalizePhone(request.body.phoneNumber) : null;
    if (method === 'sms' && !isPhoneNumber(phone)) {
      throw requestError(400, 'INVALID_PHONE_NUMBER', 'Enter a mobile number in international format, starting with + and the country code.');
    }
    if ((await twoFactorRepository.status(userId)).enabled) {
      throw requestError(409, 'TWO_FACTOR_ENABLED', 'Two-step verification is already on. Turn it off before choosing another method.');
    }
    const { email } = await accountRepository.reauthenticate(userId, request.body);
    if (method === 'totp') {
      const secret = generateTotpSecret();
      const { expiresAt } = await realmConnector.transaction(executor => twoFactorRepository.beginEnrollment(executor, userId, { method, totpSecret: secret }));
      return ok(reply, { method, secret, otpauthUri: otpauthUri({ secret, account: email }), expiresAt });
    }
    const code = cipherEngine.generateNumericCode(6);
    const { expiresAt } = await realmConnector.transaction(executor => twoFactorRepository.beginEnrollment(executor, userId, { method, phone, code }));
    if (!await twoFactorDelivery.deliver(method, method === 'sms' ? phone : email, 'enroll', code)) {
      throw requestError(502, 'CODE_DELIVERY_FAILED', 'The code could not be sent. Check the details and try again.');
    }
    return ok(reply, { method, destinationHint: method === 'sms' ? maskPhone(phone) : maskEmail(email), expiresAt });
  };

  enableTwoFactor = async (request, reply) => ok(reply,
    await twoFactorRepository.completeEnrollment(request.authenticatedUser.userId, request.body.code));

  sendTwoFactorCode = async (request, reply) => {
    const { code, method, phone } = await twoFactorRepository.issueStepUpCode(request.authenticatedUser.userId);
    const destination = method === 'sms' ? phone : request.authenticatedUser.email;
    if (!await twoFactorDelivery.deliver(method, destination, 'step_up', code)) {
      throw requestError(502, 'CODE_DELIVERY_FAILED', 'The code could not be sent. Use a recovery code or try again later.');
    }
    return ok(reply, { sent: true, destinationHint: method === 'sms' ? maskPhone(phone) : maskEmail(destination) });
  };

  disableTwoFactor = async (request, reply) => {
    const userId = request.authenticatedUser.userId;
    if (!(await twoFactorRepository.status(userId)).enabled) throw requestError(400, 'TWO_FACTOR_DISABLED', 'Two-step verification is already off.');
    await accountRepository.reauthenticate(userId, request.body);
    await realmConnector.transaction(executor => twoFactorRepository.disable(executor, userId));
    return ok(reply, { enabled: false });
  };

  regenerateRecoveryCodes = async (request, reply) => {
    const userId = request.authenticatedUser.userId;
    if (!(await twoFactorRepository.status(userId)).enabled) throw requestError(400, 'TWO_FACTOR_DISABLED', 'Turn on two-step verification first.');
    await accountRepository.reauthenticate(userId, request.body);
    const recoveryCodes = await realmConnector.transaction(async executor => {
      const codes = await twoFactorRepository.replaceRecoveryCodes(executor, userId);
      await twoFactorRepository.securityAlert(executor, userId, 'recovery_codes_regenerated', 'New recovery codes were created');
      return codes;
    });
    return ok(reply, { recoveryCodes });
  };

  revokeSessions = async (request, reply) => {
    await accountRepository.revokeSessions(request.authenticatedUser.userId);
    return ok(reply, { revoked: true });
  };

  exportData = async (request, reply) => ok(reply, await accountRepository.exportData(request.authenticatedUser.userId));

  deleteAccount = async (request, reply) => {
    const userId = request.authenticatedUser.userId;
    if (request.body.confirm !== true) throw requestError(400, 'DELETION_CONFIRMATION_REQUIRED', 'Confirm that you understand deletion is permanent.');
    await accountRepository.reauthenticate(userId, request.body);
    const { email } = await accountRepository.deleteAccount(userId);
    request.log.info({ userId }, 'Account deleted at the owner\'s request');
    return ok(reply, { deleted: true, confirmationEmailSent: await accountMailer.sendDeletionConfirmation(email) });
  };

  privacy = async (request, reply) => ok(reply, await accountRepository.privacy(request.authenticatedUser.userId));

  updatePrivacy = async (request, reply) => ok(reply,
    await accountRepository.updatePrivacy(request.authenticatedUser.userId, request.body));

  matchContacts = async (request, reply) => ok(reply, {
    musicians: await accountRepository.matchContacts(request.authenticatedUser.userId, request.body.hashes),
  });

  verifyLogin = async (request, reply) => {
    const { session } = await twoFactorRepository.completeChallenge(request.body.challengeToken, request.body.code, async (identity, executor) => {
      await identityRepository.updateLastLogin(identity.id, executor);
      return authenticationConductor.issueSession(identity, executor);
    });
    return ok(reply, { ...session, isNewUser: false });
  };

  resendLogin = async (request, reply) => {
    const result = await twoFactorRepository.resendChallengeCode(request.body.challengeToken);
    const destination = result.method === 'sms' ? result.phone : result.email;
    return ok(reply, {
      codeSent: await twoFactorDelivery.deliver(result.method, destination, 'login', result.code),
      destinationHint: result.method === 'sms' ? maskPhone(destination) : maskEmail(destination),
      expiresAt: result.expiresAt,
    });
  };

  verification = async (request, reply) => ok(reply, await verificationRepository.mine(request.authenticatedUser.userId));

  requestVerification = async (request, reply) => ok(reply,
    await verificationRepository.submit(request.authenticatedUser.userId, request.body), 201);

  cancelVerification = async (request, reply) => ok(reply,
    await verificationRepository.cancel(request.authenticatedUser.userId, request.params.requestId));

  verificationQueue = async (request, reply) => {
    const page = pagination(request);
    const rows = await verificationRepository.queue(request.authenticatedUser.userId, page, request.query.status ?? 'pending');
    return ok(reply, pageOf(rows, 'requests', page));
  };

  verificationMedia = async (request, reply) => {
    const content = await verificationRepository.media(request.authenticatedUser.userId, request.params.requestId, request.params.mediaId);
    return reply.type('image/webp').header('Cache-Control', 'private, no-store').send(content);
  };

  decideVerification = async (request, reply) => ok(reply, await verificationRepository.decide(
    request.authenticatedUser.userId, request.params.requestId, request.body, this.config.accountTrust.verificationRetentionDays,
  ));

  revokeVerification = async (request, reply) => ok(reply,
    await verificationRepository.revoke(request.authenticatedUser.userId, request.params.userId));
}
