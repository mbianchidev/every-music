import test from 'node:test';
import assert from 'node:assert/strict';
import { createRealmConfig } from '../config/realm.js';
import { compareVersions, parseVersion, ratableVersion, updateKind } from '../src/engines/app-version.js';
import { normalizeSupportRequest } from '../src/repositories/support-repository.js';
import { forwardSupportRequest, supportMessage } from '../src/engines/support-mailer.js';

const environment = {
  REALM_ENV: 'test',
  REALM_CONNECTION: 'postgresql://localhost/everymusic',
  CIPHER_PRIMARY_KEY: 'primary-key-that-is-longer-than-thirty-two-characters',
  CIPHER_REFRESH_KEY: 'refresh-key-that-is-longer-than-thirty-two-characters',
};

test('app versions compare numerically and announce only major or minor increases', () => {
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('2.0.0-beta.1', '2.0.0'), 0);
  assert.equal(parseVersion('1.2'), null);
  assert.equal(parseVersion('v1.2.3'), null);
  const at = value => parseVersion(value);
  assert.equal(updateKind(null, at('1.0.0')), null);
  assert.equal(updateKind(at('1.0.0'), at('1.0.7')), null);
  assert.equal(updateKind(at('1.0.0'), at('1.1.0')), 'app_update_minor');
  assert.equal(updateKind(at('1.4.2'), at('2.0.0')), 'app_update_major');
  assert.equal(updateKind(at('2.0.0'), at('1.9.0')), null, 'downgrades never announce');
});

test('ratings accept released core versions between the minimum and the newest known version', () => {
  const bounds = { minimum: '1.2.0', latest: '1.4.0', server: '1.5.0' };
  assert.equal(ratableVersion('1.5.0', bounds), '1.5.0');
  assert.equal(ratableVersion('1.5.1', bounds), null);
  assert.equal(ratableVersion('1.1.9', bounds), null);
  assert.equal(ratableVersion('1.3.0-rc.1', bounds), null);
  assert.equal(ratableVersion('9.9.9', {}), '9.9.9');
});

test('help configuration validates operator, terms, support, and client version settings', () => {
  const defaults = createRealmConfig(environment);
  assert.deepEqual(defaults.legal, {
    operatorName: null, operatorContactEmail: null, operatorJurisdiction: null, effectiveDate: null, termsVersion: '1',
  });
  assert.deepEqual(defaults.clientVersions, { minimum: null, latest: null, updateUrl: null });
  assert.equal(defaults.support.email, null);
  const configured = createRealmConfig({
    ...environment, OPERATOR_NAME: 'Synthetic Operator', OPERATOR_CONTACT_EMAIL: 'privacy@example.test',
    OPERATOR_JURISDICTION: 'Netherlands', LEGAL_EFFECTIVE_DATE: '2026-11-01', TERMS_VERSION: '2026-11',
    SUPPORT_EMAIL: 'support@example.test', CLIENT_MIN_VERSION: '1.0.0', CLIENT_LATEST_VERSION: '1.2.0',
    CLIENT_UPDATE_URL: 'https://example.test/download',
  });
  assert.equal(configured.legal.termsVersion, '2026-11');
  assert.equal(configured.clientVersions.latest, '1.2.0');
  for (const [name, value, message] of [
    ['CLIENT_MIN_VERSION', '1.0', /MAJOR.MINOR.PATCH/],
    ['LEGAL_EFFECTIVE_DATE', '01/11/2026', /YYYY-MM-DD/],
    ['TERMS_VERSION', 'two words', /TERMS_VERSION/],
    ['SUPPORT_EMAIL', 'not-an-email', /SUPPORT_EMAIL/],
    ['CLIENT_UPDATE_URL', 'javascript:alert(1)', /http/],
  ]) {
    assert.throws(() => createRealmConfig({ ...environment, [name]: value }), message, name);
  }
  assert.throws(() => createRealmConfig({ ...environment, CLIENT_MIN_VERSION: '2.0.0', CLIENT_LATEST_VERSION: '1.9.0' }), /cannot be newer/);
});

test('support requests require a reply address when signed out and diagnostics only with consent', () => {
  const base = { kind: 'bug', subject: 'Synthetic crash', message: 'The synthetic feed crashed after a reload.' };
  assert.throws(() => normalizeSupportRequest(base, { signedIn: false }), { code: 'CONTACT_EMAIL_REQUIRED' });
  assert.equal(normalizeSupportRequest(base, { signedIn: true }).contactEmail, null);
  assert.equal(normalizeSupportRequest({ ...base, email: ' Person@Example.TEST ' }, { signedIn: false }).contactEmail, 'person@example.test');
  const diagnostics = { appVersion: '1.0.0', platform: 'web', userAgent: 'Synthetic', locale: ' ' };
  assert.throws(() => normalizeSupportRequest({ ...base, diagnostics }, { signedIn: true }), { code: 'DIAGNOSTICS_CONSENT_REQUIRED' });
  assert.deepEqual(normalizeSupportRequest({ ...base, diagnostics, diagnosticsConsent: true }, { signedIn: true }).diagnostics,
    { appVersion: '1.0.0', platform: 'web', userAgent: 'Synthetic' });
  assert.throws(() => normalizeSupportRequest({ ...base, kind: 'contact', steps: 'Open the feed' }, { signedIn: true }), { code: 'INVALID_SUPPORT_REQUEST' });
  assert.throws(() => normalizeSupportRequest({ ...base, kind: 'work', link: 'ftp://example.test' }, { signedIn: true }), { code: 'INVALID_LINK' });
  assert.throws(() => normalizeSupportRequest({ ...base, message: '   short   ' }, { signedIn: true }), { code: 'INVALID_SUPPORT_REQUEST' });
});

test('support forwarding is optional and keeps the subject on one line', async () => {
  const request = normalizeSupportRequest({
    kind: 'contact', subject: 'Hello\r\nBcc: someone@example.test', message: 'A synthetic contact message.', email: 'person@example.test',
  }, { signedIn: false });
  assert.equal(supportMessage({ id: 'synthetic', userId: null, request }).subject, '[Every.music] Contact request: Hello Bcc: someone@example.test');
  const sent = [];
  const warnings = [];
  const logger = { warn: (...args) => warnings.push(args) };
  const config = { support: { email: 'support@example.test' }, mailTransporter: { senderAlias: 'Every.music <noreply@example.test>' } };
  assert.equal(await forwardSupportRequest({ config: { ...config, support: { email: null } }, logger, id: 'a', request, dispatcher: {} }), false);
  assert.equal(await forwardSupportRequest({ config, logger, id: 'a', request, dispatcher: { transporter: null } }), false);
  assert.equal(warnings.length, 1);
  assert.equal(await forwardSupportRequest({
    config, logger, id: 'a', request, dispatcher: { transporter: { sendMail: async message => sent.push(message) } },
  }), true);
  assert.equal(sent[0].to, 'support@example.test');
  assert.equal(sent[0].replyTo, 'person@example.test');
  assert.match(sent[0].text, /A synthetic contact message\./);
});
