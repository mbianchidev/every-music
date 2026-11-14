import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { apiOrigin, webOrigin } from './origins.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `help-${randomUUID().slice(0, 8)}`;
// Must match the browser API signing keys in playwright.config.js. Sessions are
// minted directly so this suite does not consume the shared sign-in rate limit.
const SIGNING = {
  access: 'synthetic-browser-primary-key-longer-than-thirty-two-characters',
  refresh: 'synthetic-browser-refresh-key-longer-than-thirty-two-characters',
};
const people = {};
let termsVersion;

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
function sign(payload, key) {
  const unsigned = `${encode({ typ: 'JWT', alg: 'HS256' })}.${encode(payload)}`;
  return `${unsigned}.${createHmac('sha256', key).update(unsigned).digest('base64url')}`;
}

async function sessionFor(person) {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iat: now, iss: 'every.music', aud: 'every.music.clients' };
  const accessToken = sign({ ...claims, sub: person.id, email: person.email, exp: now + 1800, jti: randomUUID(), typ: 'access' }, SIGNING.access);
  const refreshToken = sign({ ...claims, sub: person.id, exp: now + 86400, jti: randomUUID(), typ: 'refresh' }, SIGNING.refresh);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [
    person.id, createHash('sha256').update(refreshToken).digest('hex'), new Date((now + 86400) * 1000),
  ]);
  return { persona: { userId: person.id, email: person.email, emailVerified: true }, keys: { accessToken, refreshToken } };
}

async function stubGoogle(context) {
  await context.route('https://accounts.google.com/**', route => route.fulfill({
    contentType: 'application/javascript', body: 'window.google = { accounts: { id: { initialize() {}, renderButton() {} } } };',
  }));
}

async function signedInContext(browser, person) {
  const context = await browser.newContext();
  await stubGoogle(context);
  await context.addInitScript(({ session, origin }) => {
    if (location.origin === origin && !sessionStorage.getItem('everymusic.session.v1')) {
      sessionStorage.setItem('everymusic.session.v1', JSON.stringify(session));
    }
  }, { session: await sessionFor(person), origin: webOrigin });
  return context;
}

async function assertAccessible(page, label) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({
    id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), label).toEqual([]);
}

async function reflows(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test.beforeEach(async ({ context }) => stubGoogle(context));

test.beforeAll(async () => {
  termsVersion = (await (await fetch(`${apiOrigin}/realm/legal`)).json()).data.termsVersion;
  for (const [key, role, artist] of [['member', 'member', 'Demo Help Member'], ['returning', 'member', 'Demo Returning Member'], ['admin', 'admin', 'Demo Help Admin']]) {
    const email = `${marker}-${key}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email, role]);
    people[key] = { id: rows[0].id, email, artist };
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, artist, 'Synthetic City']);
  }
  await pool.query("INSERT INTO terms_acceptances (user_id, terms_version, source, accepted_at) VALUES ($1, 'synthetic-old', 'prompt', NOW() - INTERVAL '30 days')", [people.returning.id]);
});

test.afterAll(async () => {
  await pool.query('DELETE FROM support_requests WHERE subject LIKE $1', [`${marker}%`]);
  await pool.query('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [Object.values(people).map(person => person.id)]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[]) OR email LIKE $2', [Object.values(people).map(person => person.id), `${marker}%`]);
  await pool.end();
});

test('visitors reach help and legal pages from sign-in and report a bug without sharing diagnostics', async ({ page }) => {
  await page.goto('/#login');
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await page.getByRole('contentinfo').getByRole('link', { name: 'Help center', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How can we help?', level: 1 })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Color theme', { exact: true }).selectOption(theme);
    await assertAccessible(page, `${theme} signed-out help center`);
  }
  await page.getByRole('main').getByRole('link', { name: /^Report a bug/ }).click();
  await expect(page.getByRole('heading', { name: 'Report a bug', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByLabel(/^Email address/)).toBeFocused();
  await expect(page.getByText('Enter a valid email address.', { exact: true })).toBeVisible();
  await page.getByLabel(/^Email address/).fill('visitor@example.test');
  await page.getByLabel(/^Subject/).fill(`${marker} visitor freeze`);
  await page.getByLabel(/^What happened\?/).fill('The synthetic feed froze after choosing a filter.');
  await page.getByLabel(/^Steps to reproduce/).fill('1. Open the feed\n2. Choose a filter');
  const consent = page.getByRole('checkbox', { name: 'Include technical details', exact: true });
  await expect(consent).not.toBeChecked();
  await expect(page.getByText(/Nothing is shared unless you select this/)).toBeVisible();
  await expect(page.locator('#support-website')).not.toBeInViewport();
  await assertAccessible(page, 'signed-out bug report form');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Thank you. Your request was sent.' })).toBeVisible();
  const { rows } = await pool.query('SELECT user_id, contact_email, diagnostics, steps FROM support_requests WHERE subject = $1', [`${marker} visitor freeze`]);
  expect(rows).toEqual([{ user_id: null, contact_email: 'visitor@example.test', diagnostics: null, steps: '1. Open the feed\n2. Choose a filter' }]);

  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/#help$/);
  await page.getByRole('main').getByRole('link', { name: 'Cookie policy', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cookie policy', level: 1 })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('must review and adapt this text');
  await expect(page.getByText(/Every.music itself sets no cookies/)).toBeVisible();
  for (const key of ['everymusic.session.v1', 'everymusic.theme', 'everymusic.locale', 'everymusic.tour.v1.*']) {
    await expect(page.getByRole('listitem').filter({ hasText: key }).first()).toBeVisible();
  }
  for (const [tab, heading] of [['Privacy policy', 'Privacy policy'], ['Terms of Use', 'Terms of Use'], ['Your data rights (GDPR)', 'Your data rights'], ['About Every.music', 'About Every.music'], ['Work with us', 'Work with us']]) {
    await page.getByRole('navigation', { name: 'Legal pages' }).getByRole('link', { name: tab, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
    await assertAccessible(page, `dark ${heading}`);
  }
  await page.getByRole('navigation', { name: 'Legal pages' }).getByRole('link', { name: 'Terms of Use', exact: true }).click();
  await expect(page.getByText(`Terms of Use (version ${termsVersion})`, { exact: false })).toBeVisible();
  await expect(page.getByText('[not configured by the operator]').first()).toBeVisible();
  await page.goto('/#legal?page=gdpr');
  await expect(page.getByRole('link', { name: 'Sign in to delete or export your data', exact: true })).toHaveAttribute('href', '#login');
  await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '#help');
  await page.setViewportSize({ width: 320, height: 720 });
  for (const hash of ['#help', '#help?view=bug', '#legal?page=privacy', '#register']) {
    await page.goto(`/${hash}`);
    await expect(page.getByRole('main')).toBeVisible();
    await reflows(page);
  }
});

test('new members accept the terms when registering and get a skippable keyboard tour', async ({ page, browser }) => {
  const email = `${marker}-new@example.test`;
  await page.goto('/#register');
  await page.getByLabel(/^Email\b/).fill(email);
  await page.getByLabel(/^Password\b/).fill('Synthetic1Password');
  await page.getByLabel(/^Confirm password\b/).fill('Synthetic1Password');
  const accept = page.getByRole('checkbox', { name: `I accept the Terms of Use (version ${termsVersion}) and have read the Privacy policy`, exact: true });
  await expect(accept).toBeEnabled();
  await expect(page.getByRole('link', { name: 'Terms of Use (opens in a new tab)', exact: true })).toHaveAttribute('target', '_blank');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Accept the Terms of Use to create an account.' })).toBeVisible();
  await accept.check();
  await assertAccessible(page, 'registration with terms acceptance');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Check your email', exact: true })).toBeVisible();
  const { rows } = await pool.query(`
    SELECT u.id, t.terms_version, t.source, o.tour_status FROM users u
    JOIN terms_acceptances t ON t.user_id = u.id JOIN user_onboarding o ON o.user_id = u.id WHERE u.email = $1`, [email]);
  expect(rows.map(({ id, ...row }) => row)).toEqual([{ terms_version: termsVersion, source: 'registration', tour_status: 'pending' }]);
  const member = { id: rows[0].id, email };
  await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [member.id]);

  const context = await signedInContext(browser, member);
  try {
    const app = await context.newPage();
    await app.setViewportSize({ width: 1280, height: 900 });
    await app.goto('/#feed');
    const tour = app.getByRole('dialog', { name: 'Welcome tour', exact: true });
    await expect(tour).toBeVisible();
    await expect(tour.getByRole('heading', { name: 'Your feed', exact: true })).toBeVisible();
    await expect(tour.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
    await expect(tour.getByText('Step 1 of 7', { exact: true })).toBeVisible();
    const feedLink = app.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Feed', exact: true });
    const [highlight, link] = await Promise.all([app.locator('.tour-highlight').boundingBox(), feedLink.boundingBox()]);
    expect(highlight.x <= link.x && highlight.y <= link.y && highlight.x + highlight.width >= link.x + link.width).toBe(true);
    await assertAccessible(app, 'welcome tour dialog');
    await app.keyboard.press('Enter');
    await expect(tour.getByRole('heading', { name: 'Find musicians', exact: true })).toBeVisible();
    await app.keyboard.press('Shift+Tab');
    await expect(tour.getByRole('button', { name: 'Back', exact: true })).toBeFocused();
    await app.keyboard.press('Enter');
    await expect(tour.getByRole('heading', { name: 'Your feed', exact: true })).toBeVisible();
    await expect(tour.getByRole('button', { name: 'Next', exact: true })).toBeFocused();
    for (const title of ['Find musicians', 'Post a call', 'Messages', 'Your profile', 'Settings', 'Help center']) {
      await app.keyboard.press('Enter');
      await expect(tour.getByRole('heading', { name: title, exact: true })).toBeVisible();
    }
    await expect(tour.getByRole('button', { name: 'Finish', exact: true })).toBeFocused();
    await app.keyboard.press('Enter');
    await expect(tour).toHaveCount(0);
    await expect.poll(async () => (await pool.query('SELECT tour_status FROM user_onboarding WHERE user_id = $1', [member.id])).rows[0].tour_status).toBe('completed');
    expect(await app.evaluate(id => localStorage.getItem(`everymusic.tour.v1.${id}`), member.id)).toBe('completed');
    await app.reload();
    await expect(app.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
    await expect(app.getByRole('dialog', { name: 'Welcome tour' })).toHaveCount(0);

    await app.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Help', exact: true }).click();
    const replay = app.getByRole('button', { name: 'Replay the welcome tour', exact: true });
    await replay.click();
    await expect(tour).toBeVisible();
    await app.keyboard.press('Escape');
    await expect(tour).toHaveCount(0);
    await expect(replay).toBeFocused();
    await expect.poll(async () => (await pool.query('SELECT tour_status FROM user_onboarding WHERE user_id = $1', [member.id])).rows[0].tour_status).toBe('skipped');

    await app.emulateMedia({ reducedMotion: 'reduce' });
    await app.setViewportSize({ width: 320, height: 720 });
    await replay.click();
    await expect(tour).toBeVisible();
    expect(await app.locator('.tour-card').evaluate(card => Number.parseFloat(getComputedStyle(card).transitionDuration) < 0.01)).toBe(true);
    for (let step = 0; step < 5; step += 1) await app.keyboard.press('Enter');
    await expect(tour.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await expect(tour.getByText('On small screens, open More to find it.', { exact: true })).toBeVisible();
    expect(await app.locator('.tour-card').evaluate(card => {
      const box = card.getBoundingClientRect();
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    })).toBe(true);
    await assertAccessible(app, 'narrow welcome tour');
    await tour.getByRole('button', { name: 'Skip tour', exact: true }).click();
    await expect(tour).toHaveCount(0);
  } finally { await context.close(); }
});

test('returning members accept updated terms once and can read them first', async ({ browser }) => {
  const context = await signedInContext(browser, people.returning);
  try {
    const page = await context.newPage();
    await page.goto('/#feed');
    await expect(page.getByRole('heading', { name: 'Review and accept the Terms of Use', level: 1 })).toBeVisible();
    await expect(page.getByText(/You previously accepted version synthetic-old/)).toBeVisible();
    await assertAccessible(page, 'terms acceptance prompt');
    await page.getByRole('link', { name: 'Read the Terms of Use', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Terms of Use', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Review and accept the Terms of Use', level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Accept and continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
    const { rows } = await pool.query('SELECT terms_version FROM terms_acceptances WHERE user_id = $1 ORDER BY accepted_at', [people.returning.id]);
    expect(rows.map(row => row.terms_version)).toEqual(['synthetic-old', termsVersion]);
    expect((await pool.query('SELECT 1 FROM user_onboarding WHERE user_id = $1', [people.returning.id])).rowCount).toBe(0);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Welcome tour' })).toHaveCount(0);
  } finally { await context.close(); }
});

test('signed-in requests reach the admin help desk, replies notify the member, and ratings are aggregated', async ({ browser }) => {
  const memberContext = await signedInContext(browser, people.member);
  const adminContext = await signedInContext(browser, people.admin);
  try {
    const member = await memberContext.newPage();
    const admin = await adminContext.newPage();
    await member.goto('/#feed');
    await member.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Help', exact: true }).click();
    await expect(member.getByRole('heading', { name: 'How can we help?', level: 1 })).toBeVisible();
    await assertAccessible(member, 'signed-in help center');
    await member.getByRole('main').getByRole('link', { name: /^Contact us/ }).click();
    await member.getByLabel(/^Subject/).fill(`${marker} question`);
    await member.getByLabel(/^Message/).fill('How do I invite a synthetic drummer to my project?');
    await member.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(member.getByRole('status').filter({ hasText: 'Follow the answer in Your support requests.' })).toBeVisible();
    await member.getByRole('status').getByRole('link', { name: 'Your support requests', exact: true }).click();
    const request = member.getByRole('listitem').filter({ has: member.getByRole('heading', { name: `${marker} question` }) });
    await expect(request).toContainText('Open');
    await expect(request).toContainText('No reply yet.');

    await admin.goto('/#admin');
    await expect(admin.getByRole('heading', { name: 'Help desk', exact: true })).toBeVisible();
    await admin.getByRole('button', { name: `Open ${marker} question`, exact: true }).click();
    await expect(admin.getByRole('heading', { name: `${marker} question`, exact: true })).toBeVisible();
    await expect(admin.getByText('No email address was provided. The requester reads replies in the app.', { exact: true })).toBeVisible();
    await assertAccessible(admin, 'admin support request detail');
    await admin.getByLabel('Status', { exact: true }).selectOption('answered');
    await admin.getByLabel(/^Reply note/).fill('Open your project and add the drummer as a collaborator.');
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'Support request updated.' })).toBeVisible();
    const audit = await pool.query('SELECT action FROM admin_audit WHERE actor_id = $1 ORDER BY created_at, action', [people.admin.id]);
    expect(audit.rows.map(row => row.action)).toEqual(['support_request_viewed', 'support_replied', 'support_status_changed']);

    await member.goto('/#notifications');
    await member.getByRole('link', { name: 'The team replied to your support request', exact: true }).click();
    await expect(member).toHaveURL(/#help\?view=requests$/);
    await expect(request).toContainText('Answered');
    await expect(request).toContainText('Open your project and add the drummer as a collaborator.');

    await member.goto('/#help?view=rate');
    await expect(member.getByRole('group', { name: 'Your rating for version 1.0.0' })).toBeVisible();
    await assertAccessible(member, 'rating form');
    await member.getByRole('button', { name: 'Send rating', exact: true }).click();
    await expect(member.getByRole('alert').filter({ hasText: 'Choose from 1 to 5 stars.' })).toBeVisible();
    await member.getByRole('radio', { name: '4 stars', exact: true }).check();
    await member.getByLabel(/^Comment/).fill('Synthetic praise for the new help center.');
    await member.getByRole('button', { name: 'Send rating', exact: true }).click();
    await expect(member.getByRole('status').filter({ hasText: 'Thank you for rating version 1.0.0: 4 stars.' })).toBeVisible();
    await member.reload();
    await expect(member.getByText('You rated version 1.0.0: 4 stars.', { exact: true })).toBeVisible();
    const rating = await pool.query('SELECT stars, platform, rewarded_at FROM app_ratings WHERE user_id = $1', [people.member.id]);
    expect(rating.rows).toEqual([{ stars: 4, platform: 'web', rewarded_at: null }]);

    await admin.getByRole('button', { name: 'Back to the inbox', exact: true }).click();
    await admin.getByRole('button', { name: 'App ratings', exact: true }).click();
    await expect(admin.getByRole('button', { name: 'App ratings', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(admin.getByText('Synthetic praise for the new help center.', { exact: true })).toBeVisible();
    await expect(admin.getByRole('table', { name: 'Ratings by version' }).getByRole('row', { name: /^1\.0\.0/ })).toBeVisible();
    await assertAccessible(admin, 'admin rating summary');
    await admin.setViewportSize({ width: 320, height: 720 });
    await reflows(admin);
  } finally {
    await memberContext.close();
    await adminContext.close();
  }
});

test('version notices offer a dismissible update banner and block unsupported clients', async ({ page }) => {
  let versions = { serverVersion: '9.1.0', minimumClientVersion: null, latestClientVersion: '9.1.0', updateUrl: 'https://example.test/download' };
  await page.route(`${apiOrigin}/realm/app/version`, route => route.fulfill({
    status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': webOrigin },
    body: JSON.stringify({ success: true, data: versions }),
  }));
  await page.goto('/#login');
  const banner = page.getByRole('status').filter({ hasText: 'Every.music 9.1.0 is available. You are using 1.0.0.' });
  await expect(banner).toBeVisible();
  await assertAccessible(page, 'update banner');
  await banner.getByRole('link', { name: 'How to update', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Update Every.music', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'On this device (Web browser)' })).toBeVisible();
  await expect(page.getByText('Version 9.1.0 is available.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss the update notice', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Update Every.music', level: 1 })).toBeVisible();
  await expect(banner).toHaveCount(0);

  versions = { ...versions, minimumClientVersion: '9.0.0' };
  await page.goto('/#login');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Update Every.music to continue', level: 1 })).toBeVisible();
  await expect(page.getByText('This version (1.0.0) is no longer supported. Version 9.0.0 or newer is required.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload to update', exact: true })).toBeVisible();
  await page.getByText('Instructions for other devices', { exact: true }).click();
  await expect(page.getByRole('link', { name: 'Open the download page' }).first()).toHaveAttribute('href', 'https://example.test/download');
  await assertAccessible(page, 'blocking update screen');
  await page.getByRole('contentinfo').getByRole('link', { name: 'Help center', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'How can we help?', level: 1 })).toBeVisible();
});

test('back controls follow in-app history or fall back to the parent screen', async ({ browser }) => {
  const context = await signedInContext(browser, people.member);
  try {
    const page = await context.newPage();
    await page.goto('/#musicians');
    await page.getByRole('searchbox', { name: 'Search musicians', exact: true }).fill('Demo Returning Member');
    await page.getByRole('link', { name: 'Demo Returning Member', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Demo Returning Member', level: 1 })).toBeVisible();
    await page.getByRole('link', { name: 'Back', exact: true }).click();
    await expect(page).toHaveURL(/#musicians\?searchTerm=Demo\+Returning\+Member/);
    await expect(page.getByRole('heading', { name: 'Find musicians', level: 1 })).toBeVisible();

    const direct = await context.newPage();
    await direct.goto(`/#musician?id=${people.returning.id}`);
    await expect(direct.getByRole('heading', { name: 'Demo Returning Member', level: 1 })).toBeVisible();
    await direct.getByRole('link', { name: 'Back', exact: true }).click();
    // The search screen may canonicalize its query string after the fallback lands.
    await expect(direct).toHaveURL(/#musicians(?:\?|$)/);
    await expect(direct.getByRole('heading', { name: 'Find musicians', level: 1 })).toBeVisible();
    await direct.goto('/#edit-profile');
    await expect(direct.getByRole('link', { name: 'Back', exact: true })).toHaveAttribute('href', '#profile');
    await direct.goto('/#feed');
    await expect(direct.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
    await expect(direct.getByRole('link', { name: 'Back', exact: true })).toHaveCount(0);
  } finally { await context.close(); }
});
