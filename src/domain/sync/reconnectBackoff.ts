/**
 * Reconnect Backoff — pure function for realtime connection retry scheduling.
 *
 * When the realtime WebSocket connection drops, the client retries with
 * exponential backoff capped at 30 seconds, for a maximum of 10 attempts.
 * After 10 consecutive failures (regardless of failure type), the state machine
 * transitions to `disconnected_terminal` and stops automatic retries.
 *
 * Schedule (Req 10.4): [1s, 2s, 4s, 8s, 16s, 30s, 30s, 30s, 30s, 30s]
 * After attempt 10 (Req 10.5): null → disconnected_terminal
 *
 * Property 9: Reconnect backoff schedule
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Base delay in milliseconds (1 second). */
const BASE_DELAY_MS = 1000;

/** Maximum delay cap in milliseconds (30 seconds). */
const MAX_DELAY_MS = 30_000;

/** Maximum number of automatic reconnect attempts before giving up. */
const MAX_ATTEMPTS = 10;

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * Calculate the next reconnect delay for a given attempt number.
 *
 * - For attempts 1..10: returns delay in ms following exponential backoff
 *   capped at 30_000 ms → [1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000]
 * - For attempts > 10: returns `null`, signaling the state machine should
 *   transition to `disconnected_terminal` (Req 10.5).
 *
 * The transition to `disconnected_terminal` is purely driven by the number of
 * consecutive automatic attempts reaching 10, without distinguishing failure type
 * (timeout, auth error, server shutdown, invalid payload, etc.) — Req 10.5.
 *
 * @param attempt - The attempt number (1-based). Must be a positive integer.
 * @returns Delay in milliseconds, or `null` if max attempts exceeded.
 */
export function nextReconnectDelay(attempt: number): number | null {
  if (attempt < 1 || !Number.isInteger(attempt)) {
    return null;
  }

  if (attempt > MAX_ATTEMPTS) {
    return null;
  }

  // Exponential backoff: BASE_DELAY_MS * 2^(attempt-1), capped at MAX_DELAY_MS
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt - 1), MAX_DELAY_MS);

  return delay;
}
