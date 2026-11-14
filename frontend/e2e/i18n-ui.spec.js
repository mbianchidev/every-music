import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import playwrightConfig from '../playwright.config.js';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';
import { webOrigin } from './origins.js';
import nlApp from '../src/locales/nl/app.js';
import itApp from '../src/locales/it/app.js';
import nlAuth from '../src/locales/nl/auth.js';
import nlFeed from '../src/locales/nl/feed.js';
import itFeed from '../src/locales/it/feed.js';
import nlSettings from '../src/locales/nl/settings.js';
import itSettings from '../src/locales/it/settings.js';
import nlCommon from '../src/locales/nl/common.js';
import itCommon from '../src/locales/it/common.js';
import nlEvents from '../src/locales/nl/events.js';
import itEvents from '../src/locales/it/events.js';
import nlMarketplace from '../src/locales/nl/marketplace.js';
import itMarketplace from '../src/locales/it/marketplace.js';
import nlMonetization from '../src/locales/nl/monetization.js';
import itMonetization from '../src/locales/it/monetization.js';
import itProfile from '../src/locales/it/profile.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `i18n-${randomUUID().slice(0, 8)}`;
const people = [];
const apiEnvironment = playwrightConfig.webServer[0].env;
// Sessions are minted with the browser API's synthetic keys so these journeys
// do not consume the shared per-IP sign-in budget used by other suites.
const cipher = new CipherEngine({ cipher: {
  primaryKey: apiEnvironment.CIPHER_PRIMARY_KEY, refreshKey: apiEnvironment.CIPHER_REFRESH_KEY,
  issuer: apiEnvironment.TOKEN_ISSUER || 'every.music', audience: apiEnvironment.TOKEN_AUDIENCE || 'every.music.clients',
  accessTokenMinutes: 30, refreshTokenDays: 1,
} });

const catalogs = {
  nl: { app: nlApp, feed: nlFeed, settings: nlSettings, common: nlCommon, events: nlEvents, marketplace: nlMarketplace, monetization: nlMonetization },
  it: { app: itApp, feed: itFeed, settings: itSettings, common: itCommon, events: itEvents, marketplace: itMarketplace, monetization: itMonetization },
};
const names = { en: 'English', nl: 'Nederlands', it: 'Italiano' };

test.beforeAll(async () => {
  for (const [index, locale] of [null, 'it', null].entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email]);
    people.push({ id: rows[0].id, email });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `Demo Language ${index}`, 'Synthetic City']);
    if (locale) await pool.query('INSERT INTO user_preferences (user_id, locale) VALUES ($1, $2)', [rows[0].id, locale]);
  }
});

test.afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

async function session(person) {
  const refresh = cipher.createRefreshToken(person.id);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [person.id, refresh.tokenHash, refresh.expiresAt]);
  return {
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: cipher.createAccessToken(person.id, person.email), refreshToken: refresh.token },
  };
}

// Restores a signed-in session in this tab, as a reload after signing in would.
async function signIn(page, person, locale) {
  const value = await session(person);
  await page.evaluate(stored => sessionStorage.setItem('everymusic.session.v1', JSON.stringify(stored)), value);
  await page.reload();
  await page.goto(`${webOrigin}/#feed`);
  await expect(page.locator('html')).toHaveAttribute('lang', locale);
  await expect(page.getByRole('heading', { level: 1, name: catalogs[locale].feed.search.calls.title, exact: true })).toBeVisible();
}

const accountLocale = async person => (await pool.query('SELECT locale FROM user_preferences WHERE user_id = $1', [person.id])).rows[0]?.locale ?? null;

async function assertAccessible(page, label) {
  await expect(page.locator('.spinner')).toHaveCount(0);
  await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({
    id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), label).toEqual([]);
}

async function visitScreens(page, locale) {
  const text = catalogs[locale];
  const screens = [
    ['#feed', text.feed.search.calls.title, text.app.routes.feed],
    ['#musicians', text.feed.search.musicians.title, text.app.routes.musicians],
    ['#settings', text.settings.title, text.app.routes.settings],
    ['#events', text.events.header.title, text.events.routes.discover],
    ['#marketplace', text.marketplace.header.title, text.marketplace.routes.marketplace],
    ['#store', text.monetization.store.title, text.monetization.routes.store],
  ];
  for (const [hash, heading, title] of screens) {
    await page.goto(`${webOrigin}/${hash}`);
    await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page).toHaveTitle(`${title} · Every.music`);
    await expect(page.getByRole('navigation', { name: text.app.nav.primary }).first()).toBeAttached();
    await assertAccessible(page, `${locale} ${hash}`);
  }
}

test('the sign-in language carries into a new account, settings switch it, and it survives reloads', async ({ page }) => {
  const [person] = people;
  await page.goto(`${webOrigin}/#login`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.getByLabel('Language', { exact: true }).selectOption({ label: names.nl });
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  await expect(page.getByRole('heading', { level: 1, name: nlAuth.login.title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: nlAuth.login.submit, exact: true })).toBeVisible();
  await expect(page.getByLabel(nlCommon.language.label, { exact: true })).toHaveValue('nl');
  await expect(page).toHaveTitle(`${nlApp.routes.signIn} · Every.music`);
  await assertAccessible(page, 'Dutch sign-in');
  await page.setViewportSize({ width: 320, height: 720 });
  await page.reload();
  await expect(page.getByLabel(nlCommon.language.label, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole('button', { name: nlAuth.login.createAccount, exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: nlAuth.register.title, exact: true })).toBeVisible();
  await expect(page.getByLabel(nlCommon.language.label, { exact: true })).toHaveValue('nl');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1, name: nlAuth.register.title, exact: true })).toBeVisible();
  await assertAccessible(page, 'Dutch registration');
  expect(await page.evaluate(() => localStorage.getItem('everymusic.locale'))).toBe('nl');

  await signIn(page, person, 'nl');
  await expect.poll(() => accountLocale(person)).toBe('nl');
  await visitScreens(page, 'nl');

  await page.goto(`${webOrigin}/#settings`);
  const language = page.getByRole('region', { name: nlSettings.language.heading });
  await language.getByLabel(nlCommon.language.label, { exact: true }).selectOption({ label: names.it });
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.getByRole('heading', { level: 1, name: itSettings.title, exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: itCommon.language.saved })).toBeVisible();
  await expect(page).toHaveTitle(`${itApp.routes.settings} · Every.music`);
  await expect.poll(() => accountLocale(person)).toBe('it');
  expect(await page.evaluate(() => localStorage.getItem('everymusic.locale'))).toBe('nl');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.getByRole('heading', { level: 1, name: itSettings.title, exact: true })).toBeVisible();
  await visitScreens(page, 'it');

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(`${webOrigin}/#settings`);
  await expect(page.getByRole('region', { name: itSettings.language.heading }).getByLabel(itCommon.language.label, { exact: true })).toHaveValue('it');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the account language wins on sign-in and never leaks to the next account', async ({ browser }) => {
  const [, italian, fresh] = people;
  const context = await browser.newContext();
  await context.addInitScript(() => { if (!localStorage.getItem('everymusic.locale')) localStorage.setItem('everymusic.locale', 'nl'); });
  const page = await context.newPage();
  try {
    await page.goto(`${webOrigin}/#login`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    await signIn(page, italian, 'it');
    expect(await accountLocale(italian)).toBe('it');
    await assertAccessible(page, 'Italian feed for an account with a saved language');

    await page.goto(`${webOrigin}/#profile`);
    await page.getByRole('button', { name: itProfile.signOut, exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: nlAuth.login.title, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
    expect(await page.evaluate(() => sessionStorage.getItem('everymusic.account-locale.v1'))).toBeNull();

    await signIn(page, fresh, 'nl');
    await expect.poll(() => accountLocale(fresh)).toBe('nl');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  } finally {
    await context.close();
  }
});
