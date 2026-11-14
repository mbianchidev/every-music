import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import playwrightConfig from '../playwright.config.js';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';
import { webOrigin } from './origins.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const serverEnv = playwrightConfig.webServer[0].env;
// Sign-in is rate limited per IP, and other browser suites already use the
// form. These are real sessions issued with the browser API's synthetic keys.
const cipher = new CipherEngine({ cipher: {
  primaryKey: serverEnv.CIPHER_PRIMARY_KEY, refreshKey: serverEnv.CIPHER_REFRESH_KEY,
  issuer: 'every.music', audience: 'every.music.clients', accessTokenMinutes: 30, refreshTokenDays: 1,
} });
const marker = `orgs-${randomUUID().slice(0, 8)}`;
const names = ['Demo Leader', 'Demo Drummer', 'Demo Fan', 'Demo Booker', 'Demo Admin'];
const people = [];
const band = { name: `${marker} Riverglass`, slug: `${marker}-riverglass` };
const venue = { name: `${marker} Open Hall` };
let genre;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  genre = (await pool.query("SELECT id, name FROM genres WHERE name = 'Rock'")).rows[0];
  for (const [index, name] of names.entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id',
      [email, index === 4 ? 'admin' : 'member']);
    people.push({ id: rows[0].id, email, artistName: `${name} ${marker}` });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `${name} ${marker}`, 'Synthetic City']);
  }
});

test.afterAll(async () => {
  const ids = people.map(person => person.id);
  await pool.query('DELETE FROM organizations WHERE created_by = ANY($1::uuid[]) OR name LIKE $2', [ids, `${marker}%`]);
  await pool.query('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [ids]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  await pool.end();
});

async function signIn(browser, person) {
  const refresh = cipher.createRefreshToken(person.id);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [person.id, refresh.tokenHash, refresh.expiresAt]);
  const session = {
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: cipher.createAccessToken(person.id, person.email), refreshToken: refresh.token },
  };
  const context = await browser.newContext();
  await context.addInitScript(({ value, origin }) => {
    if (location.origin === origin && !sessionStorage.getItem('everymusic.session.v1')) {
      sessionStorage.setItem('everymusic.session.v1', JSON.stringify(value));
    }
  }, { value: session, origin: webOrigin });
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/#feed');
  await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
  return { context, page };
}

async function assertAccessible(page, label) {
  await expect(page.locator('.spinner')).toHaveCount(0);
  await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({ id: item.id, nodes: item.nodes.map(node => node.target) })), label).toEqual([]);
}

async function reflows(page, label) {
  await page.setViewportSize({ width: 320, height: 720 });
  await expect(page.locator('.spinner')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), label).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });
}

test('a musician creates a band page, invites a bandmate, and publishes on behalf of the band', async ({ browser }, testInfo) => {
  const { context: leaderContext, page: leader } = await signIn(browser, people[0]);
  const { context: memberContext, page: member } = await signIn(browser, people[1]);
  try {
    await leader.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Your pages', exact: true }).click();
    await expect(leader.getByRole('heading', { name: 'Your pages', exact: true, level: 1 })).toBeVisible();
    await expect(leader.getByText('You are not part of any page yet. Start one:')).toBeVisible();
    await assertAccessible(leader, 'empty Your pages');
    await leader.getByRole('link', { name: 'Create page: Band', exact: true }).click();
    await expect(leader.getByRole('radio', { name: 'Band', exact: true })).toBeChecked();
    await assertAccessible(leader, 'band editor');
    await leader.getByLabel(/^Name\b/).fill(band.name);
    await leader.getByLabel('Page address', { exact: true }).fill(band.slug);
    await leader.getByLabel('Your title', { exact: true }).fill('Lead guitar');
    await leader.getByLabel('Description', { exact: true }).fill('A fictional band for browser tests.');
    await leader.getByLabel('City', { exact: true }).fill('Synthetic City');
    await leader.getByRole('textbox', { name: 'Country', exact: true }).fill('Testland');
    await leader.getByLabel('Formed in (year)', { exact: true }).fill('2019');
    await leader.getByRole('checkbox', { name: 'Tours', exact: true }).check();
    await leader.getByText('Genres (0 selected)', { exact: true }).click();
    await leader.getByLabel(genre.name, { exact: true }).check();
    await leader.getByRole('button', { name: 'Add a link', exact: true }).click();
    await leader.getByLabel('Link type', { exact: true }).selectOption('bandcamp');
    await leader.getByLabel('Link URL', { exact: true }).fill('https://example.test/riverglass');
    await reflows(leader, 'band editor at 320px');
    await leader.getByRole('button', { name: 'Create page', exact: true }).click();
    await expect(leader.getByRole('heading', { name: band.name, level: 1 })).toBeVisible();
    await expect(leader.getByText('Tours', { exact: true })).toBeVisible();
    await expect(leader.getByRole('link', { name: 'Bandcamp', exact: true })).toHaveAttribute('href', 'https://example.test/riverglass');
    await expect(leader.getByRole('region', { name: 'Line-up' }).getByText(/Lead guitar/)).toBeVisible();

    await leader.getByRole('link', { name: 'Members', exact: true }).click();
    await expect(leader.getByRole('heading', { name: `Members of ${band.name}`, exact: true })).toBeVisible();
    await leader.getByLabel('Find a musician', { exact: true }).fill(people[1].artistName);
    await leader.getByLabel('Matches', { exact: true }).selectOption(people[1].id);
    await leader.getByRole('button', { name: 'Choose this person', exact: true }).click();
    const invite = leader.getByRole('region', { name: 'Invite a member' });
    await invite.getByLabel('Title', { exact: true }).fill('Drums');
    await invite.getByRole('checkbox', { name: 'Publish updates and announcements', exact: true }).check();
    await assertAccessible(leader, 'member invitation');
    await reflows(leader, 'member management at 320px');
    await leader.getByRole('button', { name: 'Send invitation', exact: true }).click();
    await expect(leader.getByRole('status').filter({ hasText: `Invitation sent to ${people[1].artistName}` })).toBeVisible();

    await member.goto('/#notifications');
    await expect(member.getByRole('link', { name: `You were invited to join ${band.name}`, exact: true })).toBeVisible();
    await member.goto('/#your-pages');
    await assertAccessible(member, 'Your pages with an invitation');
    await reflows(member, 'Your pages at 320px');
    await member.getByRole('button', { name: `Accept invitation to ${band.name}`, exact: true }).click();
    await expect(member.getByRole('status').filter({ hasText: `You joined ${band.name}.` })).toBeVisible();
    await member.getByRole('link', { name: band.name, exact: true }).click();
    await expect(member.getByRole('region', { name: 'Line-up' }).getByRole('link', { name: people[1].artistName })).toBeVisible();

    const { rows: [page] } = await pool.query('SELECT id FROM organizations WHERE slug = $1', [band.slug]);
    await member.goto(`/#create?organization=${page.id}`);
    await expect(member.getByLabel('Publish as', { exact: true })).toBeVisible();
    await member.getByLabel('Publish as', { exact: true }).selectOption({ label: `${band.name} (Band)` });
    await member.getByLabel(/^Title\b/).fill(`${marker} band needs a bassist`);
    await member.getByLabel(/^Description\b/).fill('Fictional band looking for a bass player for upcoming synthetic shows.');
    await member.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(member.locator('.organization-byline')).toContainText(`On behalf of ${band.name}`);
    await expect(member.locator('.organization-byline').getByRole('link', { name: band.name, exact: true })).toBeVisible();

    await leader.goto(`/#organization?id=${band.slug}`);
    await expect(leader.getByRole('region', { name: 'Open announcements' }).getByRole('link', { name: `${marker} band needs a bassist` })).toBeVisible();
    await leader.getByLabel('Update title', { exact: true }).fill('Rehearsal diary');
    await leader.getByLabel('Update text', { exact: true }).fill('Synthetic news from the rehearsal room.');
    await leader.getByRole('button', { name: 'Publish update', exact: true }).click();
    await expect(leader.getByRole('status').filter({ hasText: 'Update published.' })).toBeVisible();
    await leader.getByLabel(/^Release title\b/).fill('Synthetic EP');
    await leader.getByLabel('Format', { exact: true }).selectOption('ep');
    await leader.getByLabel('Release date', { exact: true }).fill('2026-03-01');
    await leader.getByRole('button', { name: 'Add release', exact: true }).click();
    await expect(leader.getByRole('status').filter({ hasText: 'Release added.' })).toBeVisible();
    await expect(leader.getByRole('heading', { name: 'Synthetic EP', exact: true })).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await leader.getByLabel('Color theme', { exact: true }).selectOption(theme);
      await assertAccessible(leader, `${theme} band page for its leader`);
      await leader.screenshot({ path: testInfo.outputPath(`${theme}-band-page.png`), fullPage: true });
    }
    await reflows(leader, 'band page at 320px');
  } finally {
    await leaderContext.close();
    await memberContext.close();
  }
});

test('fans discover and follow pages, music lovers share follows, and venues are claimed and verified', async ({ browser }, testInfo) => {
  const { context: fanContext, page: fan } = await signIn(browser, people[2]);
  const { context: bookerContext, page: booker } = await signIn(browser, people[3]);
  const { context: adminContext, page: admin } = await signIn(browser, people[4]);
  try {
    await fan.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Bands and venues', exact: true }).click();
    await expect(fan.getByRole('heading', { name: 'Bands and venues', exact: true, level: 1 })).toBeVisible();
    await fan.getByRole('searchbox', { name: 'Search pages', exact: true }).fill(marker);
    await fan.getByLabel('Page type', { exact: true }).selectOption('band');
    await expect(fan.getByRole('region', { name: 'Page results' }).getByRole('article')).toHaveCount(1);
    await assertAccessible(fan, 'page discovery');
    await fan.screenshot({ path: testInfo.outputPath('discovery.png') });
    await reflows(fan, 'discovery at 320px');
    await fan.getByRole('link', { name: band.name, exact: true }).click();
    await fan.getByRole('button', { name: 'Follow', exact: true }).click();
    await expect(fan.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
    await expect(fan.getByText('1 follower', { exact: true })).toBeVisible();
    await assertAccessible(fan, 'band page for a visitor');

    await fan.goto('/#edit-profile');
    await fan.getByRole('radio', { name: 'Music lover', exact: true }).check();
    await expect(fan.getByText(/^Instruments \(/)).toHaveCount(0);
    await fan.getByLabel('Bio', { exact: true }).fill('I go to every synthetic show.');
    await fan.getByLabel('Personal website', { exact: true }).fill('https://example.test/fan');
    await assertAccessible(fan, 'music lover profile editor');
    await fan.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(fan.getByRole('heading', { name: 'Following', exact: true })).toBeVisible();
    await expect(fan.getByRole('region', { name: 'Following' }).getByRole('link', { name: band.name, exact: true })).toBeVisible();
    await expect(fan.getByText('Music lover', { exact: true })).toBeVisible();
    await assertAccessible(fan, 'music lover profile');
    await fan.screenshot({ path: testInfo.outputPath('music-lover.png'), fullPage: true });

    await fan.goto('/#create-organization?kind=venue');
    await fan.getByRole('checkbox', { name: /I do not run this venue/ }).check();
    await fan.getByLabel(/^Name\b/).fill(venue.name);
    await fan.getByLabel('Type of place', { exact: true }).selectOption('social_center');
    await fan.getByLabel('Capacity', { exact: true }).fill('150');
    await fan.getByLabel('Parking nearby', { exact: true }).fill('Synthetic street parking.');
    await fan.getByLabel('Latitude', { exact: true }).fill('45.4642');
    await fan.getByLabel('Longitude', { exact: true }).fill('9.19');
    await fan.getByRole('button', { name: 'Create page', exact: true }).click();
    await expect(fan.getByRole('heading', { name: 'Community-maintained venue', exact: true })).toBeVisible();
    await expect(fan.getByRole('link', { name: 'View on OpenStreetMap', exact: true })).toHaveAttribute('href', /openstreetmap\.org\/\?mlat=45\.464200&mlon=9\.190000/);
    const venueHash = await fan.evaluate(() => location.hash);

    await fan.goto('/#settings');
    await fan.getByRole('checkbox', { name: 'Show the bands and artists I follow on my profile', exact: true }).uncheck();
    await expect(fan.getByRole('status').filter({ hasText: 'Profile visibility saved.' })).toBeVisible();
    await assertAccessible(fan, 'settings with follow visibility');

    await booker.goto(`/#musician?id=${people[2].id}`);
    await expect(booker.getByText('This person keeps the list of who they follow private.', { exact: true })).toBeVisible();
    await booker.goto(`/${venueHash}`);
    await booker.getByRole('button', { name: 'Claim this venue', exact: true }).click();
    const dialog = booker.getByRole('dialog', { name: 'Claim this venue', exact: true });
    await dialog.getByLabel(/^Your connection to the venue\b/).fill('I book the synthetic shows at this hall.');
    await assertAccessible(booker, 'venue claim dialog');
    await dialog.getByRole('button', { name: 'Send claim request', exact: true }).click();
    await expect(booker.getByText(/is waiting for review/)).toBeVisible();

    await admin.goto('/#admin');
    const claims = admin.getByRole('region', { name: 'Venue claim requests' });
    await claims.getByRole('button', { name: `Approve claim for ${venue.name}`, exact: true }).click();
    await expect(admin.getByRole('status').filter({ hasText: `Claim for ${venue.name} approved.` })).toBeVisible();
    await admin.getByLabel('Find a page by name', { exact: true }).fill(band.name);
    await admin.getByRole('button', { name: `Verify ${band.name}`, exact: true }).click();
    await expect(admin.getByRole('status').filter({ hasText: `${band.name} is now verified.` })).toBeVisible();
    await assertAccessible(admin, 'administration organization tools');
    await admin.screenshot({ path: testInfo.outputPath('admin.png'), fullPage: true });
    await admin.getByRole('link', { name: 'Audit log', exact: true }).click();
    await expect(admin.getByRole('cell', { name: 'organization claim approved', exact: true })).toBeVisible();
    await expect(admin.getByRole('cell', { name: 'organization verified', exact: true })).toBeVisible();

    await booker.reload();
    await expect(booker.getByRole('link', { name: 'Edit page', exact: true })).toBeVisible();
    await expect(booker.getByRole('heading', { name: 'Community-maintained venue', exact: true })).toHaveCount(0);
    await booker.goto(`/#organization?id=${band.slug}`);
    await expect(booker.getByText('Verified', { exact: true }).first()).toBeVisible();

    await fan.goto('/#your-pages');
    const updates = fan.getByRole('region', { name: 'Updates from pages you follow' });
    await expect(updates.getByRole('heading', { name: 'Rehearsal diary', exact: true })).toBeVisible();
    await expect(updates.getByText('EP: Synthetic EP', { exact: true })).toBeVisible();
  } finally {
    await fanContext.close();
    await bookerContext.close();
    await adminContext.close();
  }
});
