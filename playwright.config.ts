import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Yuzztea POS SaaS E2E + visual regression tests.
 *
 * Projects: Chromium + WebKit
 * Viewport profiles: 360 (mobile), 768 (tablet), 1024 (small desktop), 1440 (desktop)
 *
 * Requirements: 12.1, 12.2
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { outputFolder: 'e2e/playwright-report' }]],

  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  snapshotDir: './e2e/__snapshots__',
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}/{arg}{ext}',

  projects: [
    // Chromium - Mobile 360px
    {
      name: 'chromium-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 360, height: 800 },
      },
    },
    // Chromium - Tablet 768px
    {
      name: 'chromium-tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
      },
    },
    // Chromium - Small Desktop 1024px
    {
      name: 'chromium-desktop-sm',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
      },
    },
    // Chromium - Desktop 1440px
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    // WebKit - Mobile 360px
    {
      name: 'webkit-mobile',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 360, height: 800 },
      },
    },
    // WebKit - Tablet 768px
    {
      name: 'webkit-tablet',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 768, height: 1024 },
      },
    },
    // WebKit - Small Desktop 1024px
    {
      name: 'webkit-desktop-sm',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1024, height: 768 },
      },
    },
    // WebKit - Desktop 1440px
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],

  webServer: {
    command: 'pnpm preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
