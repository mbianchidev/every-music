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
const marker = `polish-${randomUUID().slice(0, 8)}`;
const people = [];
const band = { name: `${marker} Harbor Lights` };
let instruments = [];

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  for (const [index, name] of ['Demo Songwriter', 'Demo Drummer', 'Demo Listener'].entries()) {
    const email = `${marker}-${index}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email]);
    people.push({ id: rows[0].id, email, artistName: `${name} ${marker}` });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `${name} ${marker}`, 'Synthetic City']);
  }
  ({ rows: instruments } = await pool.query('SELECT id, name FROM instruments ORDER BY name, id LIMIT 3'));
  const { rows: [organization] } = await pool.query(
    "INSERT INTO organizations (kind, name, created_by) VALUES ('band', $1, $2) RETURNING id", [band.name, people[0].id]);
  band.id = organization.id;
  await pool.query(`
    INSERT INTO organization_members (organization_id, user_id, role, status, joined_on)
    VALUES ($1, $2, 'leader', 'active', CURRENT_DATE), ($1, $3, 'member', 'active', CURRENT_DATE)`, [band.id, people[0].id, people[1].id]);
  await pool.query(`
    INSERT INTO band_chat_members (organization_id, user_id, joined_at)
    VALUES ($1, $2, NOW() - INTERVAL '1 day'), ($1, $3, NOW() - INTERVAL '1 day')`, [band.id, people[0].id, people[1].id]);
  // Opaque synthetic ciphertext: these tests only count unread messages and never decrypt them.
  const { rows: [key] } = await pool.query(`
    INSERT INTO messaging_keys (user_id, signing_key, encryption_key, identity_proof, fingerprint, encrypted_private_key)
    VALUES ($1, '{}', '{}', 'synthetic-proof', $2, 'synthetic-private-key') RETURNING id`, [people[1].id, `${marker}-fingerprint`]);
  for (let i = 0; i < 3; i += 1) {
    await pool.query(`
      INSERT INTO band_chat_messages (organization_id, sender_id, client_id, ciphertext, sender_key_id, recipient_key_ids)
      VALUES ($1, $2, $3, 'synthetic-ciphertext', $4, ARRAY[$4]::uuid[])`, [band.id, people[1].id, randomUUID(), key.id]);
  }
  await pool.query(`INSERT INTO notifications (user_id, kind, title, link, params, push_sent) VALUES
    ($1, 'application_status', 'Your application was accepted', '#applications?view=sent', $2, TRUE),
    ($1, 'security_alert', 'Two-step verification was turned on', '#settings', '{"event": "two_factor_enabled", "method": "totp"}', TRUE),
    ($1, 'organization_membership', $3, '#your-pages', $4, TRUE)`, [
    people[0].id, JSON.stringify({ applicationId: randomUUID(), title: `${marker} call`, status: 'accepted' }),
    `You are now the leader of ${band.name}`, JSON.stringify({ organizationId: band.id, organizationName: band.name, change: 'leader' }),
  ]);
});

test.afterAll(async () => {
  const ids = people.map(person => person.id);
  await pool.query('DELETE FROM organizations WHERE id = $1', [band.id]);
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
  await pool.end();
});

async function signIn(browser, person, { locale = 'en-US' } = {}) {
  const refresh = cipher.createRefreshToken(person.id);
  await pool.query('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)', [person.id, refresh.tokenHash, refresh.expiresAt]);
  const session = {
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: cipher.createAccessToken(person.id, person.email), refreshToken: refresh.token },
  };
  const context = await browser.newContext({ locale });
  await context.addInitScript(({ value, origin }) => {
    if (location.origin === origin && !sessionStorage.getItem('everymusic.session.v1')) {
      sessionStorage.setItem('everymusic.session.v1', JSON.stringify(value));
    }
  }, { value: session, origin: webOrigin });
  const page = await context.newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.goto('/#notifications');
  await expect(page.locator('.notification-list')).toBeAttached();
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

test('musicians list the instruments they play in each project, on the editor and the public profile', async ({ browser }) => {
  const { context, page } = await signIn(browser, people[0]);
  const { context: visitorContext, page: visitor } = await signIn(browser, people[2]);
  try {
    await page.goto('/#edit-profile');
    const projects = page.getByRole('region', { name: 'Musical projects', exact: true });
    await projects.getByLabel(/^Project name\b/).fill(`${marker} duo`);
    await projects.getByLabel('Your role', { exact: true }).fill('Vocals');
    const picker = projects.getByLabel('Add an instrument', { exact: true });
    for (const instrument of instruments) await picker.selectOption(instrument.id);
    const chosen = projects.getByRole('list', { name: 'Instruments played in this project', exact: true });
    await expect(chosen.getByRole('listitem')).toHaveCount(3);
    await chosen.getByRole('button', { name: `Remove ${instruments[2].name} from this project`, exact: true }).click();
    await expect(picker).toBeFocused();
    await expect(projects.getByRole('status').filter({ hasText: `${instruments[2].name} removed from this project.` })).toBeAttached();
    await expect(chosen.getByRole('listitem')).toHaveCount(2);
    await expect(picker.locator(`option[value="${instruments[2].id}"]`)).toHaveCount(1);
    await assertAccessible(page, 'project editor with instruments');
    await reflows(page, 'project editor at 320px');
    await projects.getByRole('button', { name: 'Add project', exact: true }).click();
    await expect(projects.getByRole('status').filter({ hasText: 'Project added.' })).toBeVisible();
    await expect(projects.getByText(`Instruments played: ${instruments[0].name}, ${instruments[1].name}`, { exact: true })).toBeVisible();

    await projects.getByRole('button', { name: `Edit ${marker} duo`, exact: true }).click();
    await expect(chosen.getByRole('listitem')).toHaveCount(2);
    await chosen.getByRole('button', { name: `Remove ${instruments[0].name} from this project`, exact: true }).click();
    await projects.getByRole('button', { name: 'Save project changes', exact: true }).click();
    await expect(projects.getByRole('status').filter({ hasText: 'Project updated.' })).toBeVisible();
    await expect(projects.getByText(`Instruments played: ${instruments[1].name}`, { exact: true })).toBeVisible();

    await visitor.goto(`/#musician?id=${people[0].id}`);
    await expect(visitor.getByRole('heading', { name: `${marker} duo`, exact: true })).toBeVisible();
    await expect(visitor.getByRole('list', { name: 'Instruments played', exact: true }).getByRole('listitem')).toHaveText([instruments[1].name]);
    await assertAccessible(visitor, 'public profile with project instruments');
  } finally {
    await context.close(); await visitorContext.close();
  }
});

test('Italian members see localized projects, profile details, and notification titles', async ({ browser }) => {
  // The account language wins over the browser's once it is saved, so choose Italian explicitly.
  await pool.query(`INSERT INTO user_preferences (user_id, locale) VALUES ($1, 'it')
    ON CONFLICT (user_id) DO UPDATE SET locale = 'it'`, [people[0].id]);
  const { context, page } = await signIn(browser, people[0], { locale: 'it-IT' });
  try {
    const list = page.locator('.notification-list');
    await expect(list.getByRole('link', { name: 'La tua candidatura è stata accettata', exact: true })).toBeVisible();
    await expect(list.getByRole('link', { name: 'La verifica in due passaggi è stata attivata', exact: true })).toBeVisible();
    await expect(list.getByRole('link', { name: `Ora sei il leader di ${band.name}`, exact: true })).toBeVisible();

    await page.goto('/#settings?section=notifications');
    const preferences = page.locator('section.notification-preferences');
    await expect(preferences.getByRole('heading', { name: 'Sicurezza e verifica', exact: true })).toBeVisible();
    await expect(preferences.getByRole('group', { name: 'Avvisi di sicurezza', exact: true })).toBeVisible();
    await expect(preferences.getByRole('heading', { name: 'Altre notifiche', exact: true })).toHaveCount(0);

    await page.goto(`/#musician?id=${people[0].id}`);
    await expect(page.getByRole('heading', { name: 'Progetti musicali', exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Strumenti suonati', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Strumenti', exact: true })).toBeVisible();
  } finally {
    await context.close();
    await pool.query("UPDATE user_preferences SET locale = 'en' WHERE user_id = $1", [people[0].id]);
  }
});

test('unread band chat messages show on the Your pages navigation entry and list', async ({ browser }) => {
  const { context, page } = await signIn(browser, people[0]);
  try {
    const navigation = page.getByRole('navigation', { name: 'Primary' });
    const entry = navigation.getByRole('link', { name: 'Your pages 3 unread band chat messages', exact: true });
    await expect(entry).toBeVisible();
    await expect(entry.locator('.nav-badge [aria-hidden="true"]')).toHaveText('3');
    await entry.click();
    const chats = page.getByRole('region', { name: 'Band chats', exact: true });
    const item = chats.getByRole('listitem').filter({ hasText: band.name });
    await expect(item.getByText('3 unread messages', { exact: true })).toBeVisible();
    await expect(item.getByRole('link', { name: `Open the ${band.name} chat`, exact: true }))
      .toHaveAttribute('href', `#organization?id=${band.id}&section=chat`);
    await assertAccessible(page, 'Your pages with unread band chats');
    await reflows(page, 'Your pages with unread band chats at 320px');

    await pool.query('UPDATE band_chat_members SET read_at = clock_timestamp() WHERE organization_id = $1 AND user_id = $2', [band.id, people[0].id]);
    await page.reload();
    await expect(chats.getByText('No unread messages', { exact: true })).toBeVisible();
    await expect(navigation.getByRole('link', { name: 'Your pages', exact: true })).toBeVisible();
    await expect(navigation.locator('.band-chat-nav-badge')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
