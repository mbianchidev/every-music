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
// Sign-in is rate limited per IP and community.spec.js uses the form; these
// are real sessions issued with the browser API's synthetic signing keys.
const cipher = new CipherEngine({ cipher: {
  primaryKey: serverEnv.CIPHER_PRIMARY_KEY, refreshKey: serverEnv.CIPHER_REFRESH_KEY,
  issuer: 'every.music', audience: 'every.music.clients', accessTokenMinutes: 30, refreshTokenDays: 1,
} });
const marker = `w10-${randomUUID().slice(0, 8)}`;
const names = ['Demo Bandleader', 'Demo Bassist', 'Demo Session Player', 'Demo Rater One', 'Demo Rater Two', 'Demo Rater Three'];
const people = [];
const band = { name: `${marker} Lanterns` };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  for (const [index, name] of names.entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email]);
    people.push({ id: rows[0].id, email, artistName: `${name} ${marker}` });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `${name} ${marker}`, 'Synthetic City']);
  }
  const { rows: [organization] } = await pool.query(
    "INSERT INTO organizations (kind, name, created_by) VALUES ('band', $1, $2) RETURNING id", [band.name, people[0].id]);
  band.id = organization.id;
  await pool.query(`
    INSERT INTO organization_members (organization_id, user_id, role, status, joined_on)
    VALUES ($1, $2, 'leader', 'active', CURRENT_DATE), ($1, $3, 'member', 'active', CURRENT_DATE)`, [band.id, people[0].id, people[1].id]);
  await pool.query('INSERT INTO followers (follower_id, following_id) VALUES ($1, $2), ($2, $1)', [people[0].id, people[2].id]);
  await pool.query('INSERT INTO profile_ratings (rater_id, subject_id, stars) VALUES ($1, $4, 5), ($2, $4, 4), ($3, $4, 3)',
    [people[3].id, people[4].id, people[5].id, people[0].id]);
  await pool.query('INSERT INTO profile_rating_stats (subject_id, rating_count, star_total) VALUES ($1, 3, 12)', [people[0].id]);
});

test.afterAll(async () => {
  const ids = people.map(person => person.id);
  await pool.query('DELETE FROM organizations WHERE id = $1', [band.id]);
  await pool.query('DELETE FROM user_reports WHERE reporter_id = ANY($1::uuid[])', [ids]);
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
  const context = await browser.newContext({ timezoneId: 'Europe/Amsterdam' });
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

async function enableBandMessaging(page) {
  const panel = page.getByRole('region', { name: 'Encrypted messaging' });
  await panel.getByRole('button', { name: 'Generate recovery key', exact: true }).click();
  await panel.getByRole('checkbox', { name: 'I saved this recovery key outside the app', exact: true }).check();
  await panel.getByRole('button', { name: 'Enable encrypted messaging', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Encrypted messaging is ready in this tab.' })).toBeVisible();
}

const inDays = (days, hour) => {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return `${date.toISOString().slice(0, 10)}T${hour}`;
};

test('bands schedule rehearsals with invitees, RSVPs, map and calendar links, and a private ICS feed', async ({ browser }, testInfo) => {
  const { context: leaderContext, page: leader } = await signIn(browser, people[0]);
  const { context: bassistContext, page: bassist } = await signIn(browser, people[1]);
  const { context: guestContext, page: guest } = await signIn(browser, people[2]);
  try {
    await leader.goto(`/#organization?id=${band.id}`);
    const calendar = leader.getByRole('region', { name: 'Band calendar' });
    await expect(calendar.getByText('Nothing scheduled yet.', { exact: true })).toBeVisible();
    await calendar.getByText('Schedule a rehearsal or gig', { exact: true }).click();
    await calendar.getByLabel(/^Title\b/).fill('Synthetic rehearsal, full set');
    await calendar.getByLabel(/^Starts\b/).fill(inDays(9, '19:30'));
    await calendar.getByLabel(/^Ends\b/).fill(inDays(9, '22:00'));
    await calendar.getByLabel(/^Time zone\b/).selectOption('Europe/Rome');
    await calendar.getByLabel('Address or venue', { exact: true }).fill('Studio 4, Synthetic Street 1');
    await calendar.getByLabel('Notes', { exact: true }).fill('Bring spare strings.');
    await calendar.getByLabel('Invite artists', { exact: true }).fill(people[2].artistName);
    await calendar.getByLabel('Matches', { exact: true }).selectOption(people[2].id);
    await calendar.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(calendar.getByRole('list', { name: 'Invited' }).getByText(people[2].artistName)).toBeVisible();
    await expect(calendar.getByRole('checkbox', { name: '1 hour before', exact: true })).toBeChecked();
    await assertAccessible(leader, 'band calendar form');
    await calendar.getByRole('button', { name: 'Add to calendar', exact: true }).click();

    await expect(leader.getByRole('heading', { name: 'Synthetic rehearsal, full set', level: 1 })).toBeVisible();
    await expect(leader.getByText(/\(Europe\/Rome\)$/)).toBeVisible();
    await expect(leader.getByRole('link', { name: 'Open in OpenStreetMap', exact: true }))
      .toHaveAttribute('href', 'https://www.openstreetmap.org/search?query=Studio%204%2C%20Synthetic%20Street%201');
    await expect(leader.getByRole('link', { name: 'Open in Google Maps', exact: true })).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Studio/);
    await expect(leader.getByRole('link', { name: 'Add to Google Calendar', exact: true })).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE&text=Synthetic\+rehearsal/);
    const participants = leader.getByRole('region', { name: 'People' });
    await expect(participants.getByRole('link', { name: people[2].artistName, exact: true })).toBeVisible();
    const [download] = await Promise.all([leader.waitForEvent('download'), leader.getByRole('button', { name: 'Download .ics file', exact: true }).click()]);
    expect(download.suggestedFilename()).toMatch(/^every-music-.+\.ics$/);
    const ics = await (await download.createReadStream()).toArray();
    expect(Buffer.concat(ics).toString('utf8').replace(/\r\n /g, '')).toContain('SUMMARY:Synthetic rehearsal\\, full set');
    await assertAccessible(leader, 'calendar entry for its organizer');
    await leader.screenshot({ path: testInfo.outputPath('calendar-entry.png'), fullPage: true });
    await leader.getByText('Edit details', { exact: true }).click();
    const edit = leader.locator('.calendar-create');
    await expect(edit.getByLabel(/^Title\b/)).toHaveValue('Synthetic rehearsal, full set');
    await edit.getByLabel('Notes', { exact: true }).fill('Bring spare strings and cables.');
    await edit.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(leader.getByRole('status').filter({ hasText: 'Entry updated.' })).toBeVisible();
    await expect(leader.getByRole('article').getByText('Bring spare strings and cables.', { exact: true })).toBeVisible();

    await bassist.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'My calendar', exact: true }).click();
    await expect(bassist.getByRole('heading', { name: 'My calendar', level: 1 })).toBeVisible();
    await bassist.getByRole('link', { name: 'Synthetic rehearsal, full set', exact: true }).click();
    await bassist.getByRole('radio', { name: 'Going', exact: true }).check();
    await expect(bassist.getByRole('status').filter({ hasText: 'Answer saved.' })).toBeVisible();
    await bassist.getByRole('checkbox', { name: '1 day before', exact: true }).check();
    await bassist.getByRole('button', { name: 'Save reminders', exact: true }).click();
    await expect(bassist.getByRole('status').filter({ hasText: 'Reminders saved.' })).toBeVisible();
    await expect(bassist.getByRole('heading', { name: 'Manage this entry' })).toHaveCount(0);
    await assertAccessible(bassist, 'calendar entry for a band member');

    await guest.goto('/#notifications');
    await expect(guest.getByRole('link', { name: 'Calendar update: Synthetic rehearsal, full set', exact: true })).toBeVisible();
    await guest.goto('/#calendar');
    await expect(guest.getByText('Your answer: No answer yet')).toBeVisible();
    await assertAccessible(guest, 'My calendar');
    await reflows(guest, 'My calendar at 320px');
    await guest.getByRole('link', { name: 'Synthetic rehearsal, full set', exact: true }).click();
    await guest.getByRole('radio', { name: 'Maybe', exact: true }).check();
    await expect(guest.getByRole('status').filter({ hasText: 'Answer saved.' })).toBeVisible();
    await reflows(guest, 'calendar entry at 320px');

    await bassist.goto('/#settings');
    const feed = bassist.getByRole('region', { name: 'Calendar subscription' });
    await feed.getByRole('button', { name: 'Create subscription link', exact: true }).click();
    const link = await feed.getByLabel('Your private subscription link', { exact: true }).inputValue();
    expect(link).toMatch(/\/realm\/calendar\/feeds\/[A-Za-z0-9_-]{43}\.ics$/);
    await expect(feed.getByRole('link', { name: 'Add to Google Calendar', exact: true })).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\/calendar\/r\?cid=webcal/);
    await assertAccessible(bassist, 'calendar subscription settings');
    const subscribed = await bassist.request.get(link);
    expect(subscribed.status()).toBe(200);
    expect(subscribed.headers()['content-type']).toMatch(/^text\/calendar/);
    expect((await subscribed.text()).replace(/\r\n /g, '')).toContain('SUMMARY:Synthetic rehearsal\\, full set');
    await feed.getByRole('button', { name: 'Turn off link', exact: true }).click();
    await expect(feed.getByText('You have no subscription link.', { exact: true })).toBeVisible();
    expect((await bassist.request.get(link)).status()).toBe(404);
  } finally {
    await leaderContext.close();
    await bassistContext.close();
    await guestContext.close();
  }
});

test('band members chat with end-to-end encrypted text, pictures, and audio, and report a message', async ({ browser }, testInfo) => {
  const { context: leaderContext, page: leader } = await signIn(browser, people[0]);
  const { context: bassistContext, page: bassist } = await signIn(browser, people[1]);
  try {
    await leader.goto(`/#organization?id=${band.id}&section=chat`);
    const leaderChat = leader.getByRole('region', { name: 'Band chat' });
    await expect(leaderChat.getByText('Set up encrypted messaging above to read and send band messages.', { exact: true })).toBeVisible();
    await enableBandMessaging(leader);
    await expect(leaderChat.getByText(/^No other member can receive encrypted messages yet/)).toBeVisible();

    await bassist.goto(`/#organization?id=${band.id}&section=chat`);
    const bassistChat = bassist.getByRole('region', { name: 'Band chat' });
    await enableBandMessaging(bassist);
    await expect(bassistChat.getByText('No messages yet. Say hello to your band.', { exact: true })).toBeVisible();

    await expect(leaderChat.getByLabel('Message', { exact: true })).toBeEnabled();
    await leaderChat.getByText('Who can read new messages', { exact: true }).click();
    await expect(leaderChat.getByText('Fingerprint not compared yet', { exact: true })).toBeVisible();
    await leaderChat.getByLabel('Message', { exact: true }).fill('Synthetic setlist for Friday');
    await leaderChat.getByLabel('Attach audio or pictures', { exact: true }).setInputFiles([
      { name: 'setlist.png', mimeType: 'image/png', buffer: png },
      { name: 'take.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('ID3 synthetic audio bytes') },
    ]);
    await expect(leaderChat.getByRole('list', { name: 'Attachments to send' }).getByRole('listitem')).toHaveCount(2);
    await assertAccessible(leader, 'band chat composer');
    await leaderChat.getByRole('button', { name: 'Send to band', exact: true }).click();
    await expect(leaderChat.getByRole('log', { name: 'Band chat messages' }).getByText('Synthetic setlist for Friday', { exact: true })).toBeVisible();
    await expect(leaderChat.getByLabel('Message', { exact: true })).toHaveValue('');

    const log = bassistChat.getByRole('log', { name: 'Band chat messages' });
    await expect(log.getByText('Synthetic setlist for Friday', { exact: true })).toBeVisible();
    const picture = log.getByRole('img', { name: `Picture from ${people[0].artistName}: setlist.png`, exact: true });
    await expect(picture).toBeVisible();
    expect(await picture.evaluate(image => image.complete && image.naturalWidth)).toBe(1);
    await log.getByRole('button', { name: 'Play audio: take.mp3', exact: true }).click();
    await expect(log.getByLabel(`Audio from ${people[0].artistName}: take.mp3`, { exact: true })).toHaveAttribute('src', /^blob:/);
    await expect(log.getByRole('link', { name: 'Download take.mp3', exact: true })).toHaveAttribute('download', 'take.mp3');
    await bassistChat.getByLabel('Message', { exact: true }).fill('Got it, see you there');
    await bassistChat.getByRole('button', { name: 'Send to band', exact: true }).click();
    await expect(leaderChat.getByRole('log', { name: 'Band chat messages' }).getByText('Got it, see you there', { exact: true })).toBeVisible();
    await assertAccessible(bassist, 'band chat with attachments');
    await bassist.screenshot({ path: testInfo.outputPath('band-chat.png'), fullPage: true });
    await reflows(bassist, 'band chat at 320px');

    await log.getByRole('button', { name: 'Report message', exact: true }).click();
    const dialog = bassist.getByRole('dialog', { name: 'Report band message' });
    await expect(dialog.getByText('Synthetic setlist for Friday', { exact: true })).toBeVisible();
    await dialog.getByLabel(/^Describe the concern\b/).fill('Synthetic report for the browser test');
    await dialog.getByRole('checkbox', { name: 'I agree to share these report details and this decrypted message with administrators', exact: true }).check();
    await assertAccessible(bassist, 'band message report dialog');
    await dialog.getByRole('button', { name: 'Submit report', exact: true }).click();
    await expect(bassist.getByRole('status').filter({ hasText: 'Report submitted.' })).toBeVisible();
    const { rows: [report] } = await pool.query('SELECT band_message_id, signed_evidence IS NOT NULL AS signed FROM user_reports WHERE reporter_id = $1', [people[1].id]);
    expect(report.signed).toBe(true);
    expect(report.band_message_id).toBeTruthy();

    const { rows: stored } = await pool.query('SELECT ciphertext FROM band_chat_messages WHERE organization_id = $1', [band.id]);
    expect(stored.length).toBe(2);
    expect(stored.some(row => row.ciphertext.includes('Synthetic setlist'))).toBe(false);
  } finally {
    await leaderContext.close();
    await bassistContext.close();
  }
});

test('mutual followers write reviews the artist approves, and anyone rates anonymously', async ({ browser }) => {
  const { context: leaderContext, page: leader } = await signIn(browser, people[0]);
  const { context: guestContext, page: guest } = await signIn(browser, people[2]);
  const { context: raterContext, page: rater } = await signIn(browser, people[3]);
  try {
    await guest.goto(`/#musician?id=${people[0].id}`);
    const reviews = guest.getByRole('region', { name: 'Reviews' });
    await expect(reviews.getByText('No reviews yet.', { exact: true })).toBeVisible();
    await reviews.getByRole('radio', { name: '4 stars', exact: true }).check();
    await reviews.getByLabel(/^Review\b/).fill('A generous synthetic bandleader.');
    await assertAccessible(guest, 'review form');
    await reviews.getByRole('button', { name: 'Send review', exact: true }).click();
    await expect(guest.getByRole('status').filter({ hasText: 'Review sent. It appears after approval.' })).toBeVisible();
    await expect(reviews.getByText('Your review: Waiting for approval')).toBeVisible();

    await leader.goto('/#profile');
    const own = leader.getByRole('region', { name: 'Reviews' });
    await expect(own.getByRole('heading', { name: 'Waiting for your approval' })).toBeVisible();
    await expect(own.getByText('A generous synthetic bandleader.', { exact: true })).toBeVisible();
    await assertAccessible(leader, 'reviews awaiting approval');
    await own.getByRole('button', { name: `Approve review by ${people[2].artistName}`, exact: true }).click();
    await expect(own.getByText('4 out of 5 from 1 review')).toBeVisible();
    const ownRating = leader.getByRole('region', { name: 'Anonymous rating' });
    await expect(ownRating.getByText('Average 4 out of 5 / 3 ratings')).toBeVisible();
    await expect(ownRating.getByRole('radio')).toHaveCount(0);

    await rater.goto(`/#musician?id=${people[0].id}`);
    await expect(rater.getByRole('region', { name: 'Reviews' }).getByText('A generous synthetic bandleader.', { exact: true })).toBeVisible();
    await expect(rater.getByRole('region', { name: 'Reviews' }).getByText('You can review this artist while you follow each other.')).toBeVisible();
    const rating = rater.getByRole('region', { name: 'Anonymous rating' });
    await expect(rating.getByText('Your rating, visible only to you: 5 stars')).toBeVisible();
    await rating.getByRole('radio', { name: '2 stars', exact: true }).check();
    await rating.getByRole('button', { name: 'Save rating', exact: true }).click();
    await expect(rater.getByRole('status').filter({ hasText: 'Rating saved.' })).toBeVisible();
    await expect(rating.getByText('Your rating, visible only to you: 2 stars')).toBeVisible();
    await expect(rating.getByText('Average 4 out of 5 / 3 ratings')).toBeVisible();
    await assertAccessible(rater, 'anonymous rating');
    await reflows(rater, 'profile reviews at 320px');
  } finally {
    await leaderContext.close();
    await guestContext.close();
    await raterContext.close();
  }
});
