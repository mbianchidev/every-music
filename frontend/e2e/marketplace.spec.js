import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';
import config from '../playwright.config.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const sharp = requireBackend('sharp');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `market-${randomUUID().slice(0, 8)}`;
const people = [];
let image;

test.beforeAll(async () => {
  const names = ['Demo Gear Seller', 'Demo Gear Buyer', 'Demo Market Moderator'];
  for (let i = 0; i < names.length; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await pool.query(
      'INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id', [email, i === 2 ? 'admin' : 'member'],
    );
    people.push({ id: rows[0].id, email, artistName: names[i] });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, names[i], 'Synthetic City']);
  }
  const services = ['sound_engineer', 'driver', 'security', 'tour_manager', 'light_technician', 'booking_agency', 'graphic_designer',
    'video_maker', 'social_media_manager', 'vocal_coach', 'drums_coach', 'guitar_coach', 'other_service', 'driver'];
  for (let i = 0; i < services.length; i += 1) {
    await pool.query(`
      INSERT INTO marketplace_listings (user_id, listing_type, category, title, description, price_mode, price_minor, currency, rate_unit,
        location_text, is_remote, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, 'fixed', $6, 'EUR', 'day', 'Synthetic City', $7, NOW() + INTERVAL '30 days', NOW() - $8 * INTERVAL '1 hour')`, [
      people[i % 2].id, i % 3 === 0 ? 'service_wanted' : 'service_offer', services[i],
      `${marker} crew ${String(i).padStart(2, '0')}`, 'A fictional crew listing for browser testing.', (i + 1) * 5000, i % 2 === 0, i,
    ]);
  }
  await pool.query(`
    INSERT INTO marketplace_listings (user_id, listing_type, category, title, description, price_mode, expires_at, created_at)
    VALUES ($1, 'wanted', 'dj', $2, 'A fictional expired request for a DJ mixer.', 'negotiable', NOW() - INTERVAL '1 day', NOW() - INTERVAL '61 days')`,
  [people[0].id, `${marker} expired mixer request`]);
  image = await sharp({ create: { width: 120, height: 90, channels: 3, background: '#7a5c3e' } }).png().toBuffer();
});

test.afterAll(async () => {
  await pool.query('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

// Sessions are minted with the browser API's synthetic signing key instead of
// the sign-in form, so this suite does not spend the shared per-IP login rate
// limit that the community suite exercises in the same API process.
const apiEnvironment = config.webServer[0].env;
const engine = new CipherEngine({ cipher: {
  primaryKey: apiEnvironment.CIPHER_PRIMARY_KEY, issuer: 'every.music', audience: 'every.music.clients', accessTokenMinutes: 60,
} });

async function login(page, person) {
  await page.addInitScript(session => {
    if (!sessionStorage.getItem('everymusic.session.v1')) sessionStorage.setItem('everymusic.session.v1', session);
  }, JSON.stringify({
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: engine.createAccessToken(person.id, person.email), refreshToken: 'synthetic-unused-refresh-token' },
  }));
  await page.goto('/#feed');
  await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Live updates connected' })).toBeVisible();
}

async function assertAccessible(page, label) {
  await expect(page.locator('.spinner')).toHaveCount(0);
  await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({
    id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), label).toEqual([]);
}

test('sellers publish gear, buyers find, save, contact and report it, and moderators remove it', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const [seller, buyer, moderator] = await Promise.all(contexts.map(context => context.newPage()));
  const title = `${marker} sunburst electric guitar`;
  try {
    await login(seller, people[0]);
    await seller.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Marketplace', exact: true }).click();
    await expect(seller.getByRole('heading', { name: 'Marketplace', exact: true })).toBeVisible();
    await expect(seller.getByRole('navigation', { name: 'Marketplace sections' }).getByRole('link', { name: 'Gear', exact: true })).toHaveAttribute('aria-current', 'page');
    await assertAccessible(seller, 'Marketplace gear tab');
    await seller.getByRole('navigation', { name: 'Your marketplace' }).getByRole('link', { name: 'New listing', exact: true }).click();
    await expect(seller.getByRole('heading', { name: 'New listing', exact: true })).toBeVisible();
    await seller.getByLabel(/^What are you listing\?/).selectOption('sell');
    await seller.getByLabel(/^Category\b/).selectOption('guitars');
    await seller.getByLabel('Subcategory', { exact: true }).selectOption('electric_guitar');
    await seller.getByLabel(/^Title\b/).fill(title);
    await seller.getByLabel(/^Description\b/).fill('A fictional sunburst guitar with a hard case. Synthetic browser fixture.');
    await seller.getByRole('button', { name: 'Publish listing', exact: true }).click();
    await expect(seller.getByRole('alert').filter({ hasText: 'Choose the condition of the item.' })).toBeFocused();
    await seller.getByLabel(/^Condition\b/).selectOption('used');
    await seller.getByLabel(/^Amount\b/).fill('450');
    await seller.getByLabel('Currency', { exact: true }).selectOption('EUR');
    await seller.getByLabel(/^Location\b/).fill('Synthetic Amsterdam');
    await seller.getByLabel('I can ship this item', { exact: true }).check();
    await seller.getByLabel('Add photos', { exact: true }).setInputFiles({ name: 'guitar.png', mimeType: 'image/png', buffer: image });
    await expect(seller.getByRole('img', { name: 'Listing photo 1', exact: true })).toBeVisible();
    await assertAccessible(seller, 'Listing editor');
    await seller.getByRole('button', { name: 'Publish listing', exact: true }).click();
    await expect(seller.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(seller.getByText('€450.00', { exact: true })).toBeVisible();
    await expect(seller.getByRole('heading', { name: 'Stay safe when buying, selling, and hiring', exact: true })).toBeVisible();
    await expect(seller.getByText(/Payments and deliveries happen outside Every\.music/)).toBeVisible();
    const listingUrl = seller.url();
    for (const theme of ['light', 'dark']) {
      await seller.getByLabel('Color theme', { exact: true }).selectOption(theme);
      await assertAccessible(seller, `${theme} owner listing detail`);
    }

    await login(buyer, people[1]);
    await buyer.goto('/#marketplace?tab=gear');
    await buyer.getByRole('searchbox', { name: 'Search listings', exact: true }).fill(marker);
    const results = buyer.getByRole('region', { name: 'Listings' });
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(results.getByRole('article')).toHaveCount(1);
    await buyer.getByText('Filters and sorting', { exact: true }).click();
    await buyer.getByLabel('Condition', { exact: true }).selectOption('used');
    await buyer.getByLabel('Maximum price', { exact: true }).fill('500');
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(results.getByRole('article')).toHaveCount(1);
    await buyer.getByLabel('Minimum price', { exact: true }).fill('600');
    await buyer.getByLabel('Maximum price', { exact: true }).fill('');
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(results.getByText('No listings match. Try different filters or post what you are looking for.', { exact: true })).toBeVisible();
    await buyer.getByLabel('Minimum price', { exact: true }).fill('abc');
    await expect(buyer.getByText('Enter prices as numbers, for example 120 or 99.50.', { exact: true })).toBeVisible();
    await buyer.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await buyer.getByRole('searchbox', { name: 'Search listings', exact: true }).fill(marker);
    await expect(results.getByRole('article')).toHaveCount(1);
    await results.getByRole('button', { name: `Save ${title}`, exact: true }).click();
    await expect(results.getByRole('button', { name: `Saved: ${title}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await results.getByRole('link', { name: title, exact: true }).click();
    await expect(buyer.getByRole('img', { name: `Photo 1 of 1: ${title}`, exact: true })).toBeVisible();
    await expect(buyer.locator('.listing-seller').getByRole('link', { name: 'Demo Gear Seller', exact: true })).toBeVisible();
    await assertAccessible(buyer, 'Buyer listing detail');
    await buyer.getByRole('button', { name: 'Report listing', exact: true }).click();
    const report = buyer.getByRole('dialog', { name: 'Report listing', exact: true });
    await report.getByLabel(/^Reason\b/).selectOption('spam');
    await report.getByLabel(/^Describe the concern\b/).fill('A synthetic concern about this listing.');
    await report.getByRole('checkbox', { name: 'I agree to share these report details with administrators', exact: true }).check();
    await assertAccessible(buyer, 'Listing report dialog');
    await report.getByRole('button', { name: 'Submit report', exact: true }).click();
    await expect(report).not.toBeVisible();
    await expect(buyer.getByRole('status').filter({ hasText: 'Report submitted.' })).toBeVisible();
    await buyer.getByRole('navigation', { name: 'Your marketplace' }).getByRole('link', { name: 'Saved listings', exact: true }).click();
    await expect(buyer.getByRole('heading', { name: 'Saved listings', exact: true })).toBeVisible();
    await expect(buyer.getByRole('link', { name: title, exact: true })).toBeVisible();
    await assertAccessible(buyer, 'Saved listings');
    await buyer.goto(listingUrl.slice(listingUrl.indexOf('#')).replace(/^/, '/'));
    await buyer.getByRole('button', { name: 'Contact Demo Gear Seller', exact: true }).click();
    await expect(buyer).toHaveURL(/#messages\?id=/);
    await expect(buyer.getByLabel(/^Message\b/)).toHaveValue(new RegExp(`your listing "${title}"`));

    await seller.getByRole('button', { name: 'Mark reserved', exact: true }).click();
    await expect(seller.getByRole('status').filter({ hasText: 'Listing marked reserved.' })).toBeVisible();
    await expect(seller.locator('.listing-detail .tag-list').getByText('Reserved', { exact: true })).toBeVisible();

    await login(moderator, people[2]);
    await moderator.goto('/#admin?tab=reports');
    const queue = moderator.getByRole('table', { name: 'Open listing reports', exact: true });
    await expect(queue.getByRole('link', { name: title, exact: true })).toBeVisible();
    await expect(queue.getByRole('link', { name: `Review report about listing ${title}`, exact: true })).toBeVisible();
    await assertAccessible(moderator, 'Marketplace moderation queue');
    await queue.getByRole('button', { name: `Remove listing ${title}`, exact: true }).click();
    const removal = moderator.getByRole('dialog', { name: 'Remove listing', exact: true });
    await removal.getByLabel(/^Internal decision note\b/).fill('Synthetic listing removed after review.');
    await removal.getByRole('button', { name: 'Remove listing', exact: true }).click();
    await expect(moderator.getByRole('status').filter({ hasText: 'Listing removed.' })).toBeVisible();
    await expect(moderator.getByText('No open listing reports.', { exact: true })).toBeVisible();
    await moderator.getByRole('navigation', { name: 'Administration sections' }).getByRole('link', { name: 'Audit log', exact: true }).click();
    const listingId = new URLSearchParams(listingUrl.split('?')[1]).get('id');
    await expect(moderator.getByRole('table', { name: 'Administrator audit log', exact: true }).getByRole('row').filter({ hasText: listingId })
      .getByText('listing removed', { exact: true })).toBeVisible();

    await seller.reload();
    await expect(seller.getByText(/A moderator removed this listing/)).toBeVisible();
    await expect(seller.getByRole('link', { name: 'Edit', exact: true })).toHaveCount(0);
    await buyer.goto(listingUrl.slice(listingUrl.indexOf('#')).replace(/^/, '/'));
    await expect(buyer.getByRole('alert').filter({ hasText: 'Listing not found' })).toBeVisible();
    await buyer.goto('/#reports');
    await expect(buyer.getByRole('article').filter({ hasText: 'Status: actioned' })).toHaveCount(1);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('marketplace tabs filter, sort, page, and reflow on narrow screens', async ({ page }) => {
  await login(page, people[1]);
  await page.goto('/#marketplace?tab=services');
  const tabs = page.getByRole('navigation', { name: 'Marketplace sections' });
  await expect(tabs.getByRole('link', { name: 'Services and hire', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.getByRole('searchbox', { name: 'Search listings', exact: true }).fill(`${marker} crew`);
  const results = page.getByRole('region', { name: 'Listings' });
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.getByRole('article')).toHaveCount(12);
  await page.getByText('Filters and sorting', { exact: true }).click();
  await page.getByLabel('Sort by', { exact: true }).selectOption('price_desc');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.getByRole('article').first().getByText('€700.00 per day', { exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Results pages' }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.getByRole('article')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Listings', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Results pages' }).getByRole('status')).toHaveText('Page 2');
  await page.getByText(/^Filters and sorting/).click();
  await page.getByLabel('Listing type', { exact: true }).selectOption('service_wanted');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.getByRole('article')).toHaveCount(5);
  await page.getByLabel('Category', { exact: true }).selectOption('tour_manager');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.getByRole('article')).toHaveCount(1);
  for (const tab of ['Gear', 'Lessons', 'Services and hire', 'Endorsements']) {
    await tabs.getByRole('link', { name: tab, exact: true }).click();
    await expect(tabs.getByRole('link', { name: tab, exact: true })).toHaveAttribute('aria-current', 'page');
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Color theme', { exact: true }).selectOption(theme);
      await assertAccessible(page, `${theme} ${tab}`);
    }
  }
  await page.setViewportSize({ width: 320, height: 720 });
  for (const hash of ['#marketplace?tab=services', '#new-listing', '#my-listings', '#saved-listings']) {
    await page.goto(`/${hash}`);
    await expect(page.locator('.spinner')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), hash).toBe(true);
    await assertAccessible(page, `narrow ${hash}`);
  }
  await page.getByRole('button', { name: 'More navigation', exact: true }).click();
  await page.getByRole('dialog', { name: 'Your workspace', exact: true }).getByRole('link', { name: 'Marketplace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Marketplace', exact: true })).toBeVisible();
});

test('owners renew expired listings, close and reopen them, and delete them', async ({ page }) => {
  page.on('dialog', dialog => dialog.accept());
  await login(page, people[0]);
  await page.goto('/#my-listings');
  const card = page.getByRole('article').filter({ hasText: `${marker} expired mixer request` });
  await expect(card.getByText('Expired', { exact: true })).toBeVisible();
  await assertAccessible(page, 'My listings');
  await card.getByRole('button', { name: /^Renew for \d+ days$/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Listing renewed until' })).toBeVisible();
  await expect(card.getByText('Expired', { exact: true })).toHaveCount(0);
  await card.getByRole('link', { name: `Manage ${marker} expired mixer request`, exact: true }).click();
  await expect(page.getByRole('heading', { name: `${marker} expired mixer request`, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark sold', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close listing', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Listing marked closed.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Renew for/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Reopen', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Listing marked active.' })).toBeVisible();
  await page.getByRole('link', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit listing', exact: true })).toBeVisible();
  await page.getByLabel(/^Amount \(optional\)/).fill('80');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('€80.00, negotiable', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete listing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My listings', exact: true })).toBeVisible();
  await expect(page.getByRole('article').filter({ hasText: `${marker} expired mixer request` })).toHaveCount(0);
});
