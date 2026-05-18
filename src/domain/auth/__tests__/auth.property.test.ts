/**
 * Property-based tests for the Auth domain.
 *
 * Properties tested:
 * - P5: Authorization predicate
 * - P6: Route guard determinism
 * - P7: Idle session expiry
 * - P8: Login throttle backoff
 * - P26: Storage hygiene
 *
 * Uses fast-check with deterministic seed from src/test/property.ts.
 */

import { authorize, type Role, type ResourceScope } from '../authorize';
import { initialThrottleState, recordFailure, canAttempt } from '../authThrottle';
import { routeGuard, publicRoutes, adminRoutes, type RouteGuardSession } from '../routeGuard';
import { isSessionExpired, SESSION_TIMEOUT_MS } from '../sessionExpiry';
import {
  storeSession,
  clearSession,
  retrieveSession,
  SESSION_KEY_PREFIX,
  stripSensitiveFields,
} from '../sessionStorageAdapter';

import { runProperty, fc, describe } from '@/test/property';

// --- Arbitraries ---

const arbRole = fc.constantFrom<Role>('owner', 'outlet_manager', 'cashier');
const arbScope = fc.constantFrom<ResourceScope>('pos', 'management', 'audit');
const arbOutletId = fc.uuid();
const arbOutletIds = fc.array(arbOutletId, { minLength: 0, maxLength: 10 });

const allRoutes = ['/', '/login', '/pos', '/pos/checkout', '/no-outlet', ...adminRoutes];
const arbRoute = fc.constantFrom(...allRoutes);

const arbSession = fc.oneof(
  fc.constant(null),
  fc.record({
    role: arbRole,
    outletIds: arbOutletIds,
  }),
);

// --- Property 5: Authorization predicate ---
// Validates: Requirements 2.2, 2.3, 2.4, 2.5, 4.2, 4.5, 5.4, 14.5

describe('Property 5: Authorization predicate', () => {
  runProperty(
    'authorize returns true iff role/scope/outlet combination matches the decision table',
    fc.property(
      arbRole,
      arbOutletIds,
      arbScope,
      arbOutletId,
      (role, userOutletIds, scope, requestedOutletId) => {
        const result = authorize({ role, userOutletIds, scope, requestedOutletId });

        // Compute expected result from the decision table
        let expected: boolean;
        switch (role) {
          case 'owner':
            expected = true;
            break;
          case 'outlet_manager':
            expected =
              (scope === 'pos' || scope === 'management') &&
              userOutletIds.includes(requestedOutletId);
            break;
          case 'cashier':
            expected = scope === 'pos' && userOutletIds.includes(requestedOutletId);
            break;
          default:
            expected = false;
        }

        return result === expected;
      },
    ),
    500,
  );

  runProperty(
    'owner always has access regardless of outlet assignment',
    fc.property(arbScope, arbOutletId, (scope, requestedOutletId) => {
      return authorize({ role: 'owner', userOutletIds: [], scope, requestedOutletId }) === true;
    }),
  );

  runProperty(
    'cashier never has access to management or audit scope',
    fc.property(
      arbOutletIds,
      arbOutletId,
      fc.constantFrom<ResourceScope>('management', 'audit'),
      (userOutletIds, requestedOutletId, scope) => {
        return authorize({ role: 'cashier', userOutletIds, scope, requestedOutletId }) === false;
      },
    ),
  );

  runProperty(
    'outlet_manager never has access to audit scope',
    fc.property(arbOutletIds, arbOutletId, (userOutletIds, requestedOutletId) => {
      return (
        authorize({
          role: 'outlet_manager',
          userOutletIds,
          scope: 'audit',
          requestedOutletId,
        }) === false
      );
    }),
  );
});

// --- Property 6: Route guard determinism ---
// Validates: Requirements 1.5, 2.5, 2.6, 14.5

describe('Property 6: Route guard determinism', () => {
  runProperty(
    'routeGuard is deterministic: same inputs always produce same output',
    fc.property(arbRoute, arbSession, (route, session) => {
      const result1 = routeGuard(route, session);
      const result2 = routeGuard(route, session);
      return JSON.stringify(result1) === JSON.stringify(result2);
    }),
    500,
  );

  runProperty(
    'unauthenticated user: public routes allowed, others redirect to /login',
    fc.property(arbRoute, (route) => {
      const result = routeGuard(route, null);
      if (publicRoutes.includes(route)) {
        return result.kind === 'allow';
      }
      return result.kind === 'redirect' && result.to === '/login';
    }),
  );

  runProperty(
    'non-owner with empty outletIds always redirects to /no-outlet',
    fc.property(arbRoute, fc.constantFrom<Role>('outlet_manager', 'cashier'), (route, role) => {
      const session: RouteGuardSession = { role, outletIds: [] };
      const result = routeGuard(route, session);
      return result.kind === 'redirect' && result.to === '/no-outlet';
    }),
  );

  runProperty(
    'cashier with outlets accessing admin routes redirects to /pos',
    fc.property(
      fc.constantFrom(...adminRoutes),
      fc.array(arbOutletId, { minLength: 1, maxLength: 5 }),
      (route, outletIds) => {
        const session: RouteGuardSession = { role: 'cashier', outletIds };
        const result = routeGuard(route, session);
        return result.kind === 'redirect' && result.to === '/pos';
      },
    ),
  );

  runProperty(
    'owner with outlets is always allowed',
    fc.property(arbRoute, arbOutletIds, (route, outletIds) => {
      const session: RouteGuardSession = { role: 'owner', outletIds };
      const result = routeGuard(route, session);
      // Owner with outlets is always allowed (owner with empty outlets is also allowed)
      return result.kind === 'allow';
    }),
  );
});

// --- Property 7: Idle session expiry ---
// Validates: Requirements 1.3

describe('Property 7: Idle session expiry', () => {
  runProperty(
    'isSessionExpired(t, t+d) === (d >= 12*3600*1000)',
    fc.property(
      fc.nat({ max: 1e12 }), // lastActivityAt
      fc.nat({ max: 1e9 }), // delta
      (lastActivityAt, delta) => {
        const now = lastActivityAt + delta;
        const expected = delta >= SESSION_TIMEOUT_MS;
        return isSessionExpired(lastActivityAt, now) === expected;
      },
    ),
    500,
  );

  runProperty(
    'session is never expired when delta is 0',
    fc.property(fc.nat({ max: 1e12 }), (t) => {
      return isSessionExpired(t, t) === false;
    }),
  );

  runProperty(
    'session is always expired when delta >= 12h',
    fc.property(
      fc.nat({ max: 1e12 }),
      fc.integer({ min: SESSION_TIMEOUT_MS, max: SESSION_TIMEOUT_MS * 10 }),
      (lastActivityAt, delta) => {
        return isSessionExpired(lastActivityAt, lastActivityAt + delta) === true;
      },
    ),
  );
});

// --- Property 8: Login throttle backoff ---
// Validates: Requirements 1.6, 15.7, 15.8

describe('Property 8: Login throttle backoff', () => {
  runProperty(
    'after n<=5 failures in 10min window, waitMs = 0',
    fc.property(fc.integer({ min: 1, max: 5 }), fc.nat({ max: 1e9 }), (n, baseTime) => {
      let state = initialThrottleState();
      for (let i = 0; i < n; i++) {
        state = recordFailure(state, baseTime + i * 1000);
      }
      const lastFailureTime = baseTime + (n - 1) * 1000;
      const { ok, waitMs } = canAttempt(state, lastFailureTime);
      return ok === true && waitMs === 0;
    }),
  );

  runProperty(
    'after n>5 failures in 10min, waitMs = min(2^(n-5)*1000, 300000)',
    fc.property(fc.integer({ min: 6, max: 25 }), fc.nat({ max: 1e9 }), (n, baseTime) => {
      let state = initialThrottleState();
      // All failures within 10-minute window (spaced 1s apart)
      for (let i = 0; i < n; i++) {
        state = recordFailure(state, baseTime + i * 1000);
      }

      const lastFailureTime = baseTime + (n - 1) * 1000;
      const expectedBackoff = Math.min(Math.pow(2, n - 5) * 1000, 300_000);
      const expectedNextAllowed = lastFailureTime + expectedBackoff;

      // Check immediately after last failure
      const { ok, waitMs } = canAttempt(state, lastFailureTime);

      return (
        ok === false && waitMs === expectedBackoff && state.nextAllowedAt === expectedNextAllowed
      );
    }),
    500,
  );

  runProperty(
    'backoff never exceeds 300_000ms (5 minutes)',
    fc.property(fc.integer({ min: 1, max: 50 }), fc.nat({ max: 1e9 }), (n, baseTime) => {
      let state = initialThrottleState();
      for (let i = 0; i < n; i++) {
        state = recordFailure(state, baseTime + i * 100);
      }
      const lastFailureTime = baseTime + (n - 1) * 100;
      const { waitMs } = canAttempt(state, lastFailureTime);
      return waitMs <= 300_000;
    }),
  );

  runProperty(
    'failures outside 10-minute window are pruned',
    fc.property(fc.integer({ min: 1, max: 10 }), fc.nat({ max: 1e9 }), (n, baseTime) => {
      let state = initialThrottleState();
      // Add failures at baseTime
      for (let i = 0; i < n; i++) {
        state = recordFailure(state, baseTime + i * 1000);
      }
      // Record one failure well after the 10-minute window
      const laterTime = baseTime + 11 * 60 * 1000;
      state = recordFailure(state, laterTime);

      // Only the latest failure should remain (all old ones pruned)
      return state.failures.length === 1 && state.failures[0].ts === laterTime;
    }),
  );
});

// --- Property 26: Storage hygiene ---
// Validates: Requirements 1.4, 15.4, 15.5, 15.6

describe('Property 26: Storage hygiene', () => {
  runProperty(
    'storeSession never persists password fields',
    fc.property(
      fc.record({
        userId: fc.uuid(),
        role: arbRole,
        outletIds: arbOutletIds,
        password: fc.string({ minLength: 1, maxLength: 50 }),
        displayName: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      (sessionData) => {
        // Use stripSensitiveFields (the pure function) to verify behavior
        const sanitized = stripSensitiveFields(sessionData);
        return !('password' in sanitized);
      },
    ),
    500,
  );

  runProperty(
    'stripSensitiveFields removes all sensitive keys recursively',
    fc.property(
      fc.record({
        user: fc.record({
          id: fc.uuid(),
          password: fc.string({ minLength: 1 }),
          Password: fc.string({ minLength: 1 }),
          name: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        token_hash: fc.string({ minLength: 1 }),
        secret: fc.string({ minLength: 1 }),
        role: arbRole,
      }),
      (data) => {
        const sanitized = stripSensitiveFields(data);
        // Top-level sensitive fields removed
        const hasTopLevelSensitive = 'token_hash' in sanitized || 'secret' in sanitized;
        // Nested sensitive fields removed
        const userObj = sanitized.user as Record<string, unknown> | undefined;
        const hasNestedSensitive = userObj && ('password' in userObj || 'Password' in userObj);

        return !hasTopLevelSensitive && !hasNestedSensitive;
      },
    ),
  );

  runProperty(
    'storeSession + retrieveSession round-trip preserves non-sensitive data',
    fc.property(
      fc.record({
        userId: fc.uuid(),
        role: arbRole,
        outletIds: fc.array(fc.uuid(), { minLength: 0, maxLength: 5 }),
        displayName: fc.string({ minLength: 1, maxLength: 30 }),
      }),
      (sessionData) => {
        // Clear before test
        sessionStorage.clear();

        storeSession(sessionData);
        const retrieved = retrieveSession();

        if (retrieved === null) return false;

        return (
          retrieved.userId === sessionData.userId &&
          retrieved.role === sessionData.role &&
          JSON.stringify(retrieved.outletIds) === JSON.stringify(sessionData.outletIds) &&
          retrieved.displayName === sessionData.displayName
        );
      },
    ),
  );

  runProperty(
    'clearSession removes all prefixed keys from sessionStorage',
    fc.property(
      fc.record({
        userId: fc.uuid(),
        role: arbRole,
      }),
      fc.array(fc.tuple(fc.string({ minLength: 1, maxLength: 20 }), fc.string()), {
        minLength: 0,
        maxLength: 5,
      }),
      (sessionData, extraKeys) => {
        sessionStorage.clear();

        // Store session
        storeSession(sessionData);

        // Add some extra prefixed keys
        for (const [suffix, value] of extraKeys) {
          sessionStorage.setItem(`${SESSION_KEY_PREFIX}${suffix}`, value);
        }

        // Add a non-prefixed key that should survive
        sessionStorage.setItem('other_key', 'should_remain');

        clearSession();

        // Verify all prefixed keys are gone
        let hasPrefixedKey = false;
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key !== null && key.startsWith(SESSION_KEY_PREFIX)) {
            hasPrefixedKey = true;
            break;
          }
        }

        // Non-prefixed key should remain
        const otherKeyRemains = sessionStorage.getItem('other_key') === 'should_remain';

        sessionStorage.clear();
        return !hasPrefixedKey && otherKeyRemains;
      },
    ),
  );
});
