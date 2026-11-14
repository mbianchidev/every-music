import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const bcrypt = requireBackend('bcryptjs');
const sharp = requireBackend('sharp');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `browser-${randomUUID().slice(0, 8)}`;
const password = 'Synthetic1Password';
const people = [];
let instrument;
let genre;
let image;
let announcementId;
let conversationId;

test.beforeAll(async () => {
  const hash = bcrypt.hashSync(password, 4);
  for (let i = 0; i < 5; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, TRUE) RETURNING id', [email, hash],
    );
    const artistName = `${marker} musician ${i}`;
    people.push({ id: rows[0].id, email, artistName });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, artistName, 'Synthetic City']);
  }
  for (let i = 0; i < 15; i += 1) {
    const { rows } = await pool.query('INSERT INTO announcements (user_id, title, description, city) VALUES ($1, $2, $3, $4) RETURNING id', [
      people[0].id, `${marker} call ${String(i).padStart(2, '0')}`,
      'Synthetic open call for a local collaboration. No real account data is used.', 'Synthetic City',
    ]);
    if (i === 0) announcementId = rows[0].id;
  }
  instrument = (await pool.query('SELECT id, name FROM instruments ORDER BY name LIMIT 1')).rows[0];
  genre = (await pool.query('SELECT id, name FROM genres ORDER BY name LIMIT 1')).rows[0];
  const profile = (await pool.query('SELECT id FROM profiles WHERE user_id = $1', [people[4].id])).rows[0];
  await pool.query("INSERT INTO user_instruments (profile_id, instrument_id, skill_level, years_experience) VALUES ($1, $2, 'advanced', 4)", [profile.id, instrument.id]);
  await pool.query('INSERT INTO user_genres (profile_id, genre_id) VALUES ($1, $2)', [profile.id, genre.id]);
  await pool.query('INSERT INTO projects (profile_id, name, collaborators) VALUES ($1, $2, $3)', [
    profile.id, 'Synthetic accessible portfolio', JSON.stringify([{ userId: people[1].id, role: 'Drums' }]),
  ]);
  const pair = [people[1].id, people[4].id].sort();
  conversationId = (await pool.query('INSERT INTO conversations (first_user_id, second_user_id) VALUES ($1, $2) RETURNING id', pair)).rows[0].id;
  await pool.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [conversationId, ...pair]);
  await pool.query('INSERT INTO messages (conversation_id, sender_id, client_id, body) VALUES ($1, $2, $3, $4)', [
    conversationId, people[1].id, randomUUID(), 'Synthetic accessibility conversation.',
  ]);
  await pool.query('INSERT INTO announcement_comments (announcement_id, user_id, body) VALUES ($1, $2, $3)', [
    announcementId, people[1].id, 'Synthetic accessibility comment.',
  ]);
  image = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#ff4f8b' } }).png().toBuffer();
});

test.afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

async function login(page, person) {
  await page.goto('/#login');
  await page.getByLabel(/^Email\b/).fill(person.email);
  await page.getByLabel(/^Password\b/).fill(password);
  await page.getByRole('button', { name: 'SIGN IN', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'THE FEED', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Live updates connected' })).toBeVisible();
}

async function optIn(page) {
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Opt in to privacy-friendly engagement analytics', { exact: true }).check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Preferences saved.' })).toBeVisible();
}

test('musicians complete profiles, collaborate, publish media, and engage through the real stack', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();
  a.on('dialog', dialog => dialog.accept());
  b.on('dialog', dialog => dialog.accept());
  try {
    await login(a, people[0]);
    await a.getByRole('link', { name: 'Profile', exact: true }).click();
    await a.getByRole('link', { name: 'Edit profile', exact: true }).click();
    await a.getByLabel('Bio', { exact: true }).fill('Synthetic artist looking for a remote collaboration.');
    await a.getByLabel('Profile image', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: image });
    await a.getByText('Instruments (0 selected)', { exact: true }).click();
    await a.getByLabel(instrument.name, { exact: true }).check();
    await a.getByLabel('Skill level', { exact: true }).selectOption('advanced');
    await a.getByLabel('Years of experience', { exact: true }).fill('4');
    await a.getByText('Genres (0 selected)', { exact: true }).click();
    await a.getByLabel(genre.name, { exact: true }).check();
    await a.getByRole('button', { name: 'SAVE PROFILE', exact: true }).click();
    await expect(a.getByText(`${instrument.name}: advanced, 4 years`, { exact: true })).toBeVisible();
    await a.reload();
    await expect(a.getByText(`${instrument.name}: advanced, 4 years`, { exact: true })).toBeVisible();
    await a.getByRole('link', { name: 'Edit profile', exact: true }).click();
    await a.getByLabel(/^Project name\b/).fill(`${marker} trio`);
    await a.getByLabel('Your role', { exact: true }).fill('Guitar');
    await a.getByLabel('Find a collaborator', { exact: true }).fill(people[1].artistName);
    await a.getByLabel('Matching musicians', { exact: true }).selectOption(people[1].id);
    await a.getByLabel(`${people[1].artistName} role`).fill('Drums');
    await a.getByRole('button', { name: 'Add project', exact: true }).click();
    await expect(a.getByRole('status').filter({ hasText: 'Project added.' })).toBeVisible();
    await optIn(a);

    await login(b, people[1]);
    await optIn(b);
    await b.getByRole('link', { name: 'Musicians', exact: true }).click();
    await b.getByRole('searchbox', { name: 'Search musicians', exact: true }).fill(people[0].artistName);
    await b.getByLabel('Instrument', { exact: true }).selectOption(instrument.id);
    await b.getByLabel('Genre', { exact: true }).selectOption(genre.id);
    await b.getByRole('link', { name: people[0].artistName, exact: true }).click();
    await expect(b.getByRole('heading', { name: `${marker} trio`, exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Follow musician', exact: true }).click();
    await expect(b.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Send message', exact: true }).click();
    await a.getByRole('link', { name: 'Messages', exact: true }).click();
    await a.getByRole('link', { name: new RegExp(people[1].artistName) }).first().click();
    await expect(a.getByLabel(/^Message(?:\s*\*)?$/)).toBeVisible();
    await b.getByLabel(/^Message(?:\s*\*)?$/).pressSequentially('Synthetic rehearsal invitation.');
    await b.keyboard.press('Tab');
    await expect(b.getByRole('button', { name: 'Send message', exact: true })).toBeFocused();
    await b.keyboard.press('Enter');
    await expect(a.getByRole('log').getByText('Synthetic rehearsal invitation.', { exact: true })).toBeVisible();
    await b.getByLabel(/^Message(?:\s*\*)?$/).fill('Keep this draft during live updates.');
    await b.evaluate(() => {
      window.syntheticVisibility = 'hidden';
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => window.syntheticVisibility });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await a.getByLabel(/^Message(?:\s*\*)?$/).fill('Synthetic rehearsal accepted.');
    await a.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(b.getByRole('log').getByText('Synthetic rehearsal accepted.', { exact: true })).toBeVisible();
    await expect(b.getByRole('link', { name: new RegExp(`${people[0].artistName}.*1 unread`) })).toBeVisible();
    await b.evaluate(() => { window.syntheticVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await expect(b.getByRole('link', { name: new RegExp(`${people[0].artistName}.*\\bRead\\b`) })).toBeVisible();
    await expect(b.getByLabel(/^Message(?:\s*\*)?$/)).toHaveValue('Keep this draft during live updates.');
    await expect(b.getByLabel(/^Message(?:\s*\*)?$/)).toBeFocused();
    await a.reload();
    await expect(a.getByRole('log').getByText('Synthetic rehearsal invitation.', { exact: true })).toBeVisible();

    const title = `${marker} remote ensemble`;
    await a.getByRole('link', { name: 'Post', exact: true }).click();
    await a.getByLabel(/^Title\b/).fill(title);
    await a.getByLabel(/^Description\b/).fill('A synthetic remote ensemble seeking an experienced musician for a new project.');
    await a.getByLabel('Announcement image', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: image });
    await a.getByLabel('Remote collaboration is welcome', { exact: true }).check();
    await a.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(a.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await b.getByRole('link', { name: /^Notifications/ }).click();
    await b.getByRole('link', { name: 'A musician you follow published an announcement', exact: true }).click();
    await expect(b.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect.poll(() => b.getByAltText(`Announcement image: ${title}`).evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await b.getByLabel(/^Add a comment\b/).fill('Synthetic comment: I am interested.');
    await b.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(b.getByText('Synthetic comment: I am interested.', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Like', exact: true }).click();
    await expect(b.getByRole('button', { name: 'Like', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await b.getByRole('button', { name: `Save ${title}`, exact: true }).click();
    await b.reload();
    await expect(b.getByText('Synthetic comment: I am interested.', { exact: true })).toBeVisible();
    await expect(b.getByRole('button', { name: `Save ${title}`, exact: true })).toBeDisabled();
    await b.getByRole('link', { name: 'Saved', exact: true }).click();
    await expect(b.getByRole('link', { name: title, exact: true })).toBeVisible();

    await a.getByRole('link', { name: 'My ads', exact: true }).click();
    const ownCard = a.getByRole('article').filter({ has: a.getByRole('link', { name: title, exact: true }) });
    await ownCard.getByRole('link', { name: 'Edit', exact: true }).click();
    const updatedTitle = `${marker} remote ensemble updated`;
    await a.getByLabel(/^Title\b/).fill(updatedTitle);
    await a.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(b.getByRole('link', { name: updatedTitle, exact: true })).toBeVisible();
    const updatedId = new URLSearchParams(new URL(a.url()).hash.split('?')[1]).get('id');
    const accessToken = await a.evaluate(() => JSON.parse(sessionStorage.getItem('everymusic.session.v1')).keys.accessToken);
    const setPublished = async isPublished => {
      const response = await a.request.put(`http://127.0.0.1:55474/realm/announcements/${updatedId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }, data: { isPublished },
      });
      expect(response.ok()).toBe(true);
    };
    await setPublished(false);
    const postImage = a.getByAltText(`Announcement image: ${updatedTitle}`);
    await expect(postImage).toHaveAttribute('src', /^blob:/);
    await expect(b.getByRole('link', { name: updatedTitle, exact: true })).toHaveCount(0);
    await setPublished(true);
    await expect(postImage).not.toHaveAttribute('src', /^blob:/);
    await expect.poll(() => postImage.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    await expect(b.getByRole('link', { name: updatedTitle, exact: true })).toBeVisible();
    await a.getByRole('link', { name: 'Analytics', exact: true }).click();
    const reach = a.getByRole('table', { name: 'Reach of your latest 100 announcements (last 30 days)', exact: true });
    const cells = reach.getByRole('row').filter({ has: a.getByRole('link', { name: updatedTitle, exact: true }) }).getByRole('cell');
    await expect(cells.nth(1)).toHaveText('1');
    await expect(cells.nth(2)).toHaveText('1');
    expect(Number(await cells.nth(0).textContent())).toBeGreaterThanOrEqual(1);
  } finally {
    await first.close(); await second.close();
  }
});

test('search and pagination return distinct bounded pages and restore filters on reload', async ({ page }) => {
  await login(page, people[2]);
  await page.getByRole('searchbox', { name: 'Search announcements', exact: true }).fill(`${marker} call`);
  const results = page.getByRole('region', { name: 'Search results', exact: true });
  await expect(results.getByRole('article')).toHaveCount(12);
  const titles = () => results.getByRole('heading', { level: 2 }).getByRole('link').allTextContents();
  await expect(results.getByRole('heading', { level: 2 }).first()).toContainText(`${marker} call`);
  const first = await titles();
  await page.getByRole('navigation', { name: 'Results pages' }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(results.getByRole('article')).toHaveCount(3);
  const second = await titles();
  expect(first.filter(title => second.includes(title))).toEqual([]);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search announcements', exact: true })).toHaveValue(`${marker} call`);
  await expect(results.getByRole('article')).toHaveCount(3);
});

test('the installed shell and saved feed work offline without caching private APIs or losing edits', async ({ page, context }) => {
  await login(page, people[3]);
  await expect(page.getByRole('region', { name: 'Search results' }).getByRole('article').first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Offline saved copy from' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Search results' }).getByRole('article').first()).toBeVisible();
  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async key =>
    (await (await caches.open(key)).keys()).map(request => request.url)))).flat());
  expect(cached.some(url => url.includes('/realm/'))).toBe(false);
  await context.setOffline(false);
  await page.getByRole('link', { name: 'Profile', exact: true }).click();
  await page.getByRole('link', { name: 'Edit profile', exact: true }).click();
  await page.getByLabel('Bio', { exact: true }).fill('Synthetic offline edit retained until connectivity returns.');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'SAVE PROFILE', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to reach Every.music' })).toBeVisible();
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Synthetic offline edit retained until connectivity returns.');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'SAVE PROFILE', exact: true }).click();
  await expect(page).toHaveURL(/#profile$/);
  await expect(page.getByRole('heading', { name: 'PROFILE', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic offline edit retained until connectivity returns.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'PROFILE', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic offline edit retained until connectivity returns.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'WELCOME BACK', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('everymusic.offline-feed.v1'))).toBeNull();
});

test('themes persist and all principal screens support accessible names, keyboard focus, and narrow reflow', async ({ page }, testInfo) => {
  await login(page, people[4]);
  for (const theme of ['light', 'dark']) {
    await page.getByLabel('Color theme', { exact: true }).selectOption(theme);
    for (const hash of [
      '#feed', '#musicians', `#musician?id=${people[0].id}`, `#announcement?id=${announcementId}`,
      '#profile', '#edit-profile', '#create', `#messages?id=${conversationId}`,
      '#notifications', '#settings', '#analytics', '#login', '#register',
      '#forgot-password', '#reset-password?token=synthetic', '#verify-email?token=synthetic',
    ]) {
      await page.goto(`/${hash}`);
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.locator('.spinner')).toHaveCount(0);
      await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
      const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(report.violations.map(item => ({
        id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
      })), `${theme} ${hash}`).toEqual([]);
    }
  }
  await page.reload();
  await expect(page.getByLabel('Color theme', { exact: true })).toHaveValue('dark');
  await page.getByLabel('Color theme', { exact: true }).selectOption('system');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('Color theme', { exact: true }).selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByLabel('Color theme', { exact: true }).selectOption('dark');
  await page.goto('/#feed');
  await expect(page.getByRole('region', { name: 'Search results' }).getByRole('article').first()).toBeVisible();
  await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await page.setViewportSize({ width: 1280, height: 1200 });
  await expect.poll(() => page.locator('img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('desktop-feed.png') });
  await page.getByRole('link', { name: 'Skip to main content', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  expect(page.url()).not.toContain('#main-content');
  await page.setViewportSize({ width: 320, height: 720 });
  for (const hash of ['#feed', '#edit-profile', '#create', '#messages', '#settings']) {
    await page.goto(`/${hash}`);
    await expect(page.locator('.spinner')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.evaluate(() => new Promise(resolve => window.requestAnimationFrame(resolve)));
    if (hash === '#feed') {
      await expect(page.getByText('Filters and sorting', { exact: true })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('mobile-feed.png') });
    }
    const control = hash === '#feed' ? page.getByRole('searchbox', { name: 'Search announcements', exact: true })
      : hash === '#create' ? page.getByLabel('City', { exact: true })
      : hash === '#edit-profile' ? page.getByLabel('Bio', { exact: true })
      : hash === '#settings' ? page.getByRole('button', { name: 'Save preferences', exact: true })
      : page.getByRole('checkbox', { name: 'Show archived', exact: true });
    await expect(control).toBeVisible();
    await control.focus();
    await expect(control).toBeFocused();
    await expect.poll(() => control.evaluate(element => {
      const box = element.getBoundingClientRect();
      const nav = document.querySelector('.nav').getBoundingClientRect();
      return box.bottom <= nav.top || box.top >= nav.bottom || box.right <= nav.left || box.left >= nav.right;
    })).toBe(true);
  }
});
