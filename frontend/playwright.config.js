import { defineConfig } from '@playwright/test';
import { apiOrigin, apiPort, webOrigin, webPort } from './e2e/origins.js';

if (process.env.REALM_ENV !== 'test' || !process.env.REALM_CONNECTION) {
  throw new Error('Browser tests require REALM_ENV=test and an isolated, bootstrapped REALM_CONNECTION');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  use: {
    baseURL: webOrigin,
    browserName: 'chromium',
    actionTimeout: 10000,
    navigationTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node ../backend/integration/browser-server.js',
      url: `${apiOrigin}/health/ready`,
      timeout: 30000,
      env: {
        REALM_ENV: 'test',
        REALM_CONNECTION: process.env.REALM_CONNECTION,
        CIPHER_PRIMARY_KEY: 'synthetic-browser-primary-key-longer-than-thirty-two-characters',
        CIPHER_REFRESH_KEY: 'synthetic-browser-refresh-key-longer-than-thirty-two-characters',
        NEXUS_PORT: String(apiPort), NEXUS_HOST: '127.0.0.1',
        PORTAL_ORIGINS: webOrigin,
        RATE_THRESHOLD: '10000',
        GOOGLE_IDENTITY_KEY: 'synthetic-browser.apps.googleusercontent.com',
        MAIL_GATEWAY: '', MAIL_IDENTITY: '', MAIL_CREDENTIAL: '', MAIL_SENDER_ALIAS: '',
        VAPID_PUBLIC_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '',
        STRIPE_SECRET_KEY: 'sk_test_synthetic_browser_key', STRIPE_WEBHOOK_SECRET: 'whsec_synthetic_browser_secret',
        STRIPE_PREMIUM_PRICE_ID: 'price_syntheticPremium', STRIPE_PARTNER_PRICE_ID: 'price_syntheticPartner',
        STRIPE_POINTS_PACKS: 'starter:500:price_syntheticStarter:499', REWARDED_VIDEO_MIN_SECONDS: '5',
      },
    },
    {
      command: `npm run compile && npm run serve -- --host 127.0.0.1 --port ${webPort} --strictPort`,
      url: webOrigin,
      timeout: 30000,
      env: { VITE_API_BASE_URL: `${apiOrigin}/realm` },
    },
  ],
});
