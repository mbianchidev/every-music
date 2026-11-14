import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import playwrightConfig from '../playwright.config.js';
import { createRealmConfig } from '../../backend/config/realm.js';
import { CipherEngine } from '../../backend/src/engines/cipher-engine.js';

const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
const { Pool } = requireBackend('pg');
const pool = new Pool({ connectionString: process.env.REALM_CONNECTION });
const marker = `browser-${randomUUID().slice(0, 8)}`;
const people = [];
// Sessions are minted with the browser API's own signing settings so this spec
// does not spend the per-IP sign-in budget used by other browser journeys.
const apiCipher = new CipherEngine(createRealmConfig(playwrightConfig.webServer[0].env));

test.beforeAll(async () => {
  for (let i = 0; i < 2; i += 1) {
    const email = `${marker}-devices-${i}@example.test`;
    const { rows } = await pool.query('INSERT INTO users (email, email_verified) VALUES ($1, TRUE) RETURNING id', [email]);
    people.push({ id: rows[0].id, email });
    await pool.query('INSERT INTO profiles (user_id, artist_name, city) VALUES ($1, $2, $3)', [rows[0].id, `Demo Devices ${i}`, 'Synthetic City']);
  }
  await pool.query(`
    INSERT INTO push_devices (user_id, platform, token, created_at, updated_at) VALUES
      ($1, 'android', $2, NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day'),
      ($1, 'ios', $3, NOW() - INTERVAL '2 days', NOW())`,
  [people[0].id, `synthetic-fcm:${randomBytes(48).toString('base64url')}`, randomBytes(32).toString('hex')]);
});

test.afterAll(async () => {
  await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [people.map(person => person.id)]);
  await pool.end();
});

async function openSettings(page, person) {
  const session = {
    persona: { userId: person.id, email: person.email, emailVerified: true },
    keys: { accessToken: apiCipher.createAccessToken(person.id, person.email), refreshToken: 'synthetic-unused-refresh-token' },
  };
  await page.addInitScript(value => sessionStorage.setItem('everymusic.session.v1', value), JSON.stringify(session));
  await page.goto('/#settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
}

async function assertAccessible(page, label) {
  const report = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(report.violations.map(item => ({
    id: item.id, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })),
  })), label).toEqual([]);
}

test('members review and remove phones registered for native push', async ({ page }) => {
  await openSettings(page, people[0]);
  const section = page.getByRole('region', { name: 'Mobile devices' });
  await expect(section).toBeVisible();
  await expect(section.getByText('Mobile push is not configured on this server.', { exact: false })).toBeVisible();
  await expect(section.getByRole('listitem')).toHaveCount(2);
  await expect(section.getByRole('heading', { name: 'iPhone or iPad', exact: true })).toBeVisible();
  await expect(section.getByRole('heading', { name: 'Android device', exact: true })).toBeVisible();
  expect(await section.textContent()).not.toContain('synthetic-fcm:');
  await assertAccessible(page, 'Settings with registered mobile devices');

  await page.setViewportSize({ width: 320, height: 720 });
  await expect(section.getByRole('listitem')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 900 });

  const remove = section.getByRole('button', { name: /^Remove Android device registered / });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(section.getByRole('status')).toHaveText('Android device removed. It will no longer receive push notifications.');
  await expect(section.getByRole('listitem')).toHaveCount(1);
  await expect(section.getByRole('heading', { name: 'Android device', exact: true })).toHaveCount(0);
  const { rows } = await pool.query('SELECT platform FROM push_devices WHERE user_id = $1', [people[0].id]);
  expect(rows.map(row => row.platform)).toEqual(['ios']);
  await assertAccessible(page, 'Settings after removing a mobile device');
});

test('the mobile devices section stays hidden when push is unavailable and nothing is registered', async ({ page }) => {
  await openSettings(page, people[1]);
  await expect(page.getByRole('heading', { name: 'Browser push', exact: true })).toBeVisible();
  await expect(page.locator('.spinner')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Mobile devices' })).toHaveCount(0);
});
