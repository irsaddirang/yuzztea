/**
 * E2E test fixtures barrel export.
 *
 * Usage in tests:
 *   import { test, expect } from '../fixtures';
 */
export { test, expect, TEST_CREDENTIALS, type TestCredentials } from './auth.fixture';
export {
  throttleNetwork,
  simulateOfflineOnline,
  setOffline,
  NETWORK_PROFILES,
  type NetworkProfileName,
  type ThrottleProfile,
} from './network.fixture';
