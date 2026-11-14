import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import playwrightConfig from '../playwright.config.js';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';
import { utcToZoned } from '../../backend/src/engines/event-model.js';
import { webOrigin } from './origins.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const sharp = requireBackend('sharp');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const serverEnv = playwrightConfig.webServer[0].env;
// Real refresh sessions issued with the browser API's synthetic keys, so this
// suite does not use the per-IP sign-in limit exercised by community.spec.js.
const cipher = new CipherEngine({ cipher: {
  primaryKey: serverEnv.CIPHER_PRIMARY_KEY, refreshKey: serverEnv.CIPHER_REFRESH_KEY,
  issuer: 'every.music', audience: 'every.music.clients', accessTokenMinutes: 30, refreshTokenDays: 1,
} });
const marker = `gigs-${randomUUID().slice(0, 8)}`;
const names = ['Demo Promoter', 'Demo Singer', 'Demo Fan', 'Demo Admin'];
const people = [];
const pages = {};
const title = `${marker} Summer Synth Festival`;
const start = utcToZoned(new Date(Date.now() + 21 * 24 * 60 * 60 * 1000), 'Europe/Rome').slice(0, 11);
let image;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  for (const [index, name] of names.entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id',
      [email, index === 3 ? 'admin' : 'member']);
    people.push({ id: rows[0].id, email, artistName: `${name} ${marker}` });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `${name} ${marker}`, 'Synthetic City']);
  }
  const page = async (key, kind, leader, extra = {}) => {
    const { rows } = await pool.query(`
      INSERT INTO organizations (kind, name, created_by, city, latitude, longitude, capacity)
      VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name`,
    [kind, `${marker} ${extra.name}`, leader.id, extra.city ?? null, extra.latitude ?? null, extra.longitude ?? null, extra.capacity ?? null]);
    await pool.query(`
      INSERT INTO organization_members (organization_id, user_id, role, status, joined_on) VALUES ($1, $2, 'leader', 'active', CURRENT_DATE)`,
    [rows[0].id, leader.id]);
    pages[key] = rows[0];
  };
  await page('organizer', 'organizer', people[0], { name: 'Night Owls Promotions' });
  await page('venue', 'venue', people[0], { name: 'Riverside Hall', city: 'Milan', latitude: 45.4642, longitude: 9.19, capacity: 800 });
  await page('band', 'band', people[1], { name: 'Glass Harbor' });
  await pool.query('INSERT INTO organization_followers (organization_id, user_id) VALUES ($1, $2)', [pages.band.id, people[2].id]);
  image = await sharp({ create: { width: 160, height: 90, channels: 3, background: '#4a3f8c' } }).png().toBuffer();
});

test.afterAll(async () => {
  const ids = people.map(person => person.id);
  await pool.query('DELETE FROM events WHERE created_by = ANY($1::uuid[]) OR title LIKE $2', [ids, `${marker}%`]);
  await pool.query('DELETE FROM organizations WHERE created_by = ANY($1::uuid[])', [ids]);
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
  const context = await browser.newContext({ acceptDownloads: true });
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

async function pick(page, label, term, value, action) {
  await page.getByLabel(label, { exact: true }).fill(term);
  const matches = page.getByLabel('Matches', { exact: true });
  await expect(matches.locator(`option[value="${value}"]`)).toHaveCount(1);
  await matches.selectOption(value);
  await page.getByRole('button', { name: action, exact: true }).click();
}

test('an organizer publishes a festival with a venue, lineup, tickets and an image', async ({ browser }) => {
  const { context, page } = await signIn(browser, people[0]);
  try {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Events', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Events', exact: true, level: 1 })).toBeVisible();
    await assertAccessible(page, 'events discovery');
    await page.getByRole('navigation', { name: 'Events' }).getByRole('link', { name: 'New event', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New event', exact: true, level: 1 })).toBeVisible();
    await page.getByRole('button', { name: 'Save event', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Give the event a title of at least three characters.' })).toBeFocused();
    await page.getByLabel(/^Event title/).fill(title);
    await page.getByLabel('Type', { exact: true }).selectOption('festival');
    await page.getByLabel('Description', { exact: true }).fill('Doors, bar; and a synthetic lineup for browser tests.');
    await page.getByRole('checkbox', { name: `${pages.organizer.name} (Organizer)`, exact: true }).check();
    await page.getByLabel(/^Time zone/).selectOption('Europe/Rome');
    await page.getByLabel(/^Starts/).fill(`${start}20:00`);
    await page.getByLabel('Doors open (optional)', { exact: true }).fill(`${start}19:00`);
    await pick(page, 'Venue page', 'Riverside Hall', pages.venue.id, 'Use this venue');
    await expect(page.getByText(/Riverside Hall/).first()).toBeVisible();
    await pick(page, 'Find a band page', 'Glass Harbor', pages.band.id, 'Add band');
    await page.getByLabel('Or add a performer by name', { exact: true }).fill('The Synthetic Strangers');
    await page.getByRole('button', { name: 'Add performer', exact: true }).click();
    await expect(page.getByLabel('Role for The Synthetic Strangers', { exact: true })).toHaveValue('support');
    await page.getByLabel('Set starts for The Synthetic Strangers', { exact: true }).fill(`${start}20:30`);
    await page.getByLabel('Capacity', { exact: true }).fill('500');
    await page.getByLabel(/^Tickets sold/).fill('125');
    await page.getByRole('button', { name: 'Add ticket link', exact: true }).click();
    await page.getByLabel('Ticket seller 1', { exact: true }).fill('Synthetic Tickets');
    await page.getByLabel(/^Ticket page address 1/).fill('https://tickets.example.test/festival');
    await page.getByLabel('Add images', { exact: true }).setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: image });
    await expect(page.getByRole('img', { name: 'Event image 1', exact: true })).toBeVisible();
    await page.getByRole('radio', { name: 'Published: anyone can find it', exact: true }).check();
    await assertAccessible(page, 'event editor');
    await reflows(page, 'event editor at 320px');
    await page.getByRole('button', { name: 'Save event', exact: true }).click();

    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    const lineup = page.getByRole('region', { name: 'Lineup' });
    await expect(lineup.getByRole('heading', { name: 'Headliners', exact: true })).toBeVisible();
    await expect(lineup.getByRole('link', { name: pages.band.name, exact: true })).toHaveAttribute('href', `#organization?id=${pages.band.id}`);
    await expect(lineup.getByText('The Synthetic Strangers', { exact: true })).toBeVisible();
    await expect(page.getByText('125 of 500 tickets sold (25%)')).toBeVisible();
    const ticket = page.getByRole('link', { name: /Buy tickets on Synthetic Tickets/ });
    await expect(ticket).toHaveAttribute('href', 'https://tickets.example.test/festival');
    await expect(ticket).toHaveAttribute('rel', 'noopener noreferrer nofollow');
    await expect(ticket).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: /Open map/ })).toHaveAttribute('href', /openstreetmap\.org\/\?mlat=45\.464200/);
    await expect(page.getByRole('link', { name: pages.venue.name, exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: `Photo 1 for ${title}`, exact: true })).toBeVisible();
    for (const theme of ['light', 'dark']) {
      await page.getByLabel('Color theme', { exact: true }).selectOption(theme);
      await assertAccessible(page, `${theme} organizer event page`);
    }
    await reflows(page, 'event page at 320px');
  } finally {
    await context.close();
  }
});

test('fans find the event, reply, set reminders, add it to a calendar and join the discussion', async ({ browser }) => {
  const { context, page } = await signIn(browser, people[2]);
  try {
    await page.goto('/#notifications');
    await expect(page.getByRole('link', { name: `New event: ${title}`, exact: true })).toBeVisible();
    await page.goto('/#events');
    await page.getByRole('searchbox', { name: 'Search events', exact: true }).fill(marker);
    const results = page.getByRole('region', { name: 'Events' });
    await expect(results.getByRole('link', { name: title, exact: true })).toBeVisible();
    await page.getByText('More filters').click();
    await pick(page, 'Band playing', 'Glass Harbor', pages.band.id, 'Use this');
    await expect(results.getByRole('link', { name: title, exact: true })).toBeVisible();
    await page.getByLabel('Sort by', { exact: true }).selectOption('band');
    await expect(results.getByRole('status')).toHaveText('1 event on this page');
    await assertAccessible(page, 'filtered events');
    await reflows(page, 'events discovery at 320px');
    await results.getByRole('link', { name: title, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByText('Mark yourself as going or interested to read and join the discussion.')).toBeVisible();

    await page.getByRole('button', { name: 'Going', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Going', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1 going, 0 interested', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Show this event on my profile', exact: true })).toBeChecked();
    await page.getByRole('checkbox', { name: '1 day before', exact: true }).check();
    await page.getByRole('checkbox', { name: '1 hour before', exact: true }).check();
    await page.getByRole('button', { name: 'Save reminders', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Reminders saved.' })).toBeVisible();
    await expect(page.getByRole('link', { name: /Add to Google Calendar/ })).toHaveAttribute('href', /calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download calendar file (.ics)', exact: true }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.ics$/);
    const ics = await readFile(await download.path(), 'utf8');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toMatch(/DTSTART;TZID=Europe\/Rome:\d{8}T200000/);
    expect(ics).toContain('Doors\\, bar\\; and a synthetic lineup');

    await page.getByLabel(/^Your message/).fill('Anyone sharing a ride from the station?');
    await page.getByRole('button', { name: 'Post message', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Discussion' }).getByText('Anyone sharing a ride from the station?')).toBeVisible();
    await assertAccessible(page, 'event page as an attendee');

    await page.goto('/#my-events');
    await expect(page.getByRole('link', { name: 'Going or interested', exact: true })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('link', { name: title, exact: true })).toBeVisible();
    await assertAccessible(page, 'my events');
    await page.goto(`/#organization?id=${pages.band.id}`);
    const events = page.getByRole('region', { name: 'Events' });
    await expect(events.getByRole('heading', { name: 'Next events', exact: true })).toBeVisible();
    await expect(events.getByRole('link', { name: title, exact: true })).toBeVisible();
    await expect(events.getByText('Performing', { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('organizers send official updates and cancel; attendees see them on the page and in notifications', async ({ browser }) => {
  const organizer = await signIn(browser, people[0]);
  const fan = await signIn(browser, people[2]);
  try {
    const { rows: [event] } = await pool.query('SELECT id FROM events WHERE title = $1', [title]);
    await organizer.page.goto(`/#event?id=${event.id}`);
    await expect(organizer.page.getByRole('heading', { name: title, exact: true, level: 1 })).toBeVisible();
    await organizer.page.getByLabel('Type of update', { exact: true }).selectOption('door_open');
    await organizer.page.getByLabel(/^Message/).first().fill('Doors open at 19:00 at the river entrance.');
    await organizer.page.getByRole('button', { name: 'Send update', exact: true }).click();
    await expect(organizer.page.getByRole('status').filter({ hasText: 'Update sent to attendees.' })).toBeVisible();
    await organizer.page.getByRole('button', { name: 'Change status', exact: true }).click();
    const dialog = organizer.page.getByRole('dialog', { name: 'Change event status' });
    await dialog.getByLabel(/^New status/).selectOption('cancelled');
    await dialog.getByLabel(/^Message to attendees/).fill('Refunds go back to the original payment method within 14 days.');
    await assertAccessible(organizer.page, 'status dialog');
    await dialog.getByRole('button', { name: 'Update status', exact: true }).click();
    await expect(organizer.page.getByText('This event was cancelled. Check the official updates for refunds.')).toBeVisible();

    await fan.page.goto('/#notifications');
    await expect(fan.page.getByRole('link', { name: `Official update about ${title}`, exact: true })).toHaveCount(1);
    await expect(fan.page.getByRole('link', { name: `${title} was cancelled`, exact: true })).toHaveCount(1);
    await fan.page.goto(`/#event?id=${event.id}`);
    const updates = fan.page.getByRole('region', { name: 'Official updates' });
    await expect(updates.getByText('The organizers cancelled this event.')).toBeVisible();
    await expect(updates.getByText('Refunds go back to the original payment method within 14 days.')).toBeVisible();
    await expect(updates.getByText('Doors open at 19:00 at the river entrance.')).toBeVisible();
    await expect(fan.page.getByText('This event was cancelled, so replies are closed.')).toBeVisible();
    await assertAccessible(fan.page, 'cancelled event');
  } finally {
    await organizer.context.close();
    await fan.context.close();
  }
});

test('band leaders request page verification and administrators approve it', async ({ browser }) => {
  const leader = await signIn(browser, people[1]);
  const admin = await signIn(browser, people[3]);
  try {
    await leader.page.goto('/#notifications');
    await expect(leader.page.getByRole('link', { name: `You are on the lineup of ${title}`, exact: true })).toBeVisible();
    await leader.page.goto(`/#organization?id=${pages.band.id}`);
    const section = leader.page.getByRole('region', { name: 'Page verification' });
    await expect(section.getByText(/^Verification code: EM-/)).toBeVisible();
    await section.getByLabel(/^How can we confirm this page\?/).fill('Our official website glassharbor.example.test lists this page.');
    await assertAccessible(leader.page, 'page verification request');
    await section.getByRole('button', { name: 'Request verification', exact: true }).click();
    await expect(section.getByText(/is waiting for review/)).toBeVisible();

    await admin.page.goto('/#admin');
    const queue = admin.page.getByRole('region', { name: 'Verification requests' });
    const card = queue.getByRole('listitem').filter({ hasText: pages.band.name });
    await expect(card.getByText('Our official website glassharbor.example.test lists this page.')).toBeVisible();
    await card.getByLabel(/^Decision note/).fill('Matches the official website.');
    await card.getByRole('button', { name: 'Approve and add blue tick', exact: true }).click();
    await expect(queue.getByText(`Request from ${pages.band.name} approved.`)).toBeVisible();

    await leader.page.reload();
    await expect(leader.page.getByRole('heading', { name: pages.band.name, level: 1 })).toBeVisible();
    await expect(leader.page.getByText('Verified', { exact: true }).first()).toBeVisible();
    await expect(leader.page.getByRole('region', { name: 'Page verification' })).toHaveCount(0);
  } finally {
    await leader.context.close();
    await admin.context.close();
  }
});
