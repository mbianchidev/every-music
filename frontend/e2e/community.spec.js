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
const demoArtists = ['Demo Northline', 'Demo Harbor Studio', 'Demo Riverglass', 'Demo Moss Circuit', 'Demo Daybreak'];
const demoCalls = [
  ['Guitarist for a new indie project', 'Electric Guitar', 'Rock'],
  ['A rhythm section for late-night jazz', 'Bass Guitar', 'Jazz'],
  ['Vocals for an electronic EP', 'Vocals', 'Electronic'],
  ['Piano player for a Sunday session', 'Piano', 'Jazz'],
  ['Acoustic duo, open to new ideas', 'Acoustic Guitar', 'Folk'],
  ['Drummer for a live rock set', 'Drums', 'Rock'],
  ['Remote guitar parts for original songs', 'Electric Guitar', 'Rock'],
  ['Bass player for a small jazz group', 'Bass Guitar', 'Jazz'],
  ['A voice for our next demo', 'Vocals', 'Folk'],
  ['Keys and synths for a new EP', 'Piano', 'Electronic'],
  ['Folk songs and a second guitar', 'Acoustic Guitar', 'Folk'],
  ['Drummer wanted for weekly rehearsals', 'Drums', 'Rock'],
  ['Guitarist for a weekend jam', 'Electric Guitar', 'Rock'],
  ['Bass lines for a remote recording', 'Bass Guitar', 'Electronic'],
  ['Start something new, bring your voice', 'Vocals', 'Folk'],
];
let instrument;
let genre;
let image;
let announcementId;
let conversationId;

async function syntheticGoogle(context) {
  const email = `${marker}-google@example.test`;
  await context.route('https://accounts.google.com/gsi/client', route => route.fulfill({
    contentType: 'application/javascript',
    body: `let options;
      window.google = { accounts: { id: {
        initialize(value) { options = value; },
        renderButton(container) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn btn-secondary';
          button.textContent = 'Continue with Google';
          button.onclick = () => {
            const email = window.syntheticGoogleEmail || ${JSON.stringify(email)};
            return options.callback({ credential: JSON.stringify({
              provider: 'synthetic-browser-google', nonce: options.nonce,
              email, googleId: 'synthetic-' + email
            }) });
          };
          container.appendChild(button);
        }
      } } };`,
  }));
}

test.beforeEach(async ({ context }) => syntheticGoogle(context));

test.beforeAll(async () => {
  const hash = bcrypt.hashSync(password, 4);
  const instruments = (await pool.query('SELECT id, name FROM instruments')).rows;
  const genres = (await pool.query('SELECT id, name FROM genres')).rows;
  instrument = instruments.find(item => item.name === 'Acoustic Guitar');
  genre = genres.find(item => item.name === 'Rock');
  for (let i = 0; i < 5; i += 1) {
    const email = `${marker}-${i}@example.test`;
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash, email_verified) VALUES ($1, $2, TRUE) RETURNING id', [email, hash],
    );
    const artistName = demoArtists[i];
    people.push({ id: rows[0].id, email, artistName });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city, bio) VALUES ($1, $2, $3, $4)', [
      rows[0].id, artistName, 'Synthetic City', 'A fictional demo musician. Original songs, shared ideas, and room for a new collaboration.',
    ]);
  }
  for (let i = 0; i < 15; i += 1) {
    const [title, instrumentName, genreName] = demoCalls[i];
    const { rows } = await pool.query("INSERT INTO announcements (user_id, title, description, city, is_remote, created_at) VALUES ($1, $2, $3, $4, $5, NOW() - $6 * INTERVAL '1 day') RETURNING id", [
      people[i % 4].id, title,
      `Original music, a friendly rehearsal, and room for your own ideas. Let us find a sound that works together. Synthetic fixture: ${marker} call ${String(i).padStart(2, '0')}.`,
      'Synthetic City', [2, 6, 8, 9, 13].includes(i), (14 - i) * 3,
    ]);
    await pool.query('INSERT INTO announcement_instruments (announcement_id, instrument_id) VALUES ($1, $2)', [rows[0].id, instruments.find(item => item.name === instrumentName).id]);
    await pool.query('INSERT INTO announcement_genres (announcement_id, genre_id) VALUES ($1, $2)', [rows[0].id, genres.find(item => item.name === genreName).id]);
    if (i === 0) announcementId = rows[0].id;
  }
  const profile = (await pool.query('SELECT id FROM profiles WHERE user_id = $1', [people[4].id])).rows[0];
  await pool.query("INSERT INTO user_instruments (profile_id, instrument_id, skill_level, years_experience) VALUES ($1, $2, 'advanced', 4)", [profile.id, instrument.id]);
  await pool.query('INSERT INTO user_genres (profile_id, genre_id) VALUES ($1, $2)', [profile.id, genre.id]);
  await pool.query('INSERT INTO projects (profile_id, name, collaborators) VALUES ($1, $2, $3)', [
    profile.id, 'Synthetic accessible portfolio', JSON.stringify([{ userId: people[1].id, role: 'Drums' }]),
  ]);
  const pair = [people[1].id, people[4].id].sort();
  conversationId = (await pool.query('INSERT INTO conversations (first_user_id, second_user_id) VALUES ($1, $2) RETURNING id', pair)).rows[0].id;
  await pool.query('INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2), ($1, $3)', [conversationId, ...pair]);
  await pool.query(`INSERT INTO messages (conversation_id, sender_id, client_id, body, created_at)
    SELECT $1, $2, uuid_generate_v4(), 'Synthetic accessibility conversation ' || n,
      NOW() - (31 - n) * INTERVAL '1 second' FROM generate_series(1, 31) n`, [
    conversationId, people[1].id,
  ]);
  await pool.query('INSERT INTO announcement_comments (announcement_id, user_id, body) VALUES ($1, $2, $3)', [
    announcementId, people[1].id, 'Synthetic accessibility comment.',
  ]);
  image = await sharp({ create: { width: 80, height: 60, channels: 3, background: '#9381bf' } }).png().toBuffer();
});

test.afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

async function login(page, person) {
  await page.goto('/#login');
  await page.getByLabel(/^Email\b/).fill(person.email);
  await page.getByLabel(/^Password\b/).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
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
  await Promise.all([syntheticGoogle(first), syntheticGoogle(second)]);
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
    await a.getByRole('button', { name: 'Save profile', exact: true }).click();
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
    await a.getByRole('button', { name: `Edit ${marker} trio`, exact: true }).click();
    await a.getByLabel('Years active', { exact: true }).fill('2024-present');
    await a.getByLabel('Project description', { exact: true }).fill('A fictional trio working on original songs.');
    await a.getByText('Music and website links', { exact: true }).click();
    await a.getByLabel('Website', { exact: true }).fill('https://example.test/our-music');
    await a.getByRole('button', { name: 'Save project changes', exact: true }).click();
    await expect(a.getByRole('status').filter({ hasText: 'Project updated.' })).toBeVisible();
    await a.reload();
    await expect(a.getByRole('heading', { name: `${marker} trio`, exact: true })).toBeVisible();
    await optIn(a);

    await login(b, people[1]);
    await optIn(b);
    await b.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Musicians', exact: true }).click();
    await b.getByRole('searchbox', { name: 'Search musicians', exact: true }).fill(people[0].artistName);
    await b.getByText('Filters and sorting', { exact: true }).click();
    await b.getByLabel('Instrument', { exact: true }).selectOption(instrument.id);
    await b.getByLabel('Genre', { exact: true }).selectOption(genre.id);
    await expect(b.getByRole('region', { name: 'Search results' })).toHaveAttribute('aria-busy', 'false');
    await expect(b.getByRole('region', { name: 'Search results' }).getByRole('article')).toHaveCount(1);
    await b.getByRole('link', { name: people[0].artistName, exact: true }).click();
    await expect(b.getByRole('heading', { name: `${marker} trio`, exact: true })).toBeVisible();
    await expect(b.getByText('A fictional trio working on original songs.', { exact: true })).toBeVisible();
    await expect(b.getByRole('list', { name: 'Collaborators', exact: true }).getByRole('listitem')).toHaveText(`${people[1].artistName}: Drums`);
    await expect(b.getByRole('link', { name: 'Website', exact: true })).toHaveAttribute('href', 'https://example.test/our-music');
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
    await b.getByRole('button', { name: 'Block musician', exact: true }).click();
    await expect(b.getByLabel(/^Message(?:\s*\*)?$/)).toBeDisabled();
    await a.getByLabel(/^Message(?:\s*\*)?$/).fill('Synthetic blocked draft survives until retry.');
    await a.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(a.getByRole('alert').filter({ hasText: 'Messaging is unavailable for this musician' })).toBeVisible();
    await expect(a.getByLabel(/^Message(?:\s*\*)?$/)).toHaveValue('Synthetic blocked draft survives until retry.');
    await b.getByRole('button', { name: 'Unblock musician', exact: true }).click();
    await expect(b.getByLabel(/^Message(?:\s*\*)?$/)).toBeEnabled();
    await a.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(b.getByRole('log').getByText('Synthetic blocked draft survives until retry.', { exact: true })).toBeVisible();
    await a.getByRole('article').filter({ has: a.getByText('Synthetic blocked draft survives until retry.', { exact: true }) }).getByRole('button', { name: 'Remove message', exact: true }).click();
    await expect(b.getByRole('log').getByText('Message removed', { exact: true })).toBeVisible();
    await b.getByRole('button', { name: 'Archive conversation', exact: true }).click();
    await b.getByRole('checkbox', { name: 'Show archived', exact: true }).check();
    await b.getByRole('button', { name: `Restore conversation with ${people[0].artistName}`, exact: true }).click();
    await expect(b.getByRole('heading', { name: 'Conversations', exact: true })).toBeFocused();
    await b.getByRole('checkbox', { name: 'Show archived', exact: true }).uncheck();
    await b.getByRole('link', { name: new RegExp(people[0].artistName) }).click();
    await expect(b.getByRole('log').getByText('Message removed', { exact: true })).toBeVisible();
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

    const title = 'A guitarist for a remote ensemble';
    await a.getByRole('link', { name: 'Post', exact: true }).click();
    await a.getByLabel(/^Title\b/).fill(title);
    await a.getByLabel(/^Description\b/).fill('Original songs, a shared recording project, and room to make it your own. Collaborate remotely with a friendly acoustic ensemble.');
    await a.getByLabel('Announcement image', { exact: true }).setInputFiles({ name: 'synthetic.png', mimeType: 'image/png', buffer: image });
    await a.getByLabel('Remote collaboration is welcome', { exact: true }).check();
    await a.getByText('Instruments (0 selected)', { exact: true }).click();
    await a.getByLabel(instrument.name, { exact: true }).check();
    await a.getByText('Genres (0 selected)', { exact: true }).click();
    await a.getByLabel(genre.name, { exact: true }).check();
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
    await expect(b.getByRole('button', { name: `Saved ${title}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await b.getByRole('link', { name: 'Saved', exact: true }).click();
    await expect(b.getByRole('link', { name: title, exact: true })).toBeVisible();

    await a.getByRole('link', { name: 'My calls', exact: true }).click();
    const ownCard = a.getByRole('article').filter({ has: a.getByRole('link', { name: title, exact: true }) });
    await ownCard.getByRole('link', { name: 'Edit', exact: true }).click();
    const updatedTitle = 'Acoustic guitar for a remote ensemble';
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
    await a.getByRole('link', { name: 'My calls', exact: true }).click();
    await expect(postImage).toHaveAttribute('src', /^blob:/);
    await expect.poll(() => postImage.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
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
    await b.getByRole('link', { name: updatedTitle, exact: true }).click();
    await b.getByRole('button', { name: `Saved ${updatedTitle}`, exact: true }).click();
    await expect(b.getByRole('button', { name: `Save ${updatedTitle}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
    await b.reload();
    await expect(b.getByRole('button', { name: `Save ${updatedTitle}`, exact: true })).toHaveAttribute('aria-pressed', 'false');
    await b.getByRole('button', { name: `Save ${updatedTitle}`, exact: true }).click();
    await b.getByRole('button', { name: 'Remove comment', exact: true }).click();
    await expect(b.getByText('Synthetic comment: I am interested.', { exact: true })).toHaveCount(0);
    await b.evaluate(() => {
      Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async value => { window.syntheticSharedLink = value; },
      } });
    });
    await b.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(b.getByRole('status').filter({ hasText: 'Link copied.' })).toBeVisible();
    expect(await b.evaluate(() => window.syntheticSharedLink)).toContain(`#announcement?id=${updatedId}`);
    await b.evaluate(() => { navigator.clipboard.writeText = async () => { throw new Error('Synthetic permission denied'); }; });
    await b.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(b.getByLabel('Page link', { exact: true })).toHaveValue(b.url());
    await a.getByRole('link', { name: 'Profile', exact: true }).click();
    await a.getByRole('link', { name: 'Edit profile', exact: true }).click();
    await a.getByRole('button', { name: `Remove ${marker} trio`, exact: true }).click();
    await expect(a.getByRole('heading', { name: `${marker} trio`, exact: true })).toHaveCount(0);
    await a.getByText('Instruments (1 selected)', { exact: true }).click();
    await a.getByLabel(instrument.name, { exact: true }).uncheck();
    await a.getByText('Genres (1 selected)', { exact: true }).click();
    await a.getByLabel(genre.name, { exact: true }).uncheck();
    await a.getByRole('button', { name: 'Save profile', exact: true }).click();
    await expect(a).toHaveURL(/#profile$/);
    await a.reload();
    await expect(a.getByText('No instruments selected yet.', { exact: true })).toBeVisible();
    await expect(a.getByRole('heading', { name: 'Genres', exact: true })).toHaveCount(0);
    await expect(a.getByRole('heading', { name: 'Musical projects', exact: true })).toHaveCount(0);
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
  await expect(results.getByRole('heading', { level: 2 }).first()).toHaveText(demoCalls[14][0]);
  const first = await titles();
  await page.getByRole('navigation', { name: 'Results pages' }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(results.getByRole('article')).toHaveCount(3);
  const second = await titles();
  expect(first.filter(title => second.includes(title))).toEqual([]);
  await page.reload();
  await expect(page.getByRole('searchbox', { name: 'Search announcements', exact: true })).toHaveValue(`${marker} call`);
  await expect(results.getByRole('article')).toHaveCount(3);
  await page.getByText('Filters and sorting', { exact: true }).click();
  await page.getByLabel('Date posted', { exact: true }).selectOption('week');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await expect(results.getByRole('article')).toHaveCount(3);
  expect(await titles()).toEqual([demoCalls[14][0], demoCalls[13][0], demoCalls[12][0]]);
  await page.reload();
  await expect(results.getByRole('article')).toHaveCount(3);
  await expect(page.getByLabel('Date posted', { exact: true })).toHaveValue('week');
  await page.getByText('Filters and sorting (1 active)', { exact: true }).click();
  await page.getByLabel('Sort by', { exact: true }).selectOption('oldest');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  expect(await titles()).toEqual([demoCalls[12][0], demoCalls[13][0], demoCalls[14][0]]);
  await page.getByLabel('Date posted', { exact: true }).selectOption('month');
  await expect(results.getByRole('article')).toHaveCount(10);
  await page.getByRole('link', { name: 'Feed', exact: true }).click();
  await expect(page.getByRole('searchbox', { name: 'Search announcements', exact: true })).toHaveValue('');
  await expect(page.getByRole('navigation', { name: 'Results pages' }).getByRole('status')).toHaveText('Page 1');
});

test('the installed shell and saved feed work offline without caching private APIs or losing edits', async ({ page, context }) => {
  await login(page, people[3]);
  await expect(page.getByRole('region', { name: 'Search results' }).getByRole('article').first()).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  const protocol = await context.newCDPSession(page);
  await protocol.send('Page.enable');
  const installability = await protocol.send('Page.getInstallabilityErrors');
  expect(installability.installabilityErrors).toEqual([]);
  await protocol.detach();
  await page.evaluate(() => {
    const prompt = new Event('beforeinstallprompt');
    Object.assign(prompt, { prompt: async () => { window.syntheticInstallPrompted = true; }, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(prompt);
  });
  await page.getByRole('button', { name: 'Install app', exact: true }).click();
  expect(await page.evaluate(() => window.syntheticInstallPrompted)).toBe(true);
  await expect(page.getByRole('button', { name: 'Install app', exact: true })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Unable to reach Every.music' })).toBeVisible();
  await expect(page.getByLabel('Bio', { exact: true })).toHaveValue('Synthetic offline edit retained until connectivity returns.');
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page).toHaveURL(/#profile$/);
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic offline edit retained until connectivity returns.', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'My profile', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic offline edit retained until connectivity returns.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('everymusic.offline-feed.v1'))).toBeNull();
});

test('themes persist and all principal screens support accessible names, keyboard focus, and narrow reflow', async ({ page }, testInfo) => {
  await login(page, people[4]);
  await page.goto(`/#messages?id=${conversationId}`);
  await expect(page.getByRole('log').getByRole('article')).toHaveCount(25);
  await page.getByRole('navigation', { name: 'Message pages' }).getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page.getByRole('log').getByRole('article')).toHaveCount(6);
  await expect(page.getByRole('log').getByText('Synthetic accessibility conversation 1', { exact: true })).toBeVisible();
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
      if (['#feed', '#musicians', '#profile', '#edit-profile', '#create', `#messages?id=${conversationId}`, '#settings', '#analytics', '#login'].includes(hash)) {
        await page.getByRole('main').evaluate(element => element.blur());
        await page.screenshot({ path: testInfo.outputPath(`${theme}-${hash.slice(1).split('?')[0]}.png`) });
      }
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
  await page.getByText('Filters and sorting', { exact: true }).click();
  await page.getByLabel('City', { exact: true }).fill('Synthetic City');
  await expect(page.getByRole('region', { name: 'Search results' }).getByRole('img')).toHaveCount(0);
  await page.getByText('Filters and sorting (1 active)', { exact: true }).click();
  await expect(page.getByRole('region', { name: 'Search results' })).toHaveAttribute('aria-busy', 'false');
  await page.getByRole('main').evaluate(element => Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished)));
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
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
      await page.getByRole('main').evaluate(element => element.blur());
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
      const nav = document.querySelector('.mobile-nav').getBoundingClientRect();
      const header = document.querySelector('.app-tools').getBoundingClientRect();
      return box.top >= header.bottom && box.bottom <= nav.top;
    })).toBe(true);
  }
  await page.goto('/#feed');
  await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  const more = page.getByRole('button', { name: 'More navigation', exact: true });
  await more.focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('dialog', { name: 'Your workspace', exact: true });
  await expect(menu).toBeVisible();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.getByRole('button', { name: 'Close navigation', exact: true })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(menu.getByRole('link', { name: 'Settings', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu.getByRole('button', { name: 'Close navigation', exact: true })).toBeFocused();
  const menuReport = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(menuReport.violations).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(menu).not.toBeVisible();
  await expect(more).toBeFocused();
  await more.press('Enter');
  await menu.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('main')).toBeFocused();
  await expect(menu).not.toBeVisible();
  await more.press('Enter');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Settings', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto('/#create');
  await expect(page.getByRole('heading', { name: 'Post a call', exact: true })).toBeVisible();
  await more.press('Enter');
  await expect(menu).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(menu).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Post', exact: true })).toBeFocused();
});

test('Google signup and returning deep links preserve account isolation through the real application', async ({ page }) => {
  await page.goto('/#login');
  await page.evaluate(email => { window.syntheticGoogleEmail = email; }, `${marker}-old-google@example.test`);
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit profile', exact: true })).toBeVisible();
  const previousSession = await page.evaluate(() => JSON.parse(sessionStorage.getItem('everymusic.session.v1')));
  people.push({ id: previousSession.persona.userId, email: `${marker}-old-google@example.test` });
  await pool.query(`INSERT INTO notifications (user_id, kind, title, link)
    VALUES ($1, 'comment', 'Synthetic private alert one', '#profile'),
           ($1, 'comment', 'Synthetic private alert two', '#profile')`, [previousSession.persona.userId]);
  await page.reload();
  await page.goto('/#notifications');
  const notificationLink = page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: /^Notifications/ });
  await expect(notificationLink).toContainText('2');
  await page.goto('/#register');
  let release;
  const paused = new Promise(resolve => { release = resolve; });
  await page.route('**/realm/notifications?pageSize=1', async route => {
    if (route.request().headers().authorization !== `Bearer ${previousSession.keys.accessToken}`) await paused;
    await route.continue();
  });
  let newUserId;
  try {
    const newRequest = page.waitForRequest(request => request.url().endsWith('/realm/notifications?pageSize=1')
      && request.headers().authorization !== `Bearer ${previousSession.keys.accessToken}`);
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit profile', exact: true })).toBeVisible();
    const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('everymusic.session.v1')));
    newUserId = session.persona.userId;
    people.push({ id: session.persona.userId, email: `${marker}-google@example.test` });
    expect(session.persona.userId).not.toBe(previousSession.persona.userId);
    await newRequest;
    await expect(notificationLink).toHaveText('Notifications');
  } finally { release(); }
  await expect(notificationLink).toHaveText('Notifications');
  await page.getByLabel(/^Artist name\b/).fill('Demo Google Studio');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Demo Google Studio', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Demo Google Studio', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  await page.goto(`/#announcement?id=${announcementId}`);
  await expect(page).toHaveURL(/#login$/);
  await expect(page.getByRole('heading', { name: 'Welcome back', exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('everymusic.return-to'))).toBe(`#announcement?id=${announcementId}`);
  await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect(page.getByRole('heading', { name: demoCalls[0][0], exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem('everymusic.session.v1')).persona.userId)).toBe(newUserId);
});
