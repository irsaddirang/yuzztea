import { test as base, type Page } from '@playwright/test';

/**
 * Login fixture for authenticated E2E tests.
 *
 * Provides pre-authenticated page contexts for each role:
 * - ownerPage: logged in as Owner
 * - managerPage: logged in as Outlet_Manager
 * - cashierPage: logged in as Cashier
 *
 * Uses the app's HashRouter login flow at /#/login.
 */

export type TestCredentials = {
  email: string;
  password: string;
};

// Default test credentials — override via environment variables or test config
const TEST_CREDENTIALS = {
  owner: {
    email: process.env.E2E_OWNER_EMAIL ?? 'owner@yuzztea.test',
    password: process.env.E2E_OWNER_PASSWORD ?? 'TestOwner123!',
  },
  manager: {
    email: process.env.E2E_MANAGER_EMAIL ?? 'manager@yuzztea.test',
    password: process.env.E2E_MANAGER_PASSWORD ?? 'TestManager123!',
  },
  cashier: {
    email: process.env.E2E_CASHIER_EMAIL ?? 'cashier@yuzztea.test',
    password: process.env.E2E_CASHIER_PASSWORD ?? 'TestCashier123!',
  },
} as const;

async function loginAs(page: Page, credentials: TestCredentials): Promise<void> {
  await page.goto('/#/login');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /login|masuk/i }).click();
  // Wait for navigation away from login page
  await page.waitForURL((url) => !url.hash.includes('/login'), { timeout: 10_000 });
}

type AuthFixtures = {
  ownerPage: Page;
  managerPage: Page;
  cashierPage: Page;
  loginAs: (page: Page, credentials: TestCredentials) => Promise<void>;
};

export const test = base.extend<AuthFixtures>({
  ownerPage: async ({ page }, use) => {
    await loginAs(page, TEST_CREDENTIALS.owner);
    await use(page);
  },

  managerPage: async ({ page }, use) => {
    await loginAs(page, TEST_CREDENTIALS.manager);
    await use(page);
  },

  cashierPage: async ({ page }, use) => {
    await loginAs(page, TEST_CREDENTIALS.cashier);
    await use(page);
  },

  loginAs: async ({}, use) => {
    await use(loginAs);
  },
});

export { expect } from '@playwright/test';
export { TEST_CREDENTIALS };
