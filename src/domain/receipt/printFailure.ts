/**
 * Print Failure Handler — pure function for handling printer failures.
 *
 * When a printer is unavailable or times out, this module provides a fallback
 * action (save as PDF) WITHOUT modifying the transaction status.
 *
 * Validates: Requirements 8.5 (Property 15)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Minimal transaction shape needed for print failure handling.
 * Uses a generic to preserve the exact transaction type passed in.
 */
export type TransactionWithStatus = {
  status: string;
  [key: string]: unknown;
};

export type PrintFailureResult<T extends TransactionWithStatus> = {
  tx: T;
  action: 'savePdf';
};

// ─── Print Failure Handler ───────────────────────────────────────────────────

/**
 * Handle a print failure event (printer timeout or unavailable).
 *
 * Returns the transaction unchanged (status preserved) with a fallback action
 * of 'savePdf'. This function NEVER modifies tx.status (Property 15).
 *
 * Validates: Req 8.5
 */
export function handlePrintFailure<T extends TransactionWithStatus>(tx: T): PrintFailureResult<T> {
  return {
    tx,
    action: 'savePdf',
  };
}
