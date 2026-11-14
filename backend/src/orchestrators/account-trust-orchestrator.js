import { AccountTrustConductor } from '../conductors/account-trust-conductor.js';
import { twoFactorDelivery } from '../conductors/two-factor-delivery.js';
import { createSmsGateway } from '../engines/sms-gateway.js';
import { adminGuard, identityGuard } from '../guards/identity-guard.js';
import { uuid, text, object, params, paging } from '../validators/http-schemas.js';

const reauthentication = { password: text(1024), emailCode: text(16), code: text(32) };
const limit = (max, timeWindow) => ({ rateLimit: { max, timeWindow } });

export async function accountTrustOrchestrator(fastify, { config }) {
  twoFactorDelivery.configure({ sms: createSmsGateway(config.accountTrust?.sms), logger: fastify.log });
  const conductor = new AccountTrustConductor(config);
  const route = (method, url, handler, { schema = {}, guard = identityGuard, rate } = {}) => fastify.route({
    method, url, preHandler: guard, schema, handler, ...(rate ? { config: rate } : {}),
  });

  fastify.post('/auth/two-factor/verify', {
    config: limit(10, '15 minutes'),
    schema: { body: object({ challengeToken: text(128), code: text(32) }, ['challengeToken', 'code']) },
  }, conductor.verifyLogin);
  fastify.post('/auth/two-factor/resend', {
    config: limit(5, '15 minutes'),
    schema: { body: object({ challengeToken: text(128) }, ['challengeToken']) },
  }, conductor.resendLogin);

  route('GET', '/account/security', conductor.security);
  route('POST', '/account/reauthentication-code', conductor.reauthenticationCode, { schema: { body: object({}) }, rate: limit(3, '15 minutes') });
  route('POST', '/account/two-factor/setup', conductor.setupTwoFactor, {
    schema: { body: object({ method: { enum: ['totp', 'email', 'sms'] }, phoneNumber: text(32), ...reauthentication }, ['method']) },
    rate: limit(10, '15 minutes'),
  });
  route('POST', '/account/two-factor/enable', conductor.enableTwoFactor, {
    schema: { body: object({ code: text(32) }, ['code']) }, rate: limit(10, '15 minutes'),
  });
  route('POST', '/account/two-factor/code', conductor.sendTwoFactorCode, { schema: { body: object({}) }, rate: limit(5, '15 minutes') });
  route('POST', '/account/two-factor/disable', conductor.disableTwoFactor, {
    schema: { body: object(reauthentication) }, rate: limit(10, '15 minutes'),
  });
  route('POST', '/account/two-factor/recovery-codes', conductor.regenerateRecoveryCodes, {
    schema: { body: object(reauthentication) }, rate: limit(10, '15 minutes'),
  });
  route('POST', '/account/sessions/revoke', conductor.revokeSessions, { schema: { body: object({}) }, rate: limit(10, '15 minutes') });
  route('GET', '/account/export', conductor.exportData, { rate: limit(10, '1 hour') });
  route('DELETE', '/account', conductor.deleteAccount, {
    schema: { body: object({ ...reauthentication, confirm: { type: 'boolean' } }, ['confirm']) },
    rate: limit(5, '15 minutes'),
  });

  route('GET', '/account/privacy', conductor.privacy);
  route('PUT', '/account/privacy', conductor.updatePrivacy, {
    schema: { body: object({ discoverableByEmail: { type: 'boolean' } }, ['discoverableByEmail']) },
  });
  route('POST', '/contacts/match', conductor.matchContacts, {
    schema: { body: object({
      hashes: { type: 'array', minItems: 1, maxItems: 500, items: { type: 'string', pattern: '^[0-9a-fA-F]{64}$' } },
    }, ['hashes']) },
    rate: limit(30, '15 minutes'),
  });

  route('GET', '/verification/me', conductor.verification);
  route('POST', '/verification/requests', conductor.requestVerification, {
    schema: { body: object({ selfieMediaId: uuid, documentMediaId: uuid, challengeCode: text(16) }, ['challengeCode']) },
    rate: limit(10, '1 hour'),
  });
  route('DELETE', '/verification/requests/:requestId', conductor.cancelVerification, { schema: { params: params('requestId') } });

  route('GET', '/admin/verification-requests', conductor.verificationQueue, {
    guard: adminGuard,
    schema: { querystring: object({ ...paging, status: { enum: ['', 'pending', 'approved', 'rejected', 'cancelled'] } }) },
  });
  route('GET', '/admin/verification-requests/:requestId/media/:mediaId', conductor.verificationMedia, {
    guard: adminGuard, schema: { params: params('requestId', 'mediaId') },
  });
  route('PATCH', '/admin/verification-requests/:requestId', conductor.decideVerification, {
    guard: adminGuard,
    schema: { params: params('requestId'), body: object({ decision: { enum: ['approve', 'reject'] }, note: text(2000, 5) }, ['decision', 'note']) },
  });
  route('DELETE', '/admin/users/:userId/verification', conductor.revokeVerification, {
    guard: adminGuard, schema: { params: params('userId') },
  });
}
