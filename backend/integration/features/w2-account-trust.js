import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { buildNexus } from '../../src/app.js';
import { realmConfig } from '../../config/realm.js';
import { realmConnector } from '../../src/repositories/realm-connector.js';
import { cipherEngine } from '../../src/engines/cipher-engine.js';
import { accountMailer } from '../../src/engines/account-mailer.js';
import { googleIdentityBridge } from '../../src/engines/google-identity-bridge.js';
import { totpCode, totpStep } from '../../src/engines/totp.js';
import { maintainAccountTrust } from '../../src/engines/account-maintenance.js';
import { PushDispatcher } from '../../src/engines/push-dispatcher.js';

if (realmConfig.environment !== 'test' || !realmConfig.realm.connectionString) {
  throw new Error('Integration tests require REALM_ENV=test and an isolated REALM_CONNECTION');
}

const password = 'Synthetic1Password';
const hash = value => createHash('sha256').update(value).digest('hex');
const codeFrom = message => /\b(\d{6})\b/.exec(message.text)[1];

test('account trust: two-step sign-in, re-authentication, export, deletion, discovery, and verification', async (t) => {
  const marker = `trust-${randomUUID()}`;
  const users = [];
  const emails = [];
  const tokens = [];
  const mail = [];
  const sms = [];
  let smsFails = false;
  let address = 0;
  const nextIp = () => `10.42.${Math.floor(address / 250)}.${(address++ % 250) + 1}`;
  await realmConnector.establish();
  const app = await buildNexus({
    config: {
      ...realmConfig,
      accountTrust: { ...realmConfig.accountTrust, sms: { twilio: { accountSid: 'ACsynthetic', authToken: 'synthetic-token', fromNumber: '+15550100000', messagingServiceSid: '' } } },
      boundaries: { ...realmConfig.boundaries, rateThreshold: 10000 },
    },
    logger: false, backgroundJobs: false,
  });
  const originalFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).startsWith('https://api.twilio.com/')) return originalFetch(url, options);
    if (smsFails) return { ok: false, status: 400 };
    sms.push(Object.fromEntries(new URLSearchParams(options.body)));
    return { ok: true, status: 201 };
  });
  t.mock.method(accountMailer, 'available', () => true);
  t.mock.method(accountMailer, 'send', async (to, subject, text) => { mail.push({ to, subject, text }); return true; });
  t.after(async () => {
    await app.close();
    await realmConnector.execute('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await realmConnector.disconnect();
  });

  const passwordHash = await bcrypt.hash(password, 4);
  for (const [index, kind] of ['member', 'member', 'admin', 'google', 'member', 'member'].entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await realmConnector.execute(`
      INSERT INTO users (email, password_hash, auth_provider, google_id, email_verified, role)
      VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING id`, [
      email, kind === 'google' ? null : passwordHash, kind === 'google' ? 'google' : 'email',
      kind === 'google' ? `google-${marker}` : null, kind === 'admin' ? 'admin' : 'member',
    ]);
    users.push(rows[0].id);
    emails.push(email);
    tokens.push(cipherEngine.createAccessToken(rows[0].id, email));
    await realmConnector.execute('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `${marker} artist ${index}`, 'Synthetic City']);
  }

  async function call(path, { actor = 0, token, method = 'GET', body, status = 200, ip = nextIp() } = {}) {
    const authorization = token === null ? undefined : `Bearer ${token ?? tokens[actor]}`;
    const response = await app.inject({
      method, url: `/realm${path}`, remoteAddress: ip, payload: body,
      headers: authorization ? { authorization } : {},
    });
    assert.equal(response.statusCode, status, `${method} ${path}: ${response.body}`);
    return response.headers['content-type']?.startsWith('application/json') ? response.json() : response;
  }
  const data = async (path, options) => (await call(path, options)).data;
  const login = (index, status = 200) => data('/auth/login', { token: null, method: 'POST', body: { email: emails[index], password }, status, ip: nextIp() });
  const verify = (challengeToken, code, status = 200) => call('/auth/two-factor/verify', {
    token: null, method: 'POST', body: { challengeToken, code }, status, ip: nextIp(),
  });
  const refreshCount = async index => (await realmConnector.execute('SELECT COUNT(*)::int AS count FROM refresh_tokens WHERE user_id = $1', [users[index]])).rows[0].count;
  const image = (await sharp({ create: { width: 40, height: 30, channels: 3, background: '#4060a0' } }).png().toBuffer()).toString('base64');
  const upload = actor => data('/media', { actor, method: 'POST', status: 201, body: { purpose: 'verification', mimeType: 'image/png', data: image } });

  let totpSecret;
  let recoveryCodes;
  await t.test('authenticator enrollment needs the password and makes sign-in two-step', async () => {
    const before = await data('/account/security');
    assert.equal(before.twoFactor.enabled, false);
    assert.deepEqual(before.availableMethods, ['totp', 'email', 'sms']);
    assert.equal((await call('/account/two-factor/setup', { method: 'POST', body: { method: 'totp' }, status: 400 })).error.code, 'PASSWORD_REQUIRED');
    assert.equal((await call('/account/two-factor/setup', { method: 'POST', body: { method: 'totp', password: 'Wrong1Password' }, status: 403 })).error.code, 'REAUTHENTICATION_FAILED');
    const setup = await data('/account/two-factor/setup', { method: 'POST', body: { method: 'totp', password } });
    totpSecret = setup.secret;
    assert.match(setup.otpauthUri, /^otpauth:\/\/totp\/Every\.music:/);
    const stored = (await realmConnector.execute('SELECT totp_secret, enabled_at FROM user_two_factor WHERE user_id = $1', [users[0]])).rows[0];
    assert.equal(stored.enabled_at, null);
    assert.match(stored.totp_secret, /^v1\./);
    assert.ok(!stored.totp_secret.includes(totpSecret), 'the TOTP secret is encrypted at rest');
    assert.equal((await call('/account/two-factor/enable', { method: 'POST', body: { code: '000000' }, status: 400 })).error.code, 'INVALID_TWO_FACTOR_CODE');
    const enrollmentCode = totpCode(totpSecret);
    const enabled = await data('/account/two-factor/enable', { method: 'POST', body: { code: enrollmentCode } });
    recoveryCodes = enabled.recoveryCodes;
    assert.equal(recoveryCodes.length, 10);
    assert.match(recoveryCodes[0], /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    const hashes = (await realmConnector.execute('SELECT code_hash FROM two_factor_recovery_codes WHERE user_id = $1', [users[0]])).rows;
    assert.ok(hashes.every(row => !recoveryCodes.some(code => row.code_hash.includes(code.replace('-', '')))));
    assert.equal((await data('/account/security')).twoFactor.recoveryCodesRemaining, 10);

    const sessions = await refreshCount(0);
    const challenge = await login(0);
    assert.equal(challenge.twoFactorRequired, true);
    assert.equal(challenge.method, 'totp');
    assert.equal(challenge.accessToken, undefined);
    assert.equal(challenge.refreshToken, undefined);
    assert.equal(await refreshCount(0), sessions, 'no session exists before the second factor');
    assert.equal((await verify(challenge.challengeToken, enrollmentCode, 401)).error.code, 'INVALID_TWO_FACTOR_CODE', 'a used TOTP step cannot be replayed');
    const signedIn = (await verify(challenge.challengeToken, recoveryCodes[0].toLowerCase())).data;
    assert.ok(signedIn.accessToken && signedIn.refreshToken);
    assert.equal(signedIn.user.userId, users[0]);
    assert.equal(signedIn.isNewUser, false);
    assert.equal((await verify(challenge.challengeToken, recoveryCodes[1], 401)).error.code, 'INVALID_TWO_FACTOR_CHALLENGE', 'challenges are single-use');
    const again = await login(0);
    assert.equal((await verify(again.challengeToken, recoveryCodes[0], 401)).error.code, 'INVALID_TWO_FACTOR_CODE', 'recovery codes are single-use');
    assert.ok((await verify(again.challengeToken, totpCode(totpSecret, { step: totpStep() + 1 }))).data.accessToken);
    const alerts = await data('/notifications');
    assert.ok(alerts.notifications.some(item => item.kind === 'security_alert' && item.params.event === 'recovery_code_used'));
  });

  await t.test('challenges enforce attempt limits, expiry, and an account lockout', async () => {
    const challenge = await login(0);
    for (let attempt = 1; attempt < 5; attempt += 1) {
      assert.match((await verify(challenge.challengeToken, '000000', 401)).error.message, new RegExp(`${5 - attempt} attempts left`));
    }
    assert.equal((await verify(challenge.challengeToken, '000000', 401)).error.code, 'INVALID_TWO_FACTOR_CHALLENGE');
    assert.equal((await verify(challenge.challengeToken, recoveryCodes[2], 401)).error.code, 'INVALID_TWO_FACTOR_CHALLENGE');
    const expired = await login(0);
    await realmConnector.execute("UPDATE two_factor_challenges SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1", [users[0]]);
    assert.equal((await verify(expired.challengeToken, recoveryCodes[2], 401)).error.code, 'INVALID_TWO_FACTOR_CHALLENGE');
    await realmConnector.execute("INSERT INTO account_rate_events (user_id, action) SELECT $1, 'two_factor_failure' FROM generate_series(1, 10)", [users[0]]);
    assert.equal((await call('/auth/login', { token: null, method: 'POST', body: { email: emails[0], password }, status: 429, ip: nextIp() })).error.code, 'TWO_FACTOR_LOCKED');
    await realmConnector.execute("DELETE FROM account_rate_events WHERE user_id = $1 AND action = 'two_factor_failure'", [users[0]]);
  });

  await t.test('regenerating recovery codes and disabling two-step require password and a second factor', async () => {
    assert.equal((await call('/account/two-factor/recovery-codes', { method: 'POST', body: { password }, status: 400 })).error.code, 'TWO_FACTOR_CODE_REQUIRED');
    assert.equal((await call('/account/two-factor/recovery-codes', { method: 'POST', body: { password, code: '000000' }, status: 403 })).error.code, 'INVALID_TWO_FACTOR_CODE');
    const fresh = (await data('/account/two-factor/recovery-codes', { method: 'POST', body: { password, code: recoveryCodes[2] } })).recoveryCodes;
    assert.equal(fresh.length, 10);
    assert.equal((await call('/account/two-factor/disable', { method: 'POST', body: { password, code: recoveryCodes[3] }, status: 403 })).error.code, 'INVALID_TWO_FACTOR_CODE', 'old codes are replaced');
    assert.equal((await call('/account/two-factor/disable', { method: 'POST', body: { password: 'Wrong1Password', code: fresh[0] }, status: 403 })).error.code, 'REAUTHENTICATION_FAILED');
    assert.equal((await data('/account/two-factor/disable', { method: 'POST', body: { password, code: fresh[0] } })).enabled, false);
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM two_factor_recovery_codes WHERE user_id = $1', [users[0]])).rows[0].count, 0);
    assert.ok((await login(0)).accessToken, 'sign-in is single-step again');
    await realmConnector.execute("DELETE FROM account_rate_events WHERE user_id = $1", [users[0]]);
  });

  await t.test('email codes enroll, sign in, resend, and confirm changes', async () => {
    await data('/account/two-factor/setup', { actor: 1, method: 'POST', body: { method: 'email', password } });
    const enroll = mail.at(-1);
    assert.equal(enroll.to, emails[1]);
    await data('/account/two-factor/enable', { actor: 1, method: 'POST', body: { code: codeFrom(enroll) } });
    const challenge = await login(1);
    assert.equal(challenge.method, 'email');
    assert.equal(challenge.codeSent, true);
    assert.equal(challenge.destinationHint, `${emails[1][0]}***@example.test`);
    const first = codeFrom(mail.at(-1));
    const resent = await data('/auth/two-factor/resend', { token: null, method: 'POST', body: { challengeToken: challenge.challengeToken }, ip: nextIp() });
    assert.equal(resent.codeSent, true);
    const second = codeFrom(mail.at(-1));
    if (first !== second) assert.equal((await verify(challenge.challengeToken, first, 401)).error.code, 'INVALID_TWO_FACTOR_CODE');
    const session = (await verify(challenge.challengeToken, second)).data;
    tokens[1] = session.accessToken;
    t.diagnostic('email two-step sign-in issued a session');
    await data('/account/two-factor/code', { actor: 1, method: 'POST', body: {} });
    const stepUp = codeFrom(mail.at(-1));
    await data('/account/two-factor/disable', { actor: 1, method: 'POST', body: { password, code: stepUp } });
    const refreshed = await login(1);
    assert.ok(refreshed.refreshToken);
    tokens[1] = refreshed.accessToken;

    await call('/account', { actor: 1 });
    await data('/account/sessions/revoke', { actor: 1, method: 'POST', body: {} });
    assert.equal((await call('/account', { actor: 1, status: 401 })).error.code, 'INVALID_TOKEN', 'access tokens issued before revocation stop working');
    assert.equal((await call('/auth/refresh-token', { token: null, method: 'POST', body: { refreshToken: refreshed.refreshToken }, status: 401, ip: nextIp() })).error.code, 'INVALID_REFRESH_TOKEN');
    await new Promise(resolve => setTimeout(resolve, 1100));
    tokens[1] = (await login(1)).accessToken;
    await call('/account', { actor: 1 });
  });

  await t.test('SMS codes use the provider interface and phone numbers are only kept while enrolled', async () => {
    smsFails = true;
    assert.equal((await call('/account/two-factor/setup', { actor: 4, method: 'POST', body: { method: 'sms', phoneNumber: '+1 555 010 0042', password }, status: 502 })).error.code, 'CODE_DELIVERY_FAILED');
    smsFails = false;
    assert.equal((await call('/account/two-factor/setup', { actor: 4, method: 'POST', body: { method: 'sms', phoneNumber: '0612', password }, status: 400 })).error.code, 'INVALID_PHONE_NUMBER');
    const setup = await data('/account/two-factor/setup', { actor: 4, method: 'POST', body: { method: 'sms', phoneNumber: '+1 555 010 0042', password } });
    assert.equal(setup.destinationHint, '***42');
    assert.equal(sms.at(-1).To, '+15550100042');
    assert.equal(sms.at(-1).From, '+15550100000');
    const stored = (await realmConnector.execute('SELECT phone_number FROM user_two_factor WHERE user_id = $1', [users[4]])).rows[0].phone_number;
    assert.ok(!stored.includes('5550100042'), 'phone numbers are encrypted at rest');
    await data('/account/two-factor/enable', { actor: 4, method: 'POST', body: { code: /(\d{6})/.exec(sms.at(-1).Body)[1] } });
    assert.equal((await data('/account/security', { actor: 4 })).twoFactor.phoneHint, '***42');
    const challenge = await login(4);
    assert.equal(challenge.method, 'sms');
    assert.equal(challenge.codeSent, true);
    await verify(challenge.challengeToken, /(\d{6})/.exec(sms.at(-1).Body)[1]);
    await data('/account/two-factor/code', { actor: 4, method: 'POST', body: {} });
    await data('/account/two-factor/disable', { actor: 4, method: 'POST', body: { password, code: /(\d{6})/.exec(sms.at(-1).Body)[1] } });
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM user_two_factor WHERE user_id = $1', [users[4]])).rows[0].count, 0);
  });

  let googleSecret;
  let googleRecovery;
  await t.test('Google sign-in also requires the second step, and accounts without a password confirm by email', async () => {
    assert.equal((await call('/account/reauthentication-code', { method: 'POST', body: {}, status: 400 })).error.code, 'PASSWORD_REAUTHENTICATION');
    assert.equal((await call('/account/two-factor/setup', { actor: 3, method: 'POST', body: { method: 'totp' }, status: 400 })).error.code, 'EMAIL_CODE_REQUIRED');
    await data('/account/reauthentication-code', { actor: 3, method: 'POST', body: {} });
    assert.equal((await call('/account/two-factor/setup', { actor: 3, method: 'POST', body: { method: 'totp', emailCode: '000000' }, status: 403 })).error.code, 'REAUTHENTICATION_FAILED');
    const emailCode = codeFrom(mail.at(-1));
    googleSecret = (await data('/account/two-factor/setup', { actor: 3, method: 'POST', body: { method: 'totp', emailCode } })).secret;
    googleRecovery = (await data('/account/two-factor/enable', { actor: 3, method: 'POST', body: { code: totpCode(googleSecret) } })).recoveryCodes;
    assert.equal((await call('/account/two-factor/setup', { actor: 3, method: 'POST', body: { method: 'totp', emailCode }, status: 409 })).error.code, 'TWO_FACTOR_ENABLED');

    const googleChallenge = await data('/auth/google/challenge', { token: null, method: 'POST', body: {}, status: 201, ip: nextIp() });
    t.mock.method(googleIdentityBridge, 'verifyCredential', async () => ({
      googleId: `google-${marker}`, email: emails[3], emailVerified: true, nonce: googleChallenge.nonce,
    }));
    const step = await data('/auth/login/google', { token: null, method: 'POST', body: { idToken: 'synthetic', challengeId: googleChallenge.id }, ip: nextIp() });
    assert.equal(step.twoFactorRequired, true);
    assert.equal(step.isNewUser, false);
    assert.equal(step.accessToken, undefined);
    const session = (await verify(step.challengeToken, totpCode(googleSecret, { step: totpStep() + 1 }))).data;
    assert.equal(session.user.userId, users[3]);
  });

  await t.test('contact discovery is opt-in, hashed, and respects blocks', async () => {
    assert.equal((await data('/account/privacy', { actor: 4 })).discoverableByEmail, false);
    const lookup = [hash(emails[4]), hash(emails[1]), hash(`${marker}-unknown@example.test`)];
    assert.deepEqual((await data('/contacts/match', { method: 'POST', body: { hashes: lookup } })).musicians, []);
    assert.equal((await data('/account/privacy', { actor: 4, method: 'PUT', body: { discoverableByEmail: true } })).discoverableByEmail, true);
    const found = (await data('/contacts/match', { method: 'POST', body: { hashes: lookup.map(value => value.toUpperCase()) } })).musicians;
    assert.equal(found.length, 1);
    assert.equal(found[0].userId, users[4]);
    assert.equal(found[0].artistName, `${marker} artist 4`);
    assert.equal(JSON.stringify(found).includes('@'), false, 'no email addresses are returned');
    assert.deepEqual((await data('/contacts/match', { actor: 4, method: 'POST', body: { hashes: [hash(emails[4])] } })).musicians, [], 'self is excluded');
    await realmConnector.execute('INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2)', [users[4], users[0]]);
    assert.deepEqual((await data('/contacts/match', { method: 'POST', body: { hashes: lookup } })).musicians, []);
    await realmConnector.execute('DELETE FROM blocked_users WHERE user_id = $1', [users[4]]);
    await call('/contacts/match', { method: 'POST', body: { hashes: ['not-a-hash'] }, status: 400 });
    await call('/contacts/match', { method: 'POST', body: { hashes: Array.from({ length: 501 }, (_, i) => hash(String(i))) }, status: 400 });
    await realmConnector.execute("INSERT INTO account_rate_events (user_id, action) SELECT $1, 'contact_match' FROM generate_series(1, 20)", [users[0]]);
    assert.equal((await call('/contacts/match', { method: 'POST', body: { hashes: lookup }, status: 429 })).error.code, 'ACCOUNT_RATE_LIMIT');
    await realmConnector.execute('DELETE FROM account_rate_events WHERE user_id = $1', [users[0]]);
    const stored = (await realmConnector.execute('SELECT COUNT(*)::int AS count FROM contact_discovery WHERE email_hash = ANY($1::text[])', [lookup])).rows[0].count;
    assert.equal(stored, 1, 'only the opted-in account has a discovery hash; searched contacts are not stored');
  });

  await t.test('verification evidence stays private, is reviewed by admins, and is purged after a decision', async () => {
    const selfie = await upload(0);
    const own = await data('/verification/me');
    assert.equal(own.verifiedAt, null);
    assert.match(own.challengeCode, /^EM-[A-Z2-9]{6}$/);
    await call('/verification/requests', { method: 'POST', body: { selfieMediaId: selfie.id, challengeCode: 'EM-AAAAAA' }, status: 400 });
    const foreign = await upload(1);
    assert.equal((await call('/verification/requests', { method: 'POST', body: { selfieMediaId: foreign.id, challengeCode: own.challengeCode }, status: 400 })).error.code, 'INVALID_MEDIA');
    const request = await data('/verification/requests', { method: 'POST', body: { selfieMediaId: selfie.id, challengeCode: own.challengeCode.toLowerCase() }, status: 201 });
    assert.equal(request.status, 'pending');
    assert.equal((await call('/verification/requests', { method: 'POST', body: { documentMediaId: (await upload(0)).id, challengeCode: own.challengeCode }, status: 409 })).error.code, 'VERIFICATION_PENDING');
    assert.ok((await data('/notifications', { actor: 2 })).notifications.some(item => item.kind === 'verification_requested'));

    await call(`/media/${selfie.id}`, { token: null, status: 404 });
    await call(`/media/${selfie.id}`, { actor: 1, status: 404 });
    await call(`/media/${selfie.id}`, { status: 200 });
    await call('/admin/verification-requests', { actor: 1, status: 403 });
    const queue = await data('/admin/verification-requests', { actor: 2 });
    const queued = queue.requests.find(item => item.id === request.id);
    assert.equal(queued.challengeCode, own.challengeCode);
    assert.equal(queued.selfieMediaId, selfie.id);
    await call(`/admin/verification-requests/${request.id}/media/${selfie.id}`, { actor: 1, status: 403 });
    await call(`/admin/verification-requests/${request.id}/media/${foreign.id}`, { actor: 2, status: 404 });
    const bytes = await call(`/admin/verification-requests/${request.id}/media/${selfie.id}`, { actor: 2 });
    assert.equal(bytes.headers['content-type'], 'image/webp');
    assert.equal(bytes.headers['cache-control'], 'private, no-store');
    const audit = await realmConnector.execute("SELECT action FROM admin_audit WHERE actor_id = $1 AND target_id = $2", [users[2], users[0]]);
    assert.ok(audit.rows.some(row => row.action === 'verification_media_viewed'));

    await call(`/admin/verification-requests/${request.id}`, { actor: 2, method: 'PATCH', body: { decision: 'approve', note: 'no' }, status: 400 });
    assert.equal((await data(`/admin/verification-requests/${request.id}`, { actor: 2, method: 'PATCH', body: { decision: 'approve', note: 'Selfie shows the current code.' } })).status, 'approved');
    assert.equal((await call(`/admin/verification-requests/${request.id}`, { actor: 2, method: 'PATCH', body: { decision: 'reject', note: 'Second decision.' }, status: 409 })).error.code, 'VERIFICATION_RESOLVED');
    const profile = await data(`/profiles/${users[0]}`, { actor: 1 });
    assert.ok(profile.verifiedAt);
    const search = await data(`/profiles/search?searchTerm=${encodeURIComponent(`${marker} artist 0`)}`, { actor: 1 });
    assert.ok(search.profiles[0].verifiedAt);
    const announcement = await data('/announcements/', { method: 'POST', status: 201, body: { title: `${marker} open call`, description: 'A synthetic open call created for verification badge checks.' } });
    assert.ok((await data(`/announcements/${announcement.id}`, { actor: 1 })).creatorVerifiedAt);
    assert.ok((await data(`/announcements/search?searchTerm=${encodeURIComponent(marker)}`, { actor: 1 })).announcements[0].creatorVerifiedAt);
    assert.ok((await data('/notifications')).notifications.some(item => item.kind === 'verification_decided' && item.params.decision === 'approved'));
    assert.equal((await data('/verification/me')).request.reviewNote, 'Selfie shows the current code.');

    const adminSelfie = await upload(2);
    const adminRequest = await data('/verification/requests', { actor: 2, method: 'POST', status: 201, body: { selfieMediaId: adminSelfie.id, challengeCode: (await data('/verification/me', { actor: 2 })).challengeCode } });
    assert.equal((await call(`/admin/verification-requests/${adminRequest.id}`, { actor: 2, method: 'PATCH', body: { decision: 'approve', note: 'Approving myself.' }, status: 403 })).error.code, 'SELF_REVIEW');
    await data(`/verification/requests/${adminRequest.id}`, { actor: 2, method: 'DELETE' });
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM media WHERE id = $1', [adminSelfie.id])).rows[0].count, 0, 'cancelled evidence is deleted immediately');

    await realmConnector.execute("UPDATE media SET created_at = NOW() - INTERVAL '3 days' WHERE id = $1", [selfie.id]);
    await new PushDispatcher({ config: {}, connector: realmConnector, logger: { error() {}, warn() {}, info() {} } }).maintain();
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM media WHERE id = $1', [selfie.id])).rows[0].count, 1, 'evidence survives the unreferenced-media cleanup during retention');
    await realmConnector.execute("UPDATE verification_requests SET media_purge_after = NOW() - INTERVAL '1 second' WHERE id = $1", [request.id]);
    await maintainAccountTrust(realmConnector);
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM media WHERE id = $1', [selfie.id])).rows[0].count, 0);
    assert.equal((await realmConnector.execute('SELECT selfie_media_id FROM verification_requests WHERE id = $1', [request.id])).rows[0].selfie_media_id, null);
    await call(`/admin/verification-requests/${request.id}/media/${selfie.id}`, { actor: 2, status: 404 });

    await data(`/admin/users/${users[0]}/verification`, { actor: 2, method: 'DELETE' });
    assert.equal((await data(`/profiles/${users[0]}`, { actor: 1 })).verifiedAt, null);
  });

  await t.test('data export contains the account owner\'s data only and is rate limited', async () => {
    const pair = [users[0], users[1]].sort();
    const conversation = (await realmConnector.execute('INSERT INTO conversations (first_user_id, second_user_id) VALUES ($1, $2) RETURNING id', pair)).rows[0].id;
    await realmConnector.execute('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [conversation, ...pair]);
    await realmConnector.execute(`INSERT INTO messages (conversation_id, sender_id, client_id, body) VALUES
      ($1, $2, uuid_generate_v4(), 'Synthetic note written by the exporter'),
      ($1, $3, uuid_generate_v4(), 'Synthetic private reply from someone else')`, [conversation, users[0], users[1]]);
    const exported = await data('/account/export');
    assert.equal(exported.account.email, emails[0]);
    assert.equal(exported.profile.artistName, `${marker} artist 0`);
    assert.equal(exported.conversations[0].receivedMessages, 1);
    assert.ok(exported.sentMessages.some(message => message.body === 'Synthetic note written by the exporter'));
    const serialized = JSON.stringify(exported);
    assert.equal(serialized.includes('Synthetic private reply from someone else'), false);
    assert.equal(serialized.includes(emails[1]), false);
    assert.equal(serialized.includes('"ciphertext"'), false);
    assert.equal(serialized.includes('password_hash') || serialized.includes(passwordHash), false);
    await data('/account/export');
    await data('/account/export');
    assert.equal((await call('/account/export', { status: 429 })).error.code, 'ACCOUNT_RATE_LIMIT');
  });

  await t.test('account deletion re-authenticates, removes personal data, and handles shared records', async () => {
    const [announcement] = (await data(`/announcements/search?searchTerm=${encodeURIComponent(marker)}`, { actor: 1 })).announcements;
    await data(`/announcements/${announcement.id}/react`, { actor: 1, method: 'POST', body: { reactionType: 'like' } });
    await data(`/announcements/${announcement.id}/comments`, { actor: 1, method: 'POST', status: 201, body: { body: 'Synthetic comment from the deleted account.' } });
    await data('/profiles/me/projects', { method: 'POST', status: 201, body: { name: `${marker} duo`, collaborators: [{ userId: users[1], role: 'Bass' }, { userId: users[4], role: 'Drums' }] } });
    await data('/reports', { actor: 1, method: 'POST', status: 201, body: { reportedUserId: users[0], category: 'other', details: 'Synthetic report from the deleted account.', consent: true } });
    await data(`/profiles/${users[1]}/follow`, { method: 'POST' });
    assert.equal((await data(`/announcements/${announcement.id}`)).stats.likes, 1);

    await call('/account', { actor: 1, method: 'DELETE', body: { password }, status: 400 });
    assert.equal((await call('/account', { actor: 1, method: 'DELETE', body: { password, confirm: false }, status: 400 })).error.code, 'DELETION_CONFIRMATION_REQUIRED');
    assert.equal((await call('/account', { actor: 1, method: 'DELETE', body: { password: 'Wrong1Password', confirm: true }, status: 403 })).error.code, 'REAUTHENTICATION_FAILED');
    const result = await data('/account', { actor: 1, method: 'DELETE', body: { password, confirm: true } });
    assert.deepEqual(result, { deleted: true, confirmationEmailSent: true });
    assert.equal(mail.at(-1).to, emails[1]);
    assert.match(mail.at(-1).subject, /deleted/);
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM users WHERE id = $1', [users[1]])).rows[0].count, 0);
    for (const [table, column] of [['profiles', 'user_id'], ['media', 'user_id'], ['refresh_tokens', 'user_id'], ['announcement_comments', 'user_id'], ['messages', 'sender_id'], ['conversation_members', 'user_id'], ['user_reports', 'reporter_id'], ['followers', 'following_id'], ['account_rate_events', 'user_id']]) {
      assert.equal((await realmConnector.execute(`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${column} = $1`, [users[1]])).rows[0].count, 0, table);
    }
    assert.equal((await call('/account', { actor: 1, status: 401 })).error.code, 'INVALID_TOKEN');
    assert.equal((await data(`/announcements/${announcement.id}`)).stats.likes, 0, 'reaction counters are recomputed');
    const project = (await data('/profiles/me')).projects.find(item => item.name === `${marker} duo`);
    assert.deepEqual(project.collaborators.map(person => person.userId), [users[4]]);
    assert.equal((await data('/conversations')).conversations.length, 0, 'conversations with the deleted account are removed');

    assert.equal((await call('/account', { actor: 3, method: 'DELETE', body: { confirm: true }, status: 400 })).error.code, 'EMAIL_CODE_REQUIRED');
    await data('/account/reauthentication-code', { actor: 3, method: 'POST', body: {} });
    const emailCode = codeFrom(mail.at(-1));
    assert.equal((await call('/account', { actor: 3, method: 'DELETE', body: { confirm: true, emailCode }, status: 400 })).error.code, 'TWO_FACTOR_CODE_REQUIRED');
    await data('/account/reauthentication-code', { actor: 3, method: 'POST', body: {} });
    await data('/account', { actor: 3, method: 'DELETE', body: { confirm: true, emailCode: codeFrom(mail.at(-1)), code: googleRecovery[0] } });
    assert.equal((await realmConnector.execute('SELECT COUNT(*)::int AS count FROM users WHERE id = $1', [users[3]])).rows[0].count, 0);
  });
});
