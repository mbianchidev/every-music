import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmConfig, validateRealmConfig } from '../config/realm.js';
import { base32Decode, base32Encode, hotp, otpauthUri, totpCode, totpStep, verifyTotp } from '../src/engines/totp.js';
import { SecretBox } from '../src/engines/secret-box.js';
import { TwilioSmsProvider, createSmsGateway } from '../src/engines/sms-gateway.js';
import { generateRecoveryCodes, isRecoveryCode, normalizeCode, maskEmail, maskPhone } from '../src/repositories/two-factor-repository.js';
import { contactHash } from '../src/repositories/account-repository.js';
import { normalizePhone, isPhoneNumber } from '../src/conductors/account-trust-conductor.js';

const environment = {
  REALM_ENV: 'test',
  REALM_CONNECTION: 'postgresql://localhost/everymusic',
  CIPHER_PRIMARY_KEY: 'primary-key-that-is-longer-than-thirty-two-characters',
  CIPHER_REFRESH_KEY: 'refresh-key-that-is-longer-than-thirty-two-characters',
};

test('HOTP and TOTP match the RFC 4226 and RFC 6238 SHA-1 test vectors', () => {
  const key = Buffer.from('12345678901234567890');
  assert.deepEqual([0, 1, 9].map(counter => hotp(key, counter)), ['755224', '287082', '520489']);
  const secret = base32Encode(key);
  assert.equal(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(base32Decode(secret.toLowerCase()), key);
  for (const [seconds, expected] of [[59, '94287082'], [1111111109, '07081804'], [1234567890, '89005924'], [20000000000, '65353130']]) {
    assert.equal(totpCode(secret, { now: seconds * 1000, digits: 8 }), expected);
  }
});

test('TOTP verification accepts one adjacent step and rejects replays and malformed codes', () => {
  const secret = base32Encode(Buffer.from('synthetic-totp-secret-20'));
  const now = 1_800_000_000_000;
  const step = totpStep(now);
  assert.equal(verifyTotp(secret, totpCode(secret, { step }), { now }), step);
  assert.equal(verifyTotp(secret, totpCode(secret, { step: step - 1 }), { now }), step - 1);
  assert.equal(verifyTotp(secret, totpCode(secret, { step: step + 1 }), { now }), step + 1);
  assert.equal(verifyTotp(secret, totpCode(secret, { step: step + 2 }), { now }), null);
  assert.equal(verifyTotp(secret, totpCode(secret, { step }), { now, lastStep: step }), null, 'a used step cannot be replayed');
  assert.equal(verifyTotp(secret, totpCode(secret, { step: step + 1 }), { now, lastStep: step }), step + 1);
  assert.equal(verifyTotp(secret, '12345', { now }), null);
  assert.equal(verifyTotp(secret, 'abcdef', { now }), null);
  const uri = new URL(otpauthUri({ secret, account: 'demo@example.test' }));
  assert.equal(uri.protocol, 'otpauth:');
  assert.equal(uri.host, 'totp');
  assert.equal(decodeURIComponent(uri.pathname), '/Every.music:demo@example.test');
  assert.equal(uri.searchParams.get('secret'), secret);
  assert.equal(uri.searchParams.get('issuer'), 'Every.music');
  assert.equal(uri.searchParams.get('period'), '30');
});

test('the secret box round-trips, binds digests to scope, and reports a changed key clearly', () => {
  const derived = new SecretBox(createRealmConfig(environment));
  const sealed = derived.seal('JBSWY3DPEHPK3PXP');
  assert.notEqual(sealed, derived.seal('JBSWY3DPEHPK3PXP'), 'a fresh IV is used for every value');
  assert.equal(derived.open(sealed), 'JBSWY3DPEHPK3PXP');
  assert.ok(derived.matches(derived.digest('login:a', '123456'), 'login:a', '123456'));
  assert.equal(derived.matches(derived.digest('login:a', '123456'), 'login:b', '123456'), false);
  assert.equal(derived.matches('not-a-digest', 'login:a', '123456'), false);
  const tampered = sealed.split('.');
  tampered[4] = Buffer.from('tampered').toString('base64url');
  assert.throws(() => derived.open(tampered.join('.')), { code: 'TWO_FACTOR_KEY_CHANGED' });

  const dedicated = new SecretBox(createRealmConfig({ ...environment, TWO_FACTOR_ENCRYPTION_KEY: 'dedicated-two-factor-key-with-32-characters' }));
  assert.throws(() => dedicated.open(sealed), { code: 'TWO_FACTOR_KEY_CHANGED', statusCode: 409 });
  assert.equal(dedicated.open(dedicated.seal('+15550100000')), '+15550100000');
});

test('the Twilio adapter sends a form-encoded message and surfaces provider failures', async () => {
  const calls = [];
  const provider = new TwilioSmsProvider(
    { accountSid: 'ACsynthetic', authToken: 'synthetic-token', fromNumber: '+15550100000' },
    { fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: calls.length === 1, status: calls.length === 1 ? 201 : 400 }; } },
  );
  await provider.send('+15550100001', 'Every.music: 123456');
  assert.equal(calls[0].url, 'https://api.twilio.com/2010-04-01/Accounts/ACsynthetic/Messages.json');
  assert.equal(calls[0].options.headers.Authorization, `Basic ${Buffer.from('ACsynthetic:synthetic-token').toString('base64')}`);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(calls[0].options.body)), { To: '+15550100001', Body: 'Every.music: 123456', From: '+15550100000' });
  await assert.rejects(provider.send('+15550100001', 'retry'), { statusCode: 400 });

  const service = new TwilioSmsProvider({ accountSid: 'AC1', authToken: 't', messagingServiceSid: 'MGsynthetic' }, {
    fetchImpl: async (url, options) => { calls.push({ options }); return { ok: true, status: 201 }; },
  });
  await service.send('+15550100001', 'x');
  assert.equal(new URLSearchParams(calls.at(-1).options.body).get('MessagingServiceSid'), 'MGsynthetic');
  assert.equal(createSmsGateway(createRealmConfig(environment).accountTrust.sms), null);
});

test('account-trust configuration validates SMS and dedicated key settings', () => {
  const config = createRealmConfig(environment);
  assert.equal(config.accountTrust.verificationRetentionDays, 7);
  assert.equal(validateRealmConfig(config), true);
  assert.throws(() => validateRealmConfig(createRealmConfig({ ...environment, TWILIO_ACCOUNT_SID: 'ACsynthetic' })), /SMS requires/);
  assert.throws(() => validateRealmConfig(createRealmConfig({
    ...environment, TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '0612345678',
  })), /E\.164/);
  assert.equal(validateRealmConfig(createRealmConfig({
    ...environment, TWILIO_ACCOUNT_SID: 'AC', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+15550100000',
  })), true);
  assert.throws(() => validateRealmConfig(createRealmConfig({ ...environment, TWO_FACTOR_ENCRYPTION_KEY: 'short' })), /at least 32/);
  assert.throws(() => createRealmConfig({ ...environment, VERIFICATION_MEDIA_RETENTION_DAYS: '0' }), /VERIFICATION_MEDIA_RETENTION_DAYS/);
});

test('recovery codes, contact hashes, and phone numbers are normalized consistently', () => {
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.ok(codes.every(isRecoveryCode));
  assert.equal(normalizeCode(' abcde-fghjk '), 'ABCDEFGHJK');
  assert.equal(isRecoveryCode('ABCDE0GHJK'), false, 'ambiguous characters are not part of the alphabet');
  assert.equal(contactHash('  Demo.Person@Example.TEST '), contactHash('demo.person@example.test'));
  assert.match(contactHash('demo@example.test'), /^[0-9a-f]{64}$/);
  assert.equal(normalizePhone('+1 (555) 010-0000'), '+15550100000');
  assert.ok(isPhoneNumber('+15550100000'));
  assert.equal(isPhoneNumber('0612345678'), false);
  assert.equal(maskEmail('demo@example.test'), 'd***@example.test');
  assert.equal(maskPhone('+15550100042'), '***42');
});
