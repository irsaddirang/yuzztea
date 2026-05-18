import { test, expect } from '@playwright/test';

/**
 * Smoke test to verify the app loads correctly across viewports.
 * Requirements: 12.1, 12.2
 */
test.describe('App smoke test', () => {
  test('should load the app without horizontal scroll', async ({ page }) => {
    await page.goto('/');

    // App should render without errors
    await expect(page.locator('#root')).toBeVisible();

    // No horizontal scrollbar (Req 12.1)
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
});
