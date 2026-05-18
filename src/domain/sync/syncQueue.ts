/**
 * Sync Queue — pure functions for managing the offline pending transaction queue.
 *
 * When the POS is offline, transactions are queued locally with status "pending_sync".
 * This module provides immutable operations to manage that queue:
 * - enqueue: add a transaction (cap 500 per device, Req 11.2, 11.6)
 * - nextBatch: retrieve transactions sorted by createdAt ascending for FIFO sync (Req 11.3)
 * - shouldRetry: check if a transaction is eligible for retry (retryCount < 5, Req 11.4)
 * - markRetry: increment retryCount capped at 5 (Req 11.4)
 * - markFailed: set the failed flag on a transaction after exhausting retries
 *
 * Property 11: Sync queue invariants
 * Validates: Requirements 11.2, 11.3, 11.4, 11.6, 11.7
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum number of pending transactions per device (Req 11.2, 11.6) */
export const MAX_QUEUE_SIZE = 500;

/** Maximum retry attempts before a transaction is considered failed (Req 11.4) */
export const MAX_RETRY_COUNT = 5;

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Represents a transaction waiting to be synced to the server.
 */
export type PendingTx = {
  /** Unique transaction ID (UUIDv7, client-generated) */
  id: string;
  /** ISO 8601 timestamp of when the transaction was created at the outlet */
  createdAt: string;
  /** The transaction draft payload to be synced */
  payload: unknown;
  /** Number of sync retry attempts made (0..5) */
  retryCount: number;
  /** Whether the transaction has been marked as permanently failed */
  failed: boolean;
};

// ─── Result Types ────────────────────────────────────────────────────────────

export type EnqueueResult = { ok: true; queue: PendingTx[] } | { ok: false; reason: 'QUEUE_FULL' };

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Add a transaction to the pending sync queue.
 *
 * Rules:
 * - If queue.length >= 500, rejects with reason 'QUEUE_FULL' (Req 11.6)
 * - Otherwise appends the transaction and returns the new queue
 *
 * @param queue - Current pending sync queue
 * @param tx - Transaction to enqueue
 * @returns EnqueueResult with the updated queue or rejection reason
 */
export function enqueue(queue: PendingTx[], tx: PendingTx): EnqueueResult {
  if (queue.length >= MAX_QUEUE_SIZE) {
    return { ok: false, reason: 'QUEUE_FULL' };
  }

  return { ok: true, queue: [...queue, tx] };
}

/**
 * Get the next batch of transactions to sync, sorted by createdAt ascending (FIFO).
 *
 * Returns all non-failed transactions in the queue sorted by creation time,
 * ensuring sequential sync order as required by Req 11.3.
 *
 * @param queue - Current pending sync queue
 * @returns Transactions sorted by createdAt ascending, excluding failed ones
 */
export function nextBatch(queue: PendingTx[]): PendingTx[] {
  return [...queue]
    .filter((tx) => !tx.failed)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * Determine if a transaction is eligible for retry.
 *
 * A transaction can be retried if its retryCount is strictly less than 5 (Req 11.4).
 *
 * @param tx - The transaction to check
 * @returns true if retryCount < 5, false otherwise
 */
export function shouldRetry(tx: PendingTx): boolean {
  return tx.retryCount < MAX_RETRY_COUNT;
}

/**
 * Increment the retry count of a transaction, capped at MAX_RETRY_COUNT (5).
 *
 * The retry counter never increases above 5 (Req 11.4):
 * retryCount' = min(retryCount + 1, 5)
 *
 * @param tx - The transaction to mark as retried
 * @returns A new PendingTx with incremented retryCount (capped at 5)
 */
export function markRetry(tx: PendingTx): PendingTx {
  return {
    ...tx,
    retryCount: Math.min(tx.retryCount + 1, MAX_RETRY_COUNT),
  };
}

/**
 * Mark a transaction as permanently failed after exhausting retries.
 *
 * Sets the failed flag to true. This transaction will be excluded from
 * nextBatch results and moved to the failed_sync store.
 *
 * @param tx - The transaction to mark as failed
 * @returns A new PendingTx with failed = true
 */
export function markFailed(tx: PendingTx): PendingTx {
  return {
    ...tx,
    failed: true,
  };
}
