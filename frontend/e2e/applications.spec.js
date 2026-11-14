import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { apiOrigin } from './origins.js';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `applications-${randomUUID().slice(0, 8)}`;
const people = [];
const title = `Drummer wanted for ${marker}`;
let announcementId;
// Same synthetic signing keys as the browser API in playwright.config.js. Minting
// sessions keeps this suite out of the shared login rate limit that
// community.spec.js exercises through the real sign-in form.
const cipher = new CipherEngine({ cipher: {
  primaryKey: 'synthetic-browser-primary-key-longer-than-thirty-two-characters',
  refreshKey: 'synthetic-browser-refresh-key-longer-than-thirty-two-characters',
  issuer: 'every.music', audience: 'every.music.clients', accessTokenMinutes: 30, refreshTokenDays: 1,
} });

test.beforeAll(async () => {
  const names = ['Demo Owner Harbor', 'Demo Applicant Lark', 'Demo Blocked Fern'];
  for (const [index, artistName] of names.entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await pool.query(
      'INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email],
    );
    people.push({ id: rows[0].id, email, artistName });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, artistName, 'Synthetic City']);
  }
  const instruments = (await pool.query("SELECT id, name FROM instruments WHERE name IN ('Drums', 'Bass Guitar')")).rows;
  const { rows } = await pool.query(`INSERT INTO announcements (user_id, title, description, city)
    VALUES ($1, $2, $3, 'Synthetic City') RETURNING id`, [
    people[0].id, title, `A fictional rehearsal project looking for a steady groove. Synthetic fixture ${marker}.`,
  ]);
  announcementId = rows[0].id;
  for (const instrument of instruments) {
    await pool.query('INSERT INTO announcement_instruments (announcement_id, instrument_id) VALUES ($1, $2)', [announcementId, instrument.id]);
  }
  const profile = (await pool.query('SELECT id FROM profiles WHERE user_id = $1', [people[1].id])).rows[0];
  await pool.query("INSERT INTO user_instruments (profile_id, instrument_id, skill_level, years_experience) VALUES ($1, $2, 'advanced', 5)", [
    profile.id, instruments.find(item => item.name === 'Drums').id,
  ]);
  await pool.query('INSERT INTO blocked_users (user_id, blocked_user_id) VALUES ($1, $2)', [people[0].id, people[2].id]);
});

test.afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

async function login(page, person) {
  const refresh = cipher.createRefreshToken(person.id);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [person.id, refresh.tokenHash, refresh.expiresAt]);
  const session = {
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: cipher.createAccessToken(person.id, person.email), refreshToken: refresh.token },
  };
  await page.goto('/#login');
  await page.evaluate(value => {
    sessionStorage.setItem('everymusic.session.v1', JSON.stringify(value));
    history.replaceState(null, '', '#feed');
  }, session);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Open calls', exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Live updates connected' })).toBeVisible();
}

async function assertAccessible(page, label) {
  await expect(page.locator('.spinner')).toHaveCount(0);
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({
    id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), label).toEqual([]);
}

async function assertReflow(page, label) {
  await page.setViewportSize({ width: 320, height: 720 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), { message: label }).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
}

async function setPublished(page, isPublished) {
  const accessToken = await page.evaluate(() => JSON.parse(sessionStorage.getItem('everymusic.session.v1')).keys.accessToken);
  const response = await page.request.put(`${apiOrigin}/realm/announcements/${announcementId}`, {
    headers: { Authorization: `Bearer ${accessToken}` }, data: { isPublished },
  });
  expect(response.ok()).toBe(true);
}

test('musicians apply in app and owners manage applicants from a dashboard', async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const applicantContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  const applicant = await applicantContext.newPage();
  const [ownerPerson, applicantPerson] = people;
  try {
    await login(applicant, applicantPerson);
    await applicant.goto(`/#announcement?id=${announcementId}`);
    await expect(applicant.getByRole('heading', { name: 'Reply to this call', exact: true })).toBeVisible();
    const open = applicant.getByRole('button', { name: 'Apply to this call', exact: true });
    await open.focus();
    await applicant.keyboard.press('Enter');
    const message = applicant.getByRole('textbox', { name: /^Message to the owner/ });
    await expect(message).toBeFocused();
    await expect(message).toHaveAccessibleDescription(/not end-to-end encrypted/);
    await expect(applicant.getByText(/Visible to the announcement owner\./)).toBeVisible();
    await message.fill('Synthetic drummer with a steady groove. Happy to rehearse on weekends.');
    await applicant.getByRole('checkbox', { name: 'Drums', exact: true }).check();
    await applicant.getByRole('button', { name: 'Add link', exact: true }).click();
    await applicant.getByLabel('Link 1 type', { exact: true }).selectOption('youtube');
    await applicant.getByLabel('Link 1 address', { exact: true }).fill('https://example.test/synthetic-demo');
    await assertAccessible(applicant, 'Apply form');
    await assertReflow(applicant, 'Apply form at 320px');
    await applicant.getByRole('button', { name: 'Send application', exact: true }).click();
    await expect(applicant.getByRole('status').filter({ hasText: 'Application sent.' })).toBeVisible();
    await expect(applicant.getByText('Status: Sent', { exact: true })).toBeVisible();
    await expect(applicant.getByRole('heading', { name: 'Reply to this call', exact: true })).toBeFocused();

    await login(owner, ownerPerson);
    await owner.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('link', { name: 'Applications', exact: true }).click();
    await expect(owner.getByRole('heading', { name: 'Applications', exact: true, level: 1 })).toBeVisible();
    const card = owner.getByRole('article', { name: applicantPerson.artistName });
    await expect(card.getByText('Synthetic drummer with a steady groove. Happy to rehearse on weekends.')).toBeVisible();
    await expect(card.getByText('Drums (advanced)', { exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: 'YouTube', exact: true })).toHaveAttribute('href', 'https://example.test/synthetic-demo');
    await expect(owner.getByText('1 total: 1 new, 0 shortlisted, 0 accepted, 0 declined.')).toBeVisible();
    await card.getByLabel(`Status for ${applicantPerson.artistName}`).selectOption('shortlisted');
    await expect(card.getByRole('status').filter({ hasText: 'Status changed to Shortlisted.' })).toBeVisible();
    await card.getByLabel(`Private note about ${applicantPerson.artistName}`).fill('Synthetic note: great timing.');
    await card.getByRole('button', { name: `Save note about ${applicantPerson.artistName}`, exact: true }).click();
    await expect(card.getByRole('status').filter({ hasText: 'Note saved.' })).toBeVisible();
    await owner.reload();
    await expect(owner.getByLabel(`Private note about ${applicantPerson.artistName}`)).toHaveValue('Synthetic note: great timing.');
    await owner.getByLabel('Status', { exact: true }).selectOption('declined');
    await expect(owner.getByText('No applications match these filters.', { exact: true })).toBeVisible();
    await owner.getByLabel('Status', { exact: true }).selectOption('shortlisted');
    await expect(owner.getByRole('article', { name: applicantPerson.artistName })).toBeVisible();
    await assertAccessible(owner, 'Owner dashboard');
    await owner.emulateMedia({ colorScheme: 'dark' });
    await assertAccessible(owner, 'Owner dashboard in dark mode');
    await owner.emulateMedia({ colorScheme: 'light' });
    await assertReflow(owner, 'Owner dashboard at 320px');

    await applicant.goto('/#applications?view=sent');
    const sent = applicant.getByRole('article', { name: title });
    await expect(sent.getByText('Shortlisted', { exact: true })).toBeVisible();
    await expect(sent.getByText('Synthetic note: great timing.')).toHaveCount(0);
    await assertAccessible(applicant, 'Sent applications');
    await applicant.goto('/#notifications');
    await expect(applicant.getByRole('link', { name: 'Your application was shortlisted', exact: true })).toBeVisible();

    await owner.getByRole('link', { name: 'My calls', exact: true }).click();
    await expect(owner.getByRole('link', { name: `Applicants for ${title}`, exact: true })).toBeVisible();
    await assertReflow(owner, 'My calls at 320px');
    await owner.getByRole('link', { name: `Applicants for ${title}`, exact: true }).click();
    await expect(owner.getByLabel('Call', { exact: true })).toHaveValue(announcementId);
    await owner.getByRole('article', { name: applicantPerson.artistName })
      .getByRole('button', { name: `Message applicant ${applicantPerson.artistName}`, exact: true }).click();
    await expect(owner).toHaveURL(/#messages\?id=/);
    await expect(owner.getByRole('heading', { name: 'Messages', exact: true, level: 1 })).toBeVisible();

    await setPublished(owner, false);
    await applicant.goto('/#applications?view=sent');
    await expect(sent.getByText('Closed', { exact: true })).toBeVisible();
    await expect(sent.getByText('This call is closed and no longer accepts replies.', { exact: true })).toBeVisible();
    await expect(sent.getByRole('link', { name: title, exact: true })).toHaveCount(0);
    await owner.goto(`/#applications?announcement=${announcementId}`);
    await expect(owner.getByText(/This call is closed\. Its applications stay readable until/)).toBeVisible();
    await expect(owner.getByLabel(`Status for ${applicantPerson.artistName}`)).toBeDisabled();
    await setPublished(owner, true);

    await applicant.goto(`/#announcement?id=${announcementId}`);
    await expect(applicant.getByText('Status: Shortlisted', { exact: true })).toBeVisible();
    applicant.once('dialog', dialog => dialog.accept());
    await applicant.getByRole('button', { name: 'Withdraw application', exact: true }).click();
    await expect(applicant.getByRole('status').filter({ hasText: 'Application withdrawn.' })).toBeVisible();
    await expect(applicant.getByRole('button', { name: 'Apply to this call', exact: true })).toBeVisible();
    await owner.goto(`/#announcement?id=${announcementId}`);
    await expect(owner.getByText('0 applications', { exact: true })).toBeVisible();
    await expect(owner.getByRole('button', { name: 'Apply to this call', exact: true })).toHaveCount(0);
  } finally {
    await ownerContext.close();
    await applicantContext.close();
  }
});

test('blocked musicians cannot apply and see why', async ({ page }) => {
  await login(page, people[2]);
  await page.goto(`/#announcement?id=${announcementId}`);
  await page.getByRole('button', { name: 'Apply to this call', exact: true }).click();
  await page.getByRole('textbox', { name: /^Message to the owner/ }).fill('Synthetic blocked reply.');
  await page.getByRole('button', { name: 'Send application', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'You cannot apply to this announcement' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /^Message to the owner/ })).toHaveValue('Synthetic blocked reply.');
  await page.goto('/#applications?view=sent');
  await expect(page.getByRole('heading', { name: 'No applications sent', exact: true })).toBeVisible();
  await page.goto('/#applications');
  await expect(page.getByRole('heading', { name: 'No applications yet', exact: true })).toBeVisible();
  await assertAccessible(page, 'Empty applications dashboard');
});
