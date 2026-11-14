import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import playwrightConfig from '../playwright.config.js';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';
import { webOrigin } from './origins.js';
import itApp from '../src/locales/it/app.js';
import itFeed from '../src/locales/it/feed.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const bcrypt = requireBackend('bcryptjs');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `channels-${randomUUID().slice(0, 8)}`;
const password = 'Synthetic1Password';
const people = [];
const apiEnvironment = playwrightConfig.webServer[0].env;
// Sessions are minted with the browser API's synthetic keys so these journeys
// do not consume the shared per-IP sign-in budget used by other suites.
const cipher = new CipherEngine({ cipher: {
  primaryKey: apiEnvironment.CIPHER_PRIMARY_KEY, refreshKey: apiEnvironment.CIPHER_REFRESH_KEY,
  issuer: apiEnvironment.TOKEN_ISSUER || 'every.music', audience: apiEnvironment.TOKEN_AUDIENCE || 'every.music.clients',
  accessTokenMinutes: 30, refreshTokenDays: 1,
} });

test.beforeAll(async () => {
  const hash = bcrypt.hashSync(password, 4);
  for (let i = 0; i < 2; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, TRUE) RETURNING id', [email, hash],
    );
    people.push({ id: rows[0].id, email });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `Demo Channels ${i}`, 'Synthetic City']);
  }
});

test.afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

async function login(page, person, text = { calls: 'Open calls', live: 'Live updates connected' }) {
  const refresh = cipher.createRefreshToken(person.id);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [person.id, refresh.tokenHash, refresh.expiresAt]);
  const session = {
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: cipher.createAccessToken(person.id, person.email), refreshToken: refresh.token },
  };
  await page.context().addInitScript(({ value, origin }) => {
    if (location.origin === origin && !sessionStorage.getItem('everymusic.session.v1')) {
      sessionStorage.setItem('everymusic.session.v1', JSON.stringify(value));
    }
  }, { value: session, origin: webOrigin });
  await page.goto('/#feed');
  await expect(page.getByRole('heading', { name: text.calls, exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: text.live })).toBeVisible();
}

async function assertAccessible(page, label) {
  await expect(page.locator('.spinner')).toHaveCount(0);
  await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({
    id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), label).toEqual([]);
}

test('musicians choose notification channels per kind and read localized notifications', async ({ page }) => {
  const [person] = people;
  await pool.query(`INSERT INTO notifications (user_id, kind, title, link, params, push_sent) VALUES
    ($1, 'announcement_stats', 'Your weekly announcement statistics', '#analytics', '{"views": 1234, "likes": 5, "saves": 2}', TRUE),
    ($1, 'invite_friends', 'Invite musician friends to Every.music', '#invite', '{"days": 7}', TRUE),
    ($1, 'brand_new_kind', 'Synthetic server fallback title', '#feed', '{}', TRUE)`, [person.id]);
  await login(page, person);

  await page.goto('/#notifications');
  const list = page.locator('.notification-list');
  await expect(list.getByRole('link', { name: 'Your weekly announcement statistics', exact: true })).toBeVisible();
  await expect(list.getByText('Last 7 days: 1,234 views, 5 likes, 2 saves.', { exact: true })).toBeVisible();
  await expect(list.getByRole('link', { name: 'Invite musician friends to Every.music', exact: true })).toHaveAttribute('href', '#invite');
  await expect(list.getByRole('link', { name: 'Synthetic server fallback title', exact: true })).toBeVisible();
  await assertAccessible(page, 'Localized notification center');

  await page.getByRole('link', { name: 'Manage notification settings', exact: true }).click();
  const heading = page.getByRole('heading', { name: 'Notification channels', exact: true });
  await expect(heading).toBeFocused();
  const section = page.locator('section.notification-preferences');
  await expect(section.getByText(`Email notifications go to your account address, ${person.email}.`, { exact: false })).toBeVisible();

  const message = section.getByRole('group', { name: 'New message received', exact: true });
  await expect(message.getByRole('checkbox', { name: 'In app', exact: true })).toBeChecked();
  await expect(message.getByRole('checkbox', { name: 'Email', exact: true })).not.toBeChecked();
  const comeBack = section.getByRole('group', { name: 'Reminder after a long break', exact: true });
  await expect(comeBack.getByRole('checkbox', { name: 'In app (not available)', exact: true })).toBeDisabled();
  await expect(comeBack.getByRole('checkbox', { name: 'Email', exact: true })).toBeChecked();
  await expect(section.getByRole('group', { name: 'Daily profile view summary', exact: true }))
    .toContainText('Not sent while "Daily profile-view notifications (only with analytics consent)" is off');
  await expect(section.getByRole('group', { name: 'Weekly announcement statistics', exact: true }))
    .toContainText('Your current plan does not include these statistics');
  await assertAccessible(page, 'Notification channel matrix');

  const email = message.getByRole('checkbox', { name: 'Email', exact: true });
  await email.focus();
  await page.keyboard.press('Space');
  await expect(email).toBeChecked();
  await section.getByRole('group', { name: 'Comment on your announcement', exact: true }).getByRole('checkbox', { name: 'In app', exact: true }).uncheck();
  await comeBack.getByRole('checkbox', { name: 'Email', exact: true }).uncheck();
  await section.getByRole('button', { name: 'Save notification channels', exact: true }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Notification channels saved.' })).toBeVisible();
  const { rows } = await pool.query(
    'SELECT kind, in_app, push, email FROM notification_channel_preferences WHERE user_id = $1 ORDER BY kind', [person.id],
  );
  expect(rows).toEqual([
    { kind: 'come_back', in_app: null, push: null, email: false },
    { kind: 'comment', in_app: false, push: null, email: null },
    { kind: 'message', in_app: null, push: null, email: true },
  ]);

  await page.reload();
  await expect(section.getByRole('group', { name: 'New message received', exact: true }).getByRole('checkbox', { name: 'Email', exact: true })).toBeChecked();
  await expect(section.getByRole('group', { name: 'Comment on your announcement', exact: true }).getByRole('checkbox', { name: 'In app', exact: true })).not.toBeChecked();

  await page.getByLabel('Daily profile-view notifications (only with analytics consent)', { exact: true }).check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved.' })).toBeVisible();
  await expect(section.getByRole('group', { name: 'Daily profile view summary', exact: true })).not.toContainText('Not sent while');

  await page.getByLabel('Color theme', { exact: true }).selectOption('dark');
  await assertAccessible(page, 'Dark notification channel matrix');
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(section.getByRole('button', { name: 'Save notification channels', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Italian users see localized notification text and channel labels', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'it-IT' });
  await context.addInitScript(() => localStorage.setItem('everymusic.locale', 'it'));
  const page = await context.newPage();
  const person = people[1];
  try {
    await pool.query(`INSERT INTO notifications (user_id, kind, title, link, params) VALUES
      ($1, 'profile_stats', 'Your weekly profile statistics', '#analytics', '{"views": 12000}')`, [person.id]);
    await login(page, person, { calls: itFeed.search.calls.title, live: itApp.header.liveConnected });
    await page.goto('/#notifications');
    await expect(page.getByRole('link', { name: 'Le statistiche settimanali del tuo profilo', exact: true })).toBeVisible();
    await expect(page.getByText('Ultimi 7 giorni: 12.000 visite al profilo.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Gestisci le impostazioni delle notifiche', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Canali di notifica', exact: true })).toBeFocused();
    await expect(page.getByRole('group', { name: 'Nuovo messaggio ricevuto', exact: true }).getByRole('checkbox', { name: "Nell'app", exact: true })).toBeChecked();
    await assertAccessible(page, 'Italian notification channels');
  } finally {
    await context.close();
  }
});
