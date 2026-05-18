import { type Page, type Route } from '@playwright/test';

/**
 * Network throttle utilities for E2E tests.
 *
 * Simulates slow connections and offline scenarios to test:
 * - Offline POS resilience (Req 11)
 * - Realtime reconnection behavior (Req 10)
 * - Performance under constrained networks (Req 9.10)
 */

export type ThrottleProfile = {
  /** Download speed in bytes per second */
  downloadBps: number;
  /** Upload speed in bytes per second */
  uploadBps: number;
  /** Latency in milliseconds */
  latencyMs: number;
};

export const NETWORK_PROFILES = {
  /** 4 Mbps connection (Req 9.10 performance baseline) */
  '4mbps': {
    downloadBps: (4 * 1024 * 1024) / 8,
    uploadBps: (1 * 1024 * 1024) / 8,
    latencyMs: 50,
  },
  /** Slow 3G connection */
  'slow-3g': {
    downloadBps: (500 * 1024) / 8,
    uploadBps: (100 * 1024) / 8,
    latencyMs: 400,
  },
  /** Fast 3G connection */
  'fast-3g': {
    downloadBps: (1.5 * 1024 * 1024) / 8,
    uploadBps: (750 * 1024) / 8,
    latencyMs: 150,
  },
  /** Offline — blocks all network requests */
  offline: {
    downloadBps: 0,
    uploadBps: 0,
    latencyMs: 0,
  },
} as const satisfies Record<string, ThrottleProfile>;

export type NetworkProfileName = keyof typeof NETWORK_PROFILES;

/**
 * Throttle network requests on a page using route interception.
 * Returns a cleanup function to restore normal network.
 */
export async function throttleNetwork(
  page: Page,
  profile: NetworkProfileName | ThrottleProfile,
): Promise<() => Promise<void>> {
  const config = typeof profile === 'string' ? NETWORK_PROFILES[profile] : profile;

  if (config.downloadBps === 0) {
    // Offline mode: abort all requests
    await page.route('**/*', (route: Route) => route.abort('connectionfailed'));
    return async () => {
      await page.unroute('**/*');
    };
  }

  // Throttle mode: add latency to responses
  await page.route('**/*', async (route: Route) => {
    await new Promise((resolve) => setTimeout(resolve, config.latencyMs));
    await route.continue();
  });

  return async () => {
    await page.unroute('**/*');
  };
}

/**
 * Simulate going offline then back online.
 * Useful for testing offline queue and reconnection.
 */
export async function simulateOfflineOnline(page: Page, offlineDurationMs: number): Promise<void> {
  const restore = await throttleNetwork(page, 'offline');
  await page.waitForTimeout(offlineDurationMs);
  await restore();
}

/**
 * Set browser context to offline mode using CDP (Chromium only).
 * Falls back to route-based blocking for WebKit.
 */
export async function setOffline(page: Page, offline: boolean): Promise<void> {
  const context = page.context();

  try {
    // Try CDP approach (Chromium)
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', {
      offline,
      downloadThroughput: offline ? 0 : -1,
      uploadThroughput: offline ? 0 : -1,
      latency: 0,
    });
  } catch {
    // Fallback for WebKit: use route-based blocking
    if (offline) {
      await page.route('**/*', (route) => route.abort('connectionfailed'));
    } else {
      await page.unroute('**/*');
    }
  }
}
