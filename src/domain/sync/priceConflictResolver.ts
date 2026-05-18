/**
 * Price Conflict Resolver — pure function for offline sync price conflict detection.
 *
 * When a transaction created offline is synced back to Supabase, the menu prices
 * may have changed since the transaction was created. This module compares local
 * transaction line prices against current menu prices and determines the sync status.
 *
 * Rules (Req 11.5, Property 12):
 * - If ALL line item prices match current menu prices → status "confirmed"
 * - If ANY line item price differs → status "conflict_review", keeping local prices
 *   (the price at the time the transaction was created at the outlet)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type TransactionLine = {
  menuItemId: string;
  unitPrice: number;
};

export type LocalTransaction = {
  id: string;
  lines: TransactionLine[];
};

/**
 * Map of menuItemId → current price (integer Rupiah) from Supabase.
 */
export type CurrentMenuPrices = Record<string, number>;

export type SyncResolution =
  | { status: 'confirmed' }
  | { status: 'conflict_review'; conflictingItems: ConflictDetail[] };

export type ConflictDetail = {
  menuItemId: string;
  localPrice: number;
  currentPrice: number;
};

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * Resolve sync status by comparing local transaction line prices with current menu prices.
 *
 * - If all line prices match → { status: 'confirmed' }
 * - If any line price differs → { status: 'conflict_review', conflictingItems }
 *
 * The local transaction's unitPrice values are NEVER mutated — the transaction
 * is always stored with the price at the time it was created (Req 11.5).
 *
 * @param localTx - The locally-created transaction with line items
 * @param currentMenuPrices - Map of menuItemId → current price from server
 * @returns SyncResolution indicating whether the transaction is confirmed or needs review
 */
export function resolveSync(
  localTx: LocalTransaction,
  currentMenuPrices: CurrentMenuPrices,
): SyncResolution {
  const conflicts: ConflictDetail[] = [];

  for (const line of localTx.lines) {
    const currentPrice = currentMenuPrices[line.menuItemId];

    // If the menu item exists in current prices and the price differs, it's a conflict
    if (currentPrice !== undefined && line.unitPrice !== currentPrice) {
      conflicts.push({
        menuItemId: line.menuItemId,
        localPrice: line.unitPrice,
        currentPrice,
      });
    }
  }

  if (conflicts.length === 0) {
    return { status: 'confirmed' };
  }

  return { status: 'conflict_review', conflictingItems: conflicts };
}
