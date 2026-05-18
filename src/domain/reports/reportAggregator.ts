/**
 * Report Aggregator — pure functions for sales report computation.
 *
 * - aggregate: computes total, count, average, and breakdown by payment method
 * - topN: returns top N items sorted by quantity desc with deterministic tie-break (A-Z, locale id-ID)
 *
 * Validates: Requirements 9.1, 9.4, 9.6, 9.7
 * Properties: 19 (Report aggregation linearity), 20 (Top-N selection determinism)
 */

import type { PaymentMethod } from '@/domain/validators';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReportTransaction = {
  total: number;
  paymentMethod: PaymentMethod;
};

export interface AggregateResult {
  total: number;
  count: number;
  average: number;
  byMethod: Record<PaymentMethod, number>;
}

export type TopNItem = {
  name: string;
  quantity: number;
};

// ─── Aggregate ───────────────────────────────────────────────────────────────

/**
 * Aggregate a list of transactions into summary metrics.
 *
 * - total: sum of all transaction totals (Rupiah integer)
 * - count: number of transactions
 * - average: total / count rounded to 2 decimal places; 0 if count is 0
 * - byMethod: breakdown of total per payment method
 *
 * Handles empty array gracefully: returns zeros and empty method breakdown.
 *
 * Property 19: aggregate is linear — aggregate(T1 ∪ T2).total = aggregate(T1).total + aggregate(T2).total
 */
export function aggregate(transactions: ReportTransaction[]): AggregateResult {
  const byMethod: Record<PaymentMethod, number> = {
    tunai: 0,
    qris: 0,
    transfer: 0,
  };

  let total = 0;
  const count = transactions.length;

  for (const tx of transactions) {
    total += tx.total;
    byMethod[tx.paymentMethod] += tx.total;
  }

  const average = count === 0 ? 0 : Math.round((total / count) * 100) / 100;

  return { total, count, average, byMethod };
}

// ─── Top N ───────────────────────────────────────────────────────────────────

/**
 * Return the top N items sorted by quantity descending.
 * Tie-break: name ascending (A-Z) using locale 'id-ID' comparison.
 *
 * Property 20: output is deterministic for any permutation of the same input.
 *
 * @param items - list of (name, quantity) pairs
 * @param n - number of top items to return (default 5)
 * @returns at most n items, sorted by quantity desc then name asc (locale id-ID)
 */
export function topN(items: TopNItem[], n: number = 5): TopNItem[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    // Primary: quantity descending
    if (b.quantity !== a.quantity) {
      return b.quantity - a.quantity;
    }
    // Tie-break: name ascending, locale id-ID
    return a.name.localeCompare(b.name, 'id-ID');
  });

  return sorted.slice(0, n);
}
