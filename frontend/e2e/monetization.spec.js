import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { apiOrigin } from './origins.js';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';
import { signedStripeEvent } from '../../backend/integration/synthetic-stripe.js';
import config from '../playwright.config.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const environment = config.webServer[0].env;
const marker = `w7e2e${randomUUID().slice(0, 8)}`;
const people = [];
const cards = [];
let announcement;

// Sessions are minted with the browser API's synthetic signing key instead of
// the sign-in form, so this suite stays out of the shared per-IP login limit.
const cipher = new CipherEngine({ cipher: {
  primaryKey: environment.CIPHER_PRIMARY_KEY, refreshKey: environment.CIPHER_REFRESH_KEY,
  issuer: 'every.music', audience: 'every.music.clients', accessTokenMinutes: 30, refreshTokenDays: 1,
} });

test.beforeAll(async () => {
  for (const [index, artistName] of ['Demo Promoter Wren', 'Demo Sponsor Admin'].entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified, role) VALUES ($1, TRUE, $2) RETURNING id',
      [email, index === 1 ? 'admin' : 'member']);
    people.push({ id: rows[0].id, email, artistName });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, artistName, 'Synthetic City']);
  }
  const { rows } = await pool.query(`INSERT INTO announcements (user_id, title, description, city, expires_at)
    VALUES ($1, $2, $3, 'Synthetic City', NOW() + INTERVAL '20 days') RETURNING id, title`,
  [people[0].id, `Bassist wanted ${marker}`, `A fictional indie project looking for a bassist. Synthetic fixture ${marker}.`]);
  announcement = rows[0];
});

test.afterAll(async () => {
  await pool.query('DELETE FROM sponsored_cards WHERE id = ANY($1::uuid[]) OR title LIKE $2', [cards, `%${marker}%`]);
  await pool.query('DELETE FROM offer_broadcasts WHERE headline LIKE $1', [`%${marker}%`]);
  await pool.query('DELETE FROM admin_audit WHERE actor_id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.query('DELETE FROM billing_subscriptions WHERE user_id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.query('DELETE FROM billing_customers WHERE user_id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

async function login(page, person) {
  const refresh = cipher.createRefreshToken(person.id);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [person.id, refresh.tokenHash, refresh.expiresAt]);
  await page.addInitScript(() => {
    navigator.clipboard.writeText = async (text) => { window.copiedText = text; };
  });
  await page.goto('/#login');
  await page.evaluate((session) => {
    sessionStorage.setItem('everymusic.session.v1', JSON.stringify(session));
    history.replaceState(null, '', '#feed');
  }, {
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: cipher.createAccessToken(person.id, person.email), refreshToken: refresh.token },
  });
  await page.reload();
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

async function deliver(request, type, object) {
  const event = signedStripeEvent(environment.STRIPE_WEBHOOK_SECRET, type, object);
  const response = await request.post(`${apiOrigin}/realm/billing/webhook`, {
    data: event.payload, headers: { 'content-type': 'application/json', 'stripe-signature': event.signature },
  });
  expect(response.status(), await response.text()).toBe(200);
}

test('members subscribe, buy points, promote calls and profiles, and invite friends', async ({ page, request }) => {
  const member = people[0];
  await login(page, member);
  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Premium and points', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Premium and points', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your plan: Free', exact: true })).toBeVisible();
  await expect(page.getByText('€3.99 per month', { exact: true })).toBeVisible();
  const comparison = page.getByRole('table', { name: 'Plan comparison' });
  await expect(comparison.getByRole('row', { name: /Hide sponsored cards Not included Included Included/ })).toBeVisible();
  await assertAccessible(page, 'Store');
  await page.getByLabel('Color theme', { exact: true }).selectOption('dark');
  await assertAccessible(page, 'Dark store');
  await page.getByLabel('Color theme', { exact: true }).selectOption('light');

  await page.getByRole('button', { name: 'Subscribe to Premium', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'We are confirming your payment' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your plan: Free', exact: true })).toBeVisible();
  const { rows: [customer] } = await pool.query('SELECT customer_id FROM billing_customers WHERE user_id = $1', [member.id]);
  await deliver(request, 'customer.subscription.created', {
    id: `sub_${marker}`, object: 'subscription', customer: customer.customer_id, status: 'active', cancel_at_period_end: false,
    metadata: { userId: member.id, plan: 'premium' },
    items: { data: [{ price: { id: environment.STRIPE_PREMIUM_PRICE_ID }, current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400 }] },
  });
  await expect(page.getByRole('heading', { name: 'Your plan: Premium', exact: true })).toBeVisible();
  await expect(page.getByText(/^Renews on /)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Manage billing', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Buy 500 points for €4.99', exact: true }).click();
  // The store already shows the earlier checkout's success message, so wait
  // for the address of this checkout's synthetic return instead.
  await expect.poll(async () => (await pool.query(
    `SELECT id FROM billing_checkout_sessions WHERE user_id = $1 AND product = 'points'`, [member.id])).rows[0]?.id).toBeTruthy();
  const { rows: [checkout] } = await pool.query(`SELECT id FROM billing_checkout_sessions WHERE user_id = $1 AND product = 'points'`, [member.id]);
  await expect(page).toHaveURL(new RegExp(`session=${checkout.id}$`));
  await deliver(request, 'checkout.session.completed', {
    id: checkout.id, object: 'checkout.session', mode: 'payment', customer: customer.customer_id, payment_status: 'paid',
  });
  await expect(page.getByText('You have 500 points.', { exact: false })).toBeVisible();

  await page.goto('/#my-posts');
  await page.getByRole('button', { name: `Promote ${announcement.title}`, exact: true }).click();
  const dialog = page.getByRole('dialog', { name: `Promote "${announcement.title}"` });
  await expect(dialog.getByText('Cost: 60 points', { exact: true })).toBeVisible();
  await dialog.getByLabel('Pin: top of the feed in one area', { exact: true }).check();
  await dialog.getByLabel('Area radius', { exact: true }).selectOption('25');
  await expect(dialog.getByText('Cost: 110 points', { exact: true })).toBeVisible();
  await dialog.getByLabel('Boost: higher in the feed everywhere', { exact: true }).check();
  await dialog.getByLabel('Duration', { exact: true }).selectOption('3');
  await expect(dialog.getByText('Cost: 180 points', { exact: true })).toBeVisible();
  await assertAccessible(page, 'Promote dialog');
  await dialog.getByRole('button', { name: 'Spend 180 points', exact: true }).click();
  await expect(dialog.getByRole('status')).toContainText('Done. 180 points spent.');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/#profile');
  await page.getByRole('button', { name: 'Boost my profile', exact: true }).click();
  const boost = page.getByRole('dialog', { name: 'Boost your profile' });
  await boost.getByRole('button', { name: 'Spend 60 points', exact: true }).click();
  await expect(boost.getByRole('status')).toContainText('Done. 60 points spent.');
  await boost.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto(`/#feed?searchTerm=${marker}`);
  const result = page.getByRole('article').filter({ hasText: announcement.title });
  await expect(result.getByText('Promoted', { exact: true })).toBeVisible();
  await page.goto(`/#musicians?searchTerm=${encodeURIComponent(member.artistName)}`);
  await expect(page.getByRole('article').filter({ hasText: member.artistName }).getByText('Promoted', { exact: true })).toBeVisible();

  await page.goto('/#wallet');
  await expect(page.getByRole('heading', { name: 'Points wallet', exact: true })).toBeVisible();
  await expect(page.getByText('260 points', { exact: true })).toBeVisible();
  const history = page.getByRole('table', { name: 'Points history, newest first' });
  await expect(history.getByRole('row', { name: /Points pack \+500 500/ })).toBeVisible();
  await expect(history.getByRole('row', { name: /Call boost −180 320/ })).toBeVisible();
  await assertAccessible(page, 'Wallet');

  await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Invite friends', exact: true }).click();
  const link = page.getByRole('textbox', { name: 'Your invite link' });
  await expect(link).toHaveValue(/#register\?invite=[A-Z2-9]{10}$/);
  await page.getByRole('button', { name: 'Copy link', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Invite link copied.' })).toBeVisible();
  expect(await page.evaluate(() => window.copiedText)).toBe(await link.inputValue());
  await expect(page.getByText('Your account already used an invite code.').or(page.getByLabel(/^Invite code/))).toBeVisible();
  await assertAccessible(page, 'Invite');
  await page.setViewportSize({ width: 320, height: 800 });
  for (const route of ['#invite', '#wallet', '#store']) {
    await page.goto(`/${route}`);
    await expect(page.locator('.spinner')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${route} reflows at 320px`).toBe(true);
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('/#invite');
  const code = (await link.inputValue()).split('invite=')[1];
  const guest = await page.context().browser().newPage();
  await guest.goto(`/#register?invite=${code}`);
  await expect(guest.getByText('A friend invited you. You both earn points once you verify your email.')).toBeVisible();
  await guest.close();
});

test('administrators run sponsored cards, rewarded videos, offers and grants; members watch and hide them', async ({ browser }) => {
  const [adminContext, memberContext] = await Promise.all([browser.newContext(), browser.newContext()]);
  const [admin, member] = await Promise.all([adminContext.newPage(), memberContext.newPage()]);
  try {
    admin.on('dialog', dialog => dialog.accept());
    await login(admin, people[1]);
    await admin.goto('/#admin');
    const panel = admin.getByRole('region', { name: 'Monetization' });
    await expect(panel.getByText('Stripe connected', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Sponsored cards', exact: true }).click();
    await panel.getByRole('button', { name: 'New sponsored card', exact: true }).click();
    const form = panel.getByRole('form', { name: 'New sponsored card' });
    await form.getByLabel(/^Sponsor name/).fill('Synthetic Strings Co');
    await form.getByLabel(/^Title/).fill(`Fresh strings ${marker}`);
    await form.getByLabel(/^Text/).fill('Fictional strings for synthetic browser tests.');
    await form.getByLabel(/^Link \(https\)/).fill('https://example.test/strings');
    await form.getByLabel(/^Or upload a video file/).setInputFiles({
      name: 'strings.mp4', mimeType: 'video/mp4', buffer: Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypisom'), randomBytes(512)]),
    });
    await form.getByLabel(/^Priority/).fill('100');
    await assertAccessible(admin, 'Sponsored card editor');
    await form.getByRole('button', { name: 'Save sponsored card', exact: true }).click();
    await expect(panel.getByRole('status').filter({ hasText: 'Sponsored card saved.' })).toBeVisible();
    const row = panel.getByRole('row', { name: new RegExp(`Fresh strings ${marker}`) });
    await expect(row.getByRole('cell', { name: 'Live', exact: true })).toBeVisible();
    cards.push(...(await pool.query('SELECT id FROM sponsored_cards WHERE title = $1', [`Fresh strings ${marker}`])).rows.map(item => item.id));

    await panel.getByRole('button', { name: 'Points grants', exact: true }).click();
    await panel.getByLabel(/^Member email address/).fill(people[0].email);
    await panel.getByLabel(/^Points/).fill('40');
    await panel.getByLabel(/^Event or reason/).fill('Synthetic jam night');
    await panel.getByRole('button', { name: 'Grant points', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText('40 points granted. New balance: 300.');

    await panel.getByRole('button', { name: 'Offers', exact: true }).click();
    await panel.getByLabel(/^Headline/).fill(`Strings week ${marker}`);
    await panel.getByLabel(/^Message/).fill('Synthetic strings are half price this week.');
    await panel.getByLabel(/^In-app link/).fill('#wallet');
    await panel.getByRole('button', { name: 'Send offer', exact: true }).click();
    await expect(panel.getByRole('status')).toContainText(/Offer sent to \d+ members?\./);
    await assertAccessible(admin, 'Monetization console');

    await login(member, people[0]);
    await member.goto('/#notifications');
    await expect(member.getByText(`Strings week ${marker}: Synthetic strings are half price this week.`)).toBeVisible();
    await member.goto(`/#feed?searchTerm=${marker}`);
    const sponsored = member.getByRole('article', { name: `Sponsored: Fresh strings ${marker}` });
    await expect(sponsored.getByText('Sponsored', { exact: true })).toBeVisible();
    await expect(sponsored.getByRole('link', { name: /Learn more/ })).toHaveAttribute('rel', 'sponsored noopener noreferrer');
    for (const theme of ['dark', 'light']) {
      await member.getByLabel('Color theme', { exact: true }).selectOption(theme);
      await assertAccessible(member, `${theme} feed with a sponsored card`);
    }
    await sponsored.getByRole('link', { name: 'Watch and earn 10 points', exact: true }).click();
    const player = member.getByRole('dialog', { name: 'Watch and earn' });
    await expect(player.getByText('Finish watching the video to claim your points.')).toBeVisible();
    await expect(player.getByRole('button', { name: 'Claim 10 points', exact: true })).toBeDisabled();
    await player.locator('video').evaluate(video => video.dispatchEvent(new Event('ended')));
    await assertAccessible(member, 'Rewarded video dialog');
    await expect(player.getByRole('button', { name: 'Claim 10 points', exact: true })).toBeEnabled({ timeout: 10000 });
    await player.getByRole('button', { name: 'Claim 10 points', exact: true }).click();
    await expect(player.getByRole('status')).toContainText('You earned 10 points. Your balance is 310 points.');
    await player.getByRole('button', { name: 'Close watch and earn', exact: true }).click();
    await expect(member.getByText('Today: 1 of 10 rewarded videos.')).toBeVisible();

    await member.goto('/#settings');
    await member.getByLabel('Hide sponsored cards in the feed and musician search', { exact: true }).check();
    await expect(member.getByRole('status').filter({ hasText: 'Sponsored card preference saved.' })).toBeVisible();
    await member.goto(`/#feed?searchTerm=${marker}`);
    await expect(member.getByRole('article').filter({ hasText: `Bassist wanted ${marker}` })).toBeVisible();
    await expect(member.getByRole('article', { name: `Sponsored: Fresh strings ${marker}` })).toHaveCount(0);
  } finally {
    await Promise.all([adminContext.close(), memberContext.close()]);
  }
});
