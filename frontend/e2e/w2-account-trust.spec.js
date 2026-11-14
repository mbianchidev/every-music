import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';
import { totpCode, totpStep } from '../../backend/src/engines/totp.js';
import { apiOrigin, webOrigin } from './origins.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const bcrypt = requireBackend('bcryptjs');
const sharp = requireBackend('sharp');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `trust-${randomUUID().slice(0, 8)}`;
const password = 'Synthetic1Password';
// Matches the synthetic keys in playwright.config.js so fixtures can start
// sessions without spending the shared-IP sign-in budget used by other specs.
const cipher = new CipherEngine({ cipher: {
  primaryKey: 'synthetic-browser-primary-key-longer-than-thirty-two-characters',
  refreshKey: 'synthetic-browser-refresh-key-longer-than-thirty-two-characters',
  issuer: 'every.music', audience: 'every.music.clients', accessTokenMinutes: 30, refreshTokenDays: 30,
} });
const people = {};
let image;

async function person(key, artistName, { role = 'member', verified = false } = {}) {
  const email = `${marker}-${key}@example.test`;
  const { rows } = await pool.query(`
    INSERT INTO users (email, password_hash, google_id, email_verified, role) VALUES ($1, $2, $3, TRUE, $4) RETURNING id`,
  [email, bcrypt.hashSync(password, 4), `synthetic-${email}`, role]);
  await pool.query('INSERT INTO profiles (user_id, artist_name, city, verified_at) VALUES ($1, $2, $3, $4)', [
    rows[0].id, artistName, 'Synthetic City', verified ? new Date() : null,
  ]);
  people[key] = { id: rows[0].id, email, artistName };
}

async function session(key) {
  const { id, email } = people[key];
  const refresh = cipher.createRefreshToken(id);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [id, refresh.tokenHash, refresh.expiresAt]);
  return { persona: { userId: id, email, emailVerified: true }, keys: { accessToken: cipher.createAccessToken(id, email), refreshToken: refresh.token } };
}

async function signedIn(browser, key) {
  const context = await browser.newContext();
  await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({
    contentType: 'application/javascript',
    body: `let options; window.google = { accounts: { id: {
      initialize(value) { options = value; },
      renderButton(container) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn btn-secondary'; button.textContent = 'Continue with Google';
        button.onclick = () => options.callback({ credential: 'synthetic-google-credential' });
        container.appendChild(button);
      } } } };`,
  }));
  await context.route('**/realm/auth/google/challenge', route => route.fulfill({
    status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: randomUUID(), nonce: 'synthetic-nonce' } }),
  }));
  await context.addInitScript(({ value, origin }) => {
    if (location.origin === origin && !sessionStorage.getItem('everymusic.session.v1')) {
      sessionStorage.setItem('everymusic.session.v1', JSON.stringify(value));
    }
  }, { value: await session(key), origin: webOrigin });
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  return { context, page };
}

// Creates a genuine second-step challenge. The first step is covered by the
// API integration suite; synthesizing only its response here keeps this spec
// within the shared per-IP password and Google sign-in limits.
async function challengeFor(key) {
  const token = randomBytes(32).toString('base64url');
  const { rows } = await pool.query(`
    INSERT INTO two_factor_challenges (user_id, token_hash, method) VALUES ($1, $2, 'totp') RETURNING expires_at`,
  [people[key].id, createHash('sha256').update(token).digest('hex')]);
  return { twoFactorRequired: true, challengeToken: token, method: 'totp', destinationHint: null, codeSent: null, expiresAt: rows[0].expires_at };
}

async function assertAccessible(page, label) {
  await expect(page.locator('.spinner')).toHaveCount(0);
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({
    id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), label).toEqual([]);
}

test.beforeAll(async () => {
  await person('security', 'Demo Keyholder');
  await person('admin', 'Demo Trust Admin', { role: 'admin' });
  await person('friend', 'Demo Known Friend', { verified: true });
  await person('leaving', 'Demo Leaving Soon');
  await person('finder', 'Demo Contact Finder');
  await person('verify', 'Demo Photo Proof');
  await pool.query('INSERT INTO contact_discovery (user_id, email_hash) VALUES ($1, $2)', [
    people.friend.id, createHash('sha256').update(people.friend.email).digest('hex'),
  ]);
  image = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#5470a8' } }).png().toBuffer();
});

test.afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [Object.values(people).map(item => item.id)]);
  await pool.end();
});

test('two-step verification is enrolled with a QR code, required at password and Google sign-in, and turned off', async ({ browser }) => {
  const { context, page } = await signedIn(browser, 'security');
  try {
    await page.goto('/#settings');
    const staleAccess = (await page.evaluate(() => JSON.parse(sessionStorage.getItem('everymusic.session.v1')))).keys.accessToken;
    const security = page.getByRole('region', { name: 'Security', exact: true });
    const twoStep = security.getByRole('region', { name: 'Two-step verification', exact: true });
    await expect(twoStep.getByText('Off. Add a second step', { exact: false })).toBeVisible();
    await twoStep.getByRole('button', { name: 'Set up two-step verification', exact: true }).click();
    await expect(twoStep.getByRole('heading', { name: 'Set up two-step verification', exact: true })).toBeFocused();
    await expect(twoStep.getByRole('radio', { name: 'Authenticator app', exact: true })).toBeChecked();
    await twoStep.getByLabel(/^Current password/).fill('Wrong1Password');
    await twoStep.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(twoStep.getByRole('alert')).toHaveText('The password is not correct.');
    await twoStep.getByLabel(/^Current password/).fill(password);
    await twoStep.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(twoStep.getByRole('img', { name: 'QR code that adds Every.music to an authenticator app', exact: true })).toBeVisible();
    await assertAccessible(page, 'Authenticator QR enrollment');
    await twoStep.getByText('Cannot scan? Enter the setup key instead', { exact: true }).click();
    const secret = (await twoStep.getByLabel('Setup key', { exact: true }).inputValue()).replaceAll(' ', '');
    await twoStep.getByLabel(/^6-digit code/).fill(totpCode(secret));
    await twoStep.getByRole('button', { name: 'Turn on two-step verification', exact: true }).click();
    await expect(twoStep.getByRole('heading', { name: 'Save your recovery codes', exact: true })).toBeFocused();
    const codes = await twoStep.getByRole('list', { name: 'Recovery codes', exact: true }).getByRole('listitem').allTextContents();
    expect(codes).toHaveLength(10);
    await assertAccessible(page, 'Recovery codes');
    const done = twoStep.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeDisabled();
    await twoStep.getByRole('checkbox', { name: 'I saved these recovery codes', exact: true }).check();
    await done.click();
    await expect(twoStep.getByText('On, using an authenticator app.', { exact: true })).toBeVisible();
    await expect(twoStep.getByText(/10 unused recovery codes left\./)).toBeVisible();

    await page.goto('/#profile');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await page.route('**/realm/auth/login', async route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: await challengeFor('security') }),
    }));
    await page.getByLabel(/^Email\b/).fill(people.security.email);
    await page.getByLabel(/^Password\b/).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Two-step verification', exact: true })).toBeFocused();
    await expect(page.getByText('Enter the 6-digit code from your authenticator app.', { exact: true })).toBeVisible();
    await assertAccessible(page, 'Two-step sign-in');
    await page.getByLabel(/^Verification code/).fill('000000');
    await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('That code is not correct. 4 attempts left.');
    await expect(page.getByLabel(/^Verification code/)).toBeFocused();
    await page.getByRole('button', { name: 'Use a recovery code instead', exact: true }).click();
    await expect(page.getByLabel(/^Recovery code/)).toBeFocused();
    await page.getByLabel(/^Recovery code/).fill(codes[0].toLowerCase());
    await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
    await page.unroute('**/realm/auth/login');

    await page.goto('/#profile');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.route('**/realm/auth/login/google', async route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...await challengeFor('security'), isNewUser: false } }),
    }));
    await page.goto('/#login');
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Two-step verification', exact: true })).toBeFocused();
    await page.getByLabel(/^Verification code/).fill(totpCode(secret, { step: totpStep() + 1 }));
    await page.getByRole('button', { name: 'Verify and sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();

    await page.goto('/#settings');
    await twoStep.getByRole('button', { name: 'Create new recovery codes', exact: true }).click();
    await twoStep.getByLabel(/^Current password/).fill(password);
    await twoStep.getByLabel(/^Two-step code or recovery code/).fill(codes[1]);
    await twoStep.getByRole('button', { name: 'Create new codes', exact: true }).click();
    await expect(twoStep.getByRole('heading', { name: 'Save your recovery codes', exact: true })).toBeFocused();
    const fresh = await twoStep.getByRole('list', { name: 'Recovery codes', exact: true }).getByRole('listitem').allTextContents();
    expect(fresh).toHaveLength(10);
    expect(fresh).not.toContain(codes[2]);
    await twoStep.getByRole('checkbox', { name: 'I saved these recovery codes', exact: true }).check();
    await twoStep.getByRole('button', { name: 'Done', exact: true }).click();
    await twoStep.getByRole('button', { name: 'Turn off two-step verification', exact: true }).click();
    await twoStep.getByLabel(/^Current password/).fill(password);
    await twoStep.getByLabel(/^Two-step code or recovery code/).fill(codes[2]);
    await twoStep.getByRole('button', { name: 'Turn off', exact: true }).click();
    await expect(twoStep.getByRole('alert')).toHaveText('That two-step code is not correct.');
    await twoStep.getByLabel(/^Two-step code or recovery code/).fill(fresh[0]);
    await twoStep.getByRole('button', { name: 'Turn off', exact: true }).click();
    await expect(twoStep.getByRole('status').filter({ hasText: 'Two-step verification is off.' })).toBeVisible();
    await expect(twoStep.getByRole('heading', { name: 'Two-step verification', exact: true })).toBeFocused();

    await security.getByRole('button', { name: 'Sign out of all devices', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'You were signed out of all devices.' })).toBeVisible();
    const stale = await page.request.get(`${apiOrigin}/realm/account`, { headers: { Authorization: `Bearer ${staleAccess}` } });
    expect(stale.status()).toBe(401);
  } finally {
    await context.close();
  }
});

test('members download their data and permanently delete their account', async ({ browser }) => {
  const { context, page } = await signedIn(browser, 'leaving');
  try {
    await page.goto('/#settings');
    const security = page.getByRole('region', { name: 'Security', exact: true });
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      security.getByRole('button', { name: 'Download my data', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^every-music-data-\d{4}-\d{2}-\d{2}\.json$/);
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(exported.account.email).toBe(people.leaving.email);
    expect(exported.profile.artistName).toBe('Demo Leaving Soon');
    expect(JSON.stringify(exported)).not.toContain('"ciphertext"');
    await expect(security.getByRole('status').filter({ hasText: download.suggestedFilename() })).toBeVisible();

    const deletion = page.getByRole('region', { name: 'Delete account', exact: true });
    const submit = deletion.getByRole('button', { name: 'Delete my account permanently', exact: true });
    await deletion.getByLabel(/^Current password/).fill(password);
    await expect(submit).toBeDisabled();
    await deletion.getByRole('checkbox', { name: 'I understand that deleting my account is permanent', exact: true }).check();
    await assertAccessible(page, 'Account deletion form');
    await submit.click();
    await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Your account was deleted.' })).toBeVisible();
    expect((await pool.query('SELECT COUNT(*)::int AS count FROM users WHERE id = $1', [people.leaving.id])).rows[0].count).toBe(0);
    delete people.leaving;
  } finally {
    await context.close();
  }
});

test('people opt in to discovery and others find them by hashed email without sharing contacts', async ({ browser }) => {
  const { context, page } = await signedIn(browser, 'finder');
  try {
    await page.goto('/#settings');
    const privacy = page.getByRole('region', { name: 'Privacy', exact: true });
    const discoverable = privacy.getByRole('checkbox', { name: 'Let people who have my email address find me', exact: true });
    await expect(discoverable).not.toBeChecked();
    await discoverable.check();
    await expect(privacy.getByRole('status').filter({ hasText: 'Privacy setting saved.' })).toBeVisible();
    expect((await pool.query('SELECT COUNT(*)::int AS count FROM contact_discovery WHERE user_id = $1', [people.finder.id])).rows[0].count).toBe(1);
    await expect(privacy.getByText(/Nothing else on your device is read\./)).toBeVisible();

    await privacy.getByLabel('Email addresses', { exact: true }).fill(`  ${people.friend.email.toUpperCase()} , nobody-${marker}@example.test\n${people.admin.email}`);
    await expect(privacy.getByText('3 addresses ready to search.', { exact: true })).toBeVisible();
    const request = page.waitForRequest('**/realm/contacts/match');
    await privacy.getByRole('button', { name: 'Find musicians', exact: true }).click();
    const body = (await request).postData();
    expect(body).not.toContain('@');
    expect(JSON.parse(body).hashes).toContain(createHash('sha256').update(people.friend.email).digest('hex'));
    await expect(privacy.getByRole('status').filter({ hasText: 'Found 1 musician.' })).toBeVisible();
    const results = privacy.getByRole('region', { name: 'People you know', exact: true });
    await expect(results.getByRole('link', { name: 'Demo Known Friend', exact: true })).toBeVisible();
    await expect(results.getByRole('img', { name: 'Verified', exact: true })).toBeVisible();
    await expect(results.getByText(people.admin.artistName)).toHaveCount(0);
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Color theme', { exact: true }).selectOption(theme);
      await assertAccessible(page, `${theme} privacy settings with results`);
    }
    await page.setViewportSize({ width: 320, height: 720 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await discoverable.uncheck();
    await expect(privacy.getByRole('status').filter({ hasText: 'Privacy setting saved.' })).toBeVisible();
    expect((await pool.query('SELECT COUNT(*)::int AS count FROM contact_discovery WHERE user_id = $1', [people.finder.id])).rows[0].count).toBe(0);
  } finally {
    await context.close();
  }
});

test('members request verification with a coded selfie and administrators approve it through the audited queue', async ({ browser }) => {
  const member = await signedIn(browser, 'verify');
  const admin = await signedIn(browser, 'admin');
  try {
    await member.page.goto('/#profile');
    const verification = member.page.getByRole('region', { name: 'Verification', exact: true });
    const code = (await verification.locator('.verification-code').textContent()).trim();
    expect(code).toMatch(/^EM-[A-Z2-9]{6}$/);
    await verification.getByLabel('Selfie holding the code', { exact: true }).setInputFiles({ name: 'selfie.png', mimeType: 'image/png', buffer: image });
    await assertAccessible(member.page, 'Verification request form');
    await verification.getByRole('button', { name: 'Request verification', exact: true }).click();
    await expect(verification.getByRole('status').filter({ hasText: 'Request sent. An administrator will review it.' })).toBeVisible();
    await expect(verification.getByText(/^Waiting for review since/)).toBeVisible();
    const mediaId = (await pool.query('SELECT selfie_media_id FROM verification_requests WHERE subject_id = $1', [people.verify.id])).rows[0].selfie_media_id;
    expect((await member.page.request.get(`${apiOrigin}/realm/media/${mediaId}`)).status()).toBe(404);

    await admin.page.goto('/#admin');
    const queue = admin.page.getByRole('region', { name: 'Verification requests', exact: true });
    const card = queue.getByRole('listitem').filter({ hasText: 'Demo Photo Proof' });
    await expect(card.getByText(`Expected code: ${code}`, { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Show photos for Demo Photo Proof', exact: true }).click();
    const selfie = card.getByRole('img', { name: 'Selfie submitted by Demo Photo Proof', exact: true });
    await expect(selfie).toBeVisible();
    await expect.poll(() => selfie.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    for (const theme of ['light', 'dark']) {
      await admin.page.getByLabel('Color theme', { exact: true }).selectOption(theme);
      await assertAccessible(admin.page, `${theme} verification review queue`);
    }
    await card.getByLabel(/^Decision note/).fill('Selfie shows the expected code.');
    await card.getByRole('button', { name: 'Approve and add blue tick', exact: true }).click();
    await expect(queue.getByRole('status').filter({ hasText: 'Request from Demo Photo Proof approved.' })).toBeVisible();
    const audit = (await pool.query('SELECT action FROM admin_audit WHERE actor_id = $1 AND target_id = $2', [people.admin.id, people.verify.id])).rows.map(row => row.action);
    expect(audit).toEqual(expect.arrayContaining(['verification_media_viewed', 'verification_approved']));

    await admin.page.goto(`/#musician?id=${people.verify.id}`);
    await expect(admin.page.getByText('Verified profile', { exact: true })).toBeVisible();
    await member.page.reload();
    await expect(verification.getByText('Your profile is verified. A blue tick appears next to your name.', { exact: false })).toBeVisible();
  } finally {
    await member.context.close();
    await admin.context.close();
  }
});
