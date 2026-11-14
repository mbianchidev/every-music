import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { webOrigin } from '../e2e/origins.js';
import { cleanup, pool, seed, state, storeSession } from './seed.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const sharp = requireBackend('sharp');
const imagesDirectory = fileURLToPath(new URL('../../docs/images/', import.meta.url));
const HEADER_OFFSET = 96;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await seed();
  await mkdir(imagesDirectory, { recursive: true });
});

test.afterAll(async () => {
  await cleanup();
  await pool.end();
});

async function open(browser, key, { width = 1280, height = 800, theme = 'light', language = 'en', mobile = false } = {}) {
  const person = state.people[key];
  const session = await storeSession(person);
  session.persona = { ...session.persona, artistName: person.name, profilePictureUrl: person.pictureUrl };
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, colorScheme: theme, reducedMotion: 'reduce',
    locale: language === 'it' ? 'it-IT' : 'en-GB', timezoneId: 'Europe/Rome', ...(mobile ? { isMobile: true, hasTouch: true } : {}),
  });
  await context.addInitScript(({ value, origin, colorTheme, locale }) => {
    if (location.origin !== origin) return;
    if (!sessionStorage.getItem('everymusic.session.v1')) sessionStorage.setItem('everymusic.session.v1', JSON.stringify(value));
    localStorage.setItem('everymusic.theme', colorTheme);
    localStorage.setItem('everymusic.locale', locale);
  }, { value: session, origin: webOrigin, colorTheme: theme, locale: language });
  const page = await context.newPage();
  return { context, page };
}

// Waits until data, pictures, fonts, and transitions have finished so the
// capture never shows spinners or half-loaded images.
async function settle(page) {
  await expect(page.locator('.connection-status.is-live')).toHaveCount(1);
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(async () => {
    for (const image of document.querySelectorAll('img[loading="lazy"]')) image.loading = 'eager';
    await document.fonts.ready;
    await Promise.all([...document.images].filter(image => !image.complete)
      .map(image => new Promise(resolve => { image.addEventListener('load', resolve); image.addEventListener('error', resolve); })));
    await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {})));
  });
  expect(await page.evaluate(() => [...document.images].filter(image => image.naturalWidth === 0).length)).toBe(0);
}

async function visit(page, hash, heading) {
  await page.goto(`/${hash}`);
  await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
  await settle(page);
}

const documentTop = locator => locator.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
const documentBottom = locator => locator.evaluate(element => element.getBoundingClientRect().bottom + window.scrollY);

// Grows the viewport instead of using a full-page screenshot, so the sticky
// header and sidebar render once at the top instead of mid-page. The main
// area normally fills the viewport; dropping that minimum keeps the footer in
// the tall capture.
async function fit(page, until, padding = 20) {
  const { width } = page.viewportSize();
  await page.evaluate(() => window.scrollTo(0, 0));
  let height;
  if (until === 'page') {
    await page.addStyleTag({ content: '#main-content { min-height: 0 !important; }' });
    height = await page.evaluate(() => document.documentElement.scrollHeight);
  } else {
    height = Math.ceil(await documentBottom(until)) + padding;
  }
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.scrollTo(0, 0));
}

// Shows the part of the page from one element to another below the header.
async function frame(page, from, to, padding = 32) {
  const { width } = page.viewportSize();
  const top = await documentTop(from);
  const bottom = await documentBottom(to);
  await page.setViewportSize({ width, height: Math.ceil(bottom - top + HEADER_OFFSET + padding) });
  await scrollTo(page, from);
}

async function scrollTo(page, locator) {
  await locator.evaluate((element, offset) => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - offset), HEADER_OFFSET);
}

// Palette PNGs keep UI captures sharp while staying small enough for the docs.
async function save(page, name) {
  await settle(page);
  await page.evaluate(() => document.activeElement?.blur());
  await page.mouse.move(0, 0);
  const raw = await page.screenshot({ animations: 'disabled', caret: 'hide' });
  const png = await sharp(raw).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
  await writeFile(`${imagesDirectory}${name}.png`, png);
  const { width, height } = await sharp(png).metadata();
  test.info().annotations.push({ type: 'screenshot', description: `${name}.png ${width}x${height} ${Math.round(png.length / 1024)} KB` });
}

test('feed hero with a keyword search and one filter', async ({ browser }) => {
  const { context, page } = await open(browser, 'noor', { height: 1200, theme: 'dark' });
  try {
    await visit(page, '#feed?searchTerm=band&country=IT', 'Open calls');
    await expect(page.getByText('Filters and sorting (1 active)')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Search results' }).getByText('Promoted')).toBeVisible();
    await save(page, 'every-music-feed');
  } finally { await context.close(); }
});

test('musicians near a city with distances', async ({ browser }) => {
  const { context, page } = await open(browser, 'femke');
  try {
    const milan = state.places['Milan:IT'];
    await visit(page, `#musicians?placeId=${milan.id}&placeLabel=${encodeURIComponent(milan.label)}&radiusKm=50&sort=distance`, 'Find musicians');
    await page.getByText(/^Filters and sorting/).click();
    const results = page.getByRole('region', { name: 'Search results' });
    await expect(results.getByRole('article')).toHaveCount(6);
    await expect(results.getByText(/km away/).first()).toBeVisible();
    await fit(page, 'page');
    await save(page, 'musicians-distance-search');
  } finally { await context.close(); }
});

test('musician profile', async ({ browser }) => {
  const { context, page } = await open(browser, 'noor');
  try {
    await visit(page, `#musician?id=${state.people.lia.id}`, 'Lia Montenero');
    await expect(page.getByText('Verified profile')).toBeVisible();
    await expect(page.getByText('@lia_montenero_demo')).toBeVisible();
    await fit(page, page.locator('.project-list'));
    await save(page, 'musician-profile');
  } finally { await context.close(); }
});

test('reviews and anonymous rating', async ({ browser }) => {
  const { context, page } = await open(browser, 'rosa');
  try {
    await visit(page, `#musician?id=${state.people.lia.id}`, 'Lia Montenero');
    const reviews = page.getByRole('region', { name: 'Reviews' });
    const rating = page.getByRole('region', { name: 'Anonymous rating' });
    await expect(reviews.getByText('Brilliant toplines', { exact: false })).toBeVisible();
    await expect(rating.getByText(/Your rating, visible only to you/)).toBeVisible();
    await frame(page, reviews, rating, 12);
    await save(page, 'musician-reviews');
  } finally { await context.close(); }
});

test('announcement with the apply form', async ({ browser }) => {
  const { context, page } = await open(browser, 'noor', { height: 1100 });
  try {
    await visit(page, `#announcement?id=${state.calls[1].id}`, 'Glass Harbor is looking for a bass player');
    await page.getByRole('button', { name: 'Apply to this call' }).click();
    await page.getByLabel(/^Message to the owner/).fill('Hi Dario! I play melodic bass in a funk band in Bergamo and know the Glass Harbor records well. I can make Tuesday rehearsals and the March tour.');
    await page.getByRole('checkbox', { name: 'Bass Guitar', exact: true }).check();
    await page.getByRole('button', { name: 'Add link' }).click();
    await page.getByLabel('Link 1 type', { exact: true }).selectOption('soundcloud');
    await page.getByLabel(/^Link 1 address/).fill('https://audio.example/noor/demo');
    await frame(page, page.getByText(/^Posted by/), page.getByRole('button', { name: 'Send application' }));
    await save(page, 'announcement-apply');
  } finally { await context.close(); }
});

test('applications dashboard', async ({ browser }) => {
  const { context, page } = await open(browser, 'lia', { height: 1400 });
  try {
    await visit(page, '#applications?view=received', 'Applications');
    await expect(page.getByText('Hi Lia!', { exact: false })).toBeVisible();
    await save(page, 'applications-dashboard');
  } finally { await context.close(); }
});

test('band page', async ({ browser }) => {
  const { context, page } = await open(browser, 'rosa');
  try {
    await visit(page, `#organization?id=${state.organizations.glass.id}`, 'Glass Harbor');
    await expect(page.getByRole('region', { name: 'Events' }).getByText('Glass Harbor: Tidal Lines release show')).toBeVisible();
    await fit(page, 'page');
    await save(page, 'band-page');
  } finally { await context.close(); }
});

test('events discovery and event page', async ({ browser }) => {
  const { context, page } = await open(browser, 'rosa');
  try {
    await visit(page, '#events', 'Events');
    await expect(page.getByRole('region', { name: 'Events' }).getByRole('article')).toHaveCount(6);
    await fit(page, 'page');
    await save(page, 'events-discovery');

    await page.setViewportSize({ width: 1280, height: 800 });
    await visit(page, `#event?id=${state.events.release.id}`, 'Glass Harbor: Tidal Lines release show');
    const rsvp = page.getByRole('region', { name: 'Are you going?' });
    await expect(rsvp.getByRole('button', { name: 'Going', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await fit(page, rsvp);
    await save(page, 'event-page');

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByLabel('Color theme', { exact: true }).selectOption('dark');
    await frame(page, page.getByRole('region', { name: 'Lineup' }), page.getByRole('region', { name: 'Discussion' }));
    await save(page, 'event-page-dark');
  } finally { await context.close(); }
});

test('band calendar', async ({ browser }) => {
  const { context, page } = await open(browser, 'dario');
  try {
    await visit(page, '#calendar', 'My calendar');
    await expect(page.getByText('Strings overdubs for "Low Tide"')).toBeVisible();
    await fit(page, page.getByText('Calendar subscription settings'));
    await save(page, 'band-calendar');
    await page.setViewportSize({ width: 1280, height: 800 });
    await visit(page, `#calendar-entry?id=${state.entries.recording.id}`, 'Strings overdubs for "Low Tide"');
    await fit(page, 'page');
    await save(page, 'calendar-entry');
  } finally { await context.close(); }
});

test('marketplace', async ({ browser }) => {
  const { context, page } = await open(browser, 'noor');
  try {
    await visit(page, '#marketplace', 'Marketplace');
    await expect(page.getByRole('region', { name: 'Listings' }).getByRole('article')).toHaveCount(6);
    await fit(page, 'page');
    await save(page, 'marketplace');
    await page.setViewportSize({ width: 1280, height: 800 });
    await visit(page, `#listing?id=${state.listings[0].id}`, 'Honey-finish acoustic guitar with pickup');
    await fit(page, 'page');
    await save(page, 'marketplace-listing');
  } finally { await context.close(); }
});

test('store and wallet', async ({ browser }) => {
  const { context, page } = await open(browser, 'noor');
  try {
    await visit(page, '#store', 'Premium and points');
    await expect(page.getByRole('button', { name: 'Subscribe to Premium' })).toBeVisible();
    await fit(page, 'page');
    await save(page, 'store');
    await page.setViewportSize({ width: 1280, height: 800 });
    await visit(page, '#wallet', 'Points wallet');
    await expect(page.getByText('Corda & Co. Strings').first()).toBeVisible();
    await fit(page, 'page');
    await save(page, 'wallet');
  } finally { await context.close(); }
});

test('notifications and notification channels', async ({ browser }) => {
  const { context, page } = await open(browser, 'noor', { height: 1100 });
  try {
    await visit(page, '#notifications', 'Notifications');
    await save(page, 'notifications');
    await visit(page, '#settings', 'Settings');
    await scrollTo(page, page.getByRole('heading', { name: 'Notification channels', exact: true }));
    await save(page, 'notification-settings');
  } finally { await context.close(); }
});

test('help center', async ({ browser }) => {
  const { context, page } = await open(browser, 'noor');
  try {
    await visit(page, '#help', 'How can we help?');
    await fit(page, 'page');
    await save(page, 'help-center');
  } finally { await context.close(); }
});

test('administration overview', async ({ browser }) => {
  const { context, page } = await open(browser, 'admin');
  try {
    await visit(page, '#admin', 'Platform and safety');
    const helpDesk = page.getByRole('region', { name: 'Help desk' });
    await expect(helpDesk.getByText('Calendar reminder arrived twice')).toBeVisible();
    await fit(page, helpDesk);
    await save(page, 'admin-overview');
  } finally { await context.close(); }
});

test('feed in Italian', async ({ browser }) => {
  const { context, page } = await open(browser, 'giulia', { language: 'it', height: 900 });
  try {
    const bologna = state.places['Bologna:IT'];
    await visit(page, `#feed?placeId=${bologna.id}&placeLabel=${encodeURIComponent(bologna.label)}&radiusKm=250&sort=distance`, 'Annunci aperti');
    await save(page, 'feed-italian');
  } finally { await context.close(); }
});

test('mobile feed', async ({ browser }) => {
  const { context, page } = await open(browser, 'noor', { width: 390, height: 844, mobile: true });
  try {
    await visit(page, '#feed', 'Open calls');
    await save(page, 'mobile-feed');
  } finally { await context.close(); }
});
