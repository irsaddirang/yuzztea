/**
 * Auth Throttle — pure functions for login rate limiting.
 *
 * After 5 failed login attempts within a 10-minute window,
 * exponential backoff is applied: waitMs = min(2^(n-5) * 1000, 300_000) ms
 * calculated from the last failure timestamp.
 *
 * Validates: Requirements 1.6, 15.7, 15.8
 */

/** 10 minutes in milliseconds */
const WINDOW_MS = 10 * 60 * 1000;

/** Maximum backoff: 5 minutes (300 seconds) */
const MAX_BACKOFF_MS = 300_000;

/** Number of failures before throttling kicks in */
const THRESHOLD = 5;

export type ThrottleState = {
  failures: { ts: number }[];
  nextAllowedAt: number;
};

/**
 * Creates an empty throttle state.
 */
export function initialThrottleState(): ThrottleState {
  return { failures: [], nextAllowedAt: 0 };
}

/**
 * Records a login failure and computes the next allowed attempt time.
 *
 * - Prunes failures outside the 10-minute window relative to `now`.
 * - Adds the new failure.
 * - If total failures in window > 5, computes exponential backoff from last failure.
 *
 * @param state - Current throttle state
 * @param now - Current timestamp in ms
 * @returns Updated throttle state
 */
export function recordFailure(state: ThrottleState, now: number): ThrottleState {
  // Keep only failures within the 10-minute window (relative to `now`), then add new one
  const windowStart = now - WINDOW_MS;
  const recentFailures = state.failures.filter((f) => f.ts > windowStart);
  const updatedFailures = [...recentFailures, { ts: now }];

  const n = updatedFailures.length;
  let nextAllowedAt: number;

  if (n <= THRESHOLD) {
    // No throttling yet
    nextAllowedAt = 0;
  } else {
    // Exponential backoff: 2^(n-5) * 1000, capped at 300_000 ms
    const exponent = n - THRESHOLD;
    const backoffMs = Math.min(Math.pow(2, exponent) * 1000, MAX_BACKOFF_MS);
    // Backoff is calculated from the last failure timestamp
    nextAllowedAt = now + backoffMs;
  }

  return {
    failures: updatedFailures,
    nextAllowedAt,
  };
}

/**
 * Checks whether a login attempt is allowed at the given time.
 *
 * @param state - Current throttle state
 * @param now - Current timestamp in ms
 * @returns `{ ok: true, waitMs: 0 }` if allowed, or `{ ok: false, waitMs }` with remaining wait
 */
export function canAttempt(state: ThrottleState, now: number): { ok: boolean; waitMs: number } {
  if (state.nextAllowedAt <= 0 || now >= state.nextAllowedAt) {
    return { ok: true, waitMs: 0 };
  }

  const waitMs = state.nextAllowedAt - now;
  return { ok: false, waitMs };
}
