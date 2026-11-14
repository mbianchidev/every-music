import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { apiOrigin } from './origins.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `w1-${randomUUID().slice(0, 8)}`;
const people = [];
let cipher;
let instrument;
let milan;
let monza;

test.describe.configure({ mode: 'serial' });

const DAY = 24 * 60 * 60 * 1000;
const localDate = offsetDays => {
  const date = new Date(Date.now() + offsetDays * DAY);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

test.beforeAll(async () => {
  // Sessions are minted with the browser fixture's synthetic keys so these
  // journeys do not consume the password sign-in rate limit.
  const { createRealmConfig } = await import('../../backend/config/realm.js');
  const { CipherEngine } = await import('../../backend/src/engines/cipher-engine.js');
  cipher = new CipherEngine(createRealmConfig({
    ...process.env,
    CIPHER_PRIMARY_KEY: 'synthetic-browser-primary-key-longer-than-thirty-two-characters',
    CIPHER_REFRESH_KEY: 'synthetic-browser-refresh-key-longer-than-thirty-two-characters',
  }));
  instrument = (await pool.query("SELECT id, name FROM instruments WHERE name = 'Drums'")).rows[0];
  milan = (await pool.query("SELECT id, name FROM places WHERE id = 3173435")).rows[0];
  monza = (await pool.query("SELECT id, name, latitude, longitude FROM places WHERE name = 'Monza' AND country_code = 'IT'")).rows[0];
  const names = ['Demo Lantern', 'Demo Tidewater', 'Demo Copperline', 'Demo Northgate'];
  for (const [index, artistName] of names.entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email]);
    people.push({ id: rows[0].id, email, artistName });
    await pool.query('INSERT INTO profiles (user_id, artist_name, bio) VALUES ($1, $2, $3)', [rows[0].id, artistName, `Synthetic ${marker} musician.`]);
  }
  await pool.query("INSERT INTO user_entitlements (user_id, plan, source) VALUES ($1, 'premium', 'admin')", [people[3].id]);
  await pool.query(`
    INSERT INTO announcements (user_id, title, description, expires_at)
    SELECT $1, $2 || ' seeded ' || n, 'A synthetic seeded announcement keeping the active quota busy.', NOW() + INTERVAL '10 days'
    FROM generate_series(1, 4) n`, [people[2].id, marker]);
});

test.afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

function session(person) {
  const refresh = cipher.createRefreshToken(person.id);
  return {
    refresh,
    value: { persona: { userId: person.id, email: person.email, emailVerified: true },
      keys: { accessToken: cipher.createAccessToken(person.id, person.email), refreshToken: refresh.token } },
  };
}

async function open(browser, person, options = {}) {
  const context = await browser.newContext(options);
  const { refresh, value } = session(person);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [person.id, refresh.tokenHash, refresh.expiresAt]);
  await context.addInitScript(stored => {
    if (!sessionStorage.getItem('everymusic.session.v1')) sessionStorage.setItem('everymusic.session.v1', stored);
  }, JSON.stringify(value));
  const page = await context.newPage();
  await page.goto('/#feed');
  await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
  return { context, page };
}

async function assertAccessible(page, label) {
  await expect(page.locator('.spinner')).toHaveCount(0);
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({
    id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), label).toEqual([]);
}

async function choosePlace(page, label, query, name) {
  const field = page.getByRole('combobox', { name: label, exact: true });
  await field.fill(query);
  await expect(page.getByRole('option', { name: new RegExp(`^${name} `) }).first()).toBeVisible();
  await field.press('ArrowDown');
  await field.press('Enter');
  await expect(field).toHaveValue(new RegExp(`^${name}, `));
}

test('profiles keep a place, gated contacts, plan-limited links and open-to status', async ({ browser }) => {
  const owner = await open(browser, people[0]);
  const viewer = await open(browser, people[1]);
  try {
    const a = owner.page;
    await a.goto('/#edit-profile');
    await a.getByLabel(/^Age\b/).fill('31');
    await choosePlace(a, 'City', 'Milano', milan.name);
    await a.getByRole('checkbox', { name: 'Open to new projects', exact: true }).check();
    await a.getByLabel(/^Who can see your contacts\b/).selectOption('members');
    await a.getByLabel(/^Telegram username\b/).fill('@synthetic_band');
    await a.getByLabel(/^Phone number\b/).fill('+39 02 555 0100');
    for (const [index, type] of ['spotify', 'youtube', 'bandcamp', 'instagram'].entries()) {
      await a.getByRole('button', { name: 'Add a link', exact: true }).click();
      await a.getByLabel(`Link ${index + 1} type`, { exact: true }).selectOption(type);
      await a.getByLabel(`Link ${index + 1} URL`, { exact: true }).fill(`https://example.test/${type}`);
    }
    await assertAccessible(a, 'profile editor');
    await a.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(a).toHaveURL(/#profile$/);
    await expect(a.getByText('Open to new projects', { exact: true })).toBeVisible();
    await expect(a.getByText('Age 31', { exact: true })).toBeVisible();
    await expect(a.getByText('Milan, Lombardy, Italy', { exact: true })).toBeVisible();
    await expect(a.getByRole('link', { name: '@synthetic_band', exact: true })).toHaveAttribute('href', 'https://t.me/synthetic_band');
    await expect(a.getByText(/Other musicians see your first 3 links/)).toBeVisible();
    await expect(a.getByRole('heading', { name: 'See who visited your profile', exact: true })).toBeVisible();
    await assertAccessible(a, 'own profile');

    const b = viewer.page;
    await b.goto(`/#musician?id=${people[0].id}`);
    await expect(b.getByRole('link', { name: '@synthetic_band', exact: true })).toBeVisible();
    await expect(b.getByRole('list').filter({ has: b.getByRole('link', { name: 'Spotify', exact: true }) }).getByRole('listitem')).toHaveCount(3);
    await expect(b.getByRole('link', { name: 'Instagram', exact: true })).toHaveCount(0);
    await b.getByRole('button', { name: 'Follow musician', exact: true }).click();
    await expect(b.getByText('1 follower', { exact: true })).toBeVisible();
    await assertAccessible(b, 'musician profile');
    await a.goto('/#notifications');
    await expect(a.getByRole('link', { name: 'You have a new follower', exact: true })).toBeVisible();

    await a.goto('/#edit-profile');
    await a.getByLabel(/^Who can see your contacts\b/).selectOption('hidden');
    await a.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(a).toHaveURL(/#profile$/);
    await b.reload();
    await expect(b.getByRole('heading', { name: 'Demo Lantern', exact: true })).toBeVisible();
    await expect(b.getByRole('link', { name: '@synthetic_band', exact: true })).toHaveCount(0);
  } finally {
    await owner.context.close(); await viewer.context.close();
  }
});

test('announcements take a place, a plan-limited expiry and respect the active cap', async ({ browser }) => {
  const { context, page } = await open(browser, people[2]);
  try {
    await page.goto('/#create');
    await expect(page.getByText('4 of 5 active announcements used.', { exact: true })).toBeVisible();
    await expect(page.getByLabel(/^Expiration date\b/)).toHaveValue(localDate(30));
    await expect(page.getByLabel(/^Expiration date\b/)).toHaveAttribute('max', localDate(30));
    await page.getByLabel(/^Title\b/).fill(`${marker} cover drummer in Monza`);
    await page.getByLabel(/^Description\b/).fill('A synthetic cover band looking for a drummer for weekend rehearsals and gigs.');
    await choosePlace(page, 'City', 'Monza', monza.name);
    await page.getByLabel('This is a cover band', { exact: true }).check();
    await page.getByText('Instruments (0 selected)', { exact: true }).click();
    await page.getByLabel(instrument.name, { exact: true }).check();
    await assertAccessible(page, 'announcement editor');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByRole('heading', { name: `${marker} cover drummer in Monza`, exact: true })).toBeVisible();
    await expect(page.getByText(/^Online until /)).toBeVisible();
    await expect(page.getByText('Only you can see these numbers', { exact: true })).toBeVisible();
    await expect(page.getByText('Views and saves are available with Premium.', { exact: true })).toBeVisible();

    await page.goto('/#create');
    await expect(page.getByText(/5 of 5 active announcements used\. Unpublish one/)).toBeVisible();
    await page.getByLabel(/^Title\b/).fill(`${marker} sixth call`);
    await page.getByLabel(/^Description\b/).fill('A synthetic sixth announcement that goes beyond the free plan cap.');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Your plan allows 5 active announcements at a time.' })).toBeVisible();
    await expect(page.getByLabel(/^Title\b/)).toHaveValue(`${marker} sixth call`);

    await page.goto('/#my-posts');
    await page.getByRole('button', { name: `Unpublish ${marker} seeded 1`, exact: true }).click();
    await expect(page.getByRole('button', { name: `Publish ${marker} seeded 1`, exact: true })).toBeVisible();
    await assertAccessible(page, 'my calls');
  } finally { await context.close(); }
});

test('discovery filters by distance, cover band, region and availability, and saved searches notify', async ({ browser, request }) => {
  const { context, page } = await open(browser, people[1]);
  try {
    await page.getByRole('searchbox', { name: 'Search announcements', exact: true }).fill(marker);
    await page.getByText('Filters and sorting', { exact: true }).click();
    await choosePlace(page, 'Near city', 'Milan', milan.name);
    await page.getByLabel(/^Distance\b/).selectOption('25');
    await page.getByLabel('Cover band', { exact: true }).selectOption('true');
    await page.getByLabel('Sort by', { exact: true }).selectOption('distance');
    const results = page.getByRole('region', { name: 'Search results', exact: true });
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(results.getByRole('article')).toHaveCount(1);
    await expect(results.getByRole('link', { name: `${marker} cover drummer in Monza`, exact: true })).toBeVisible();
    await expect(results.getByText(/km away$/)).toBeVisible();
    await expect(results.getByText(/\blikes?\b/i)).toHaveCount(0);
    await assertAccessible(page, 'feed with discovery filters');

    await page.getByRole('button', { name: 'Save this search', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Save this search', exact: true });
    await expect(dialog.getByLabel(/^Name\b/)).toHaveValue(new RegExp(`within 25 km of ${milan.name}`));
    await dialog.getByLabel(/^Name\b/).fill('Cover drummers near Milan');
    await assertAccessible(page, 'save search dialog');
    await dialog.getByRole('button', { name: 'Save search', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved "Cover drummers near Milan".' })).toBeVisible();
    await page.getByRole('button', { name: 'Save this search', exact: true }).click();
    await dialog.getByRole('button', { name: 'Save search', exact: true }).click();
    await expect(dialog.getByRole('alert')).toContainText('Your plan can keep 1 saved search.');
    await dialog.getByRole('button', { name: 'Close save this search', exact: true }).click();

    const token = cipher.createAccessToken(people[3].id, people[3].email);
    const published = await request.post(`${apiOrigin}/realm/announcements`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        title: `${marker} cover singer near Milan`, description: 'A synthetic cover band that matches the saved search filters.',
        placeId: milan.id, isCoverBand: true,
      },
    });
    expect(published.status()).toBe(201);
    await page.getByRole('link', { name: /^Notifications/ }).first().click();
    await page.getByRole('link', { name: 'A new announcement matches your saved search', exact: true }).click();
    await expect(page.getByRole('heading', { name: `${marker} cover singer near Milan`, exact: true })).toBeVisible();

    await page.goto('/#saved-searches');
    await expect(page.getByRole('heading', { name: 'Cover drummers near Milan', exact: true })).toBeVisible();
    await expect(page.getByText('1 of 1 saved search used. Delete one to save another.', { exact: true })).toBeVisible();
    await page.getByRole('checkbox', { name: 'Notify me about new matches', exact: true }).uncheck();
    await expect(page.getByRole('status').filter({ hasText: 'Notifications are off' })).toBeVisible();
    await assertAccessible(page, 'saved searches');
    await page.getByRole('link', { name: 'Open Cover drummers near Milan in the feed', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Search results', exact: true }).getByRole('article')).toHaveCount(2);

    await page.goto('/#musicians');
    await page.getByText('Filters and sorting', { exact: true }).click();
    await page.getByLabel('Availability', { exact: true }).selectOption('true');
    await page.getByLabel('Country', { exact: true }).selectOption('IT');
    await page.getByLabel('Region', { exact: true }).selectOption('09');
    await page.getByRole('searchbox', { name: 'Search musicians', exact: true }).fill('Demo Lantern');
    const musicians = page.getByRole('region', { name: 'Search results', exact: true });
    await expect(musicians.getByRole('article')).toHaveCount(1);
    await expect(musicians.getByText('Open to new projects', { exact: true })).toBeVisible();
  } finally { await context.close(); }
});

test('reactions stay private, blocks hide content, reports add categories and premium unlocks stats and visits', async ({ browser }) => {
  const viewer = await open(browser, people[1]);
  const author = await open(browser, people[2]);
  const premium = await open(browser, people[3]);
  try {
    const b = viewer.page;
    const post = (await pool.query('SELECT id FROM announcements WHERE title = $1', [`${marker} cover drummer in Monza`])).rows[0];
    await b.goto(`/#announcement?id=${post.id}`);
    await b.getByRole('button', { name: 'Like', exact: true }).click();
    await expect(b.getByRole('button', { name: 'Like', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(b.getByText('Only you can see these numbers', { exact: true })).toHaveCount(0);
    await author.page.goto(`/#announcement?id=${post.id}`);
    const stats = author.page.getByRole('region', { name: 'Announcement statistics', exact: true });
    await expect(stats.getByRole('definition').first()).toHaveText('1');

    await b.goto('/#analytics');
    await expect(b.getByRole('heading', { name: 'Announcement statistics are a Premium feature', exact: true })).toBeVisible();
    await assertAccessible(b, 'analytics upgrade');
    await premium.page.goto('/#analytics');
    await expect(premium.page.getByRole('table', { name: 'Reach of your latest 100 announcements (last 30 days)', exact: true })).toBeVisible();

    await b.goto('/#settings');
    await b.getByRole('checkbox', { name: 'Show me to musicians whose profiles I visit', exact: true }).check();
    await expect(b.getByRole('status').filter({ hasText: 'Musicians can now see when you visit their profile.' })).toBeVisible();
    await assertAccessible(b, 'settings');
    await b.goto(`/#musician?id=${people[3].id}`);
    await expect(b.getByRole('heading', { name: 'Demo Northgate', exact: true })).toBeVisible();
    await premium.page.goto('/#profile');
    await expect(premium.page.getByRole('region', { name: 'Who visited your profile', exact: true }).getByRole('link', { name: 'Demo Tidewater', exact: true })).toBeVisible();
    await assertAccessible(premium.page, 'profile visits');

    await b.goto(`/#musician?id=${people[2].id}`);
    await b.getByRole('button', { name: 'Report musician', exact: true }).click();
    const report = b.getByRole('dialog', { name: 'Report musician', exact: true });
    await report.getByLabel(/^Reason\b/).selectOption({ label: 'Fake profile using other people\'s photos' });
    await report.getByLabel(/^Describe the concern\b/).fill('Synthetic concern about borrowed photos.');
    await report.getByRole('checkbox', { name: 'I agree to share these report details with administrators', exact: true }).check();
    await report.getByRole('button', { name: 'Submit report', exact: true }).click();
    await expect(b.getByRole('status').filter({ hasText: 'Report submitted.' })).toBeVisible();
    expect((await pool.query('SELECT category FROM user_reports WHERE reporter_id = $1', [people[1].id])).rows[0].category).toBe('fake_profile');

    b.once('dialog', dialog => dialog.accept());
    await b.getByRole('button', { name: 'Block musician', exact: true }).click();
    await expect(b.getByText('You blocked this musician. They cannot find you or see your announcements.', { exact: true })).toBeVisible();
    await b.goto(`/#feed?searchTerm=${marker}`);
    const results = b.getByRole('region', { name: 'Search results', exact: true });
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(results.getByRole('link', { name: `${marker} cover drummer in Monza`, exact: true })).toHaveCount(0);
    await author.page.goto(`/#musician?id=${people[1].id}`);
    await expect(author.page.getByRole('heading', { name: 'Could not load this page', exact: true })).toBeVisible();
    await b.goto('/#settings');
    await b.getByRole('button', { name: 'Unblock Demo Copperline', exact: true }).click();
    await expect(b.getByRole('status').filter({ hasText: 'You unblocked Demo Copperline.' })).toBeVisible();
    await expect(b.getByText('You have not blocked anyone.', { exact: true })).toBeVisible();
  } finally {
    await viewer.context.close(); await author.context.close(); await premium.context.close();
  }
});

test('near me uses browser geolocation only after opting in and works at 320px', async ({ browser }) => {
  const { context, page } = await open(browser, people[1], {
    permissions: ['geolocation'], geolocation: { latitude: Number(monza.latitude), longitude: Number(monza.longitude) },
  });
  try {
    await page.goto('/#feed');
    await page.getByText('Filters and sorting', { exact: true }).click();
    await expect(page.getByRole('button', { name: 'Use my location', exact: true })).toHaveCount(0);
    await page.goto('/#settings');
    await page.getByRole('checkbox', { name: 'Use my location for nearby searches', exact: true }).check();
    await page.goto(`/#feed?searchTerm=${marker}`);
    await page.getByText('Filters and sorting', { exact: true }).click();
    await page.getByRole('button', { name: 'Use my location', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Showing results near your approximate location.' })).toBeVisible();
    await page.getByLabel(/^Distance\b/).selectOption('10');
    const results = page.getByRole('region', { name: 'Search results', exact: true });
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(results.getByRole('link', { name: `${marker} cover drummer in Monza`, exact: true })).toBeVisible();
    await expect(results.getByRole('link', { name: `${marker} cover singer near Milan`, exact: true })).toHaveCount(0);
    expect(page.url()).not.toContain('latitude');
    await page.setViewportSize({ width: 320, height: 720 });
    for (const hash of ['#feed', '#saved-searches', '#edit-profile', '#settings']) {
      await page.goto(`/${hash}`);
      await expect(page.locator('.spinner')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), hash).toBe(true);
    }
  } finally { await context.close(); }
});
