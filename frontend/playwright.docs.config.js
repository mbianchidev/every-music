import { defineConfig } from '@playwright/test';
import base from './playwright.config.js';

// Regenerates the documentation screenshots in docs/images with the same
// isolated API, synthetic Stripe settings, and production preview as the
// browser tests. Run with `npm run docs:screenshots`; `npm run test:e2e`
// keeps using ./e2e only.
export default defineConfig({
  ...base,
  testDir: './docs-screenshots',
  outputDir: './test-results/docs-screenshots',
  timeout: 180000,
  expect: { timeout: 15000 },
  use: { ...base.use, trace: 'off', screenshot: 'off' },
});
