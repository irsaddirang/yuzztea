/**
 * Session expiry logic for Yuzztea POS SaaS.
 *
 * A session is considered expired when there has been no user activity
 * for 12 hours (43,200,000 ms).
 *
 * Pure functions only — no side effects.
 *
 * @module domain/auth/sessionExpiry
 * @see Requirements 1.3
 */

/** 12 hours in milliseconds */
export const SESSION_TIMEOUT_MS = 12 * 3600 * 1000; // 43_200_000

/**
 * Determines whether a session has expired due to inactivity.
 *
 * @param lastActivityAt - Timestamp (ms since epoch) of the last user activity
 * @param now - Current timestamp (ms since epoch)
 * @returns `true` if the elapsed time since last activity is >= 12 hours
 */
export function isSessionExpired(lastActivityAt: number, now: number): boolean {
  return now - lastActivityAt >= SESSION_TIMEOUT_MS;
}

/**
 * Minimal session state shape required by the touch helper.
 */
export interface SessionActivityState {
  lastActivityAt: number;
}

/**
 * Returns a new state with `lastActivityAt` updated to `now`.
 * Used to reset the idle timer on user interaction (pointer, key events, etc.).
 *
 * @param state - Current session state containing lastActivityAt
 * @param now - Current timestamp (ms since epoch)
 * @returns A new state object with updated lastActivityAt
 */
export function touchActivity<S extends SessionActivityState>(state: S, now: number): S {
  return { ...state, lastActivityAt: now };
}
