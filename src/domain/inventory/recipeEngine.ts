/**
 * Recipe Engine — pure functions for stock requirement calculation and mutation.
 *
 * Determines raw material needs from cart lines × recipes, checks availability,
 * and produces stock snapshots after deduction or refund.
 *
 * Stock can go negative after deduction (Req 6.9 — stok minus diizinkan).
 * applyRefund is the exact inverse of applyDeduction (Property 3 round-trip).
 *
 * Validates: Requirements 6.4, 6.9, 7.7, 7.10
 */

import type { CartLine } from '../cart/cartEngine';

// ─── Types ───────────────────────────────────────────────────────────────────

export type Recipe = {
  menuItemId: string;
  ingredients: { rawMaterialId: string; qtyPerUnit: number }[];
};

/** Maps rawMaterialId → current quantity on hand. */
export type StockSnapshot = Record<string, number>;

export type StockShortfall = {
  rawMaterialId: string;
  required: number;
  available: number;
  shortBy: number;
};

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Aggregate total raw material quantities needed for a set of cart lines
 * based on their recipes.
 *
 * For each cart line, finds the matching recipe and multiplies each ingredient's
 * qtyPerUnit by the line's qty. Results are summed per rawMaterialId across all lines.
 *
 * Cart lines without a matching recipe are ignored (no recipe = no material needed).
 *
 * @param recipes - Available recipe definitions.
 * @param lines - Cart lines with menuItemId and qty.
 * @returns Record mapping rawMaterialId → total quantity required.
 */
export function requiredMaterials(recipes: Recipe[], lines: CartLine[]): Record<string, number> {
  const result: Record<string, number> = {};

  for (const line of lines) {
    const recipe = recipes.find((r) => r.menuItemId === line.menuItemId);
    if (!recipe) continue;

    for (const ingredient of recipe.ingredients) {
      const need = ingredient.qtyPerUnit * line.qty;
      result[ingredient.rawMaterialId] = (result[ingredient.rawMaterialId] ?? 0) + need;
    }
  }

  return result;
}

/**
 * Check stock availability against required materials.
 *
 * Returns a shortfall entry for each rawMaterialId where required > available.
 * Materials with sufficient stock (available >= required) are not included.
 * Materials in `required` but absent from `stock` are treated as available = 0.
 *
 * @param required - Aggregated material requirements (from requiredMaterials).
 * @param stock - Current stock snapshot.
 * @returns Array of shortfall entries (empty if all materials are sufficient).
 */
export function checkAvailability(
  required: Record<string, number>,
  stock: StockSnapshot,
): StockShortfall[] {
  const shortfalls: StockShortfall[] = [];

  for (const [rawMaterialId, requiredQty] of Object.entries(required)) {
    const available = stock[rawMaterialId] ?? 0;
    if (requiredQty > available) {
      shortfalls.push({
        rawMaterialId,
        required: requiredQty,
        available,
        shortBy: requiredQty - available,
      });
    }
  }

  return shortfalls;
}

/**
 * Apply stock deduction: subtract required quantities from stock.
 *
 * Stock CAN go negative (Req 6.9 — stok minus diizinkan saat Cashier melanjutkan
 * transaksi meskipun bahan kurang).
 *
 * Materials in `required` but absent from `stock` start at 0 then go negative.
 * Returns a new StockSnapshot (immutable).
 *
 * @param stock - Current stock snapshot.
 * @param required - Quantities to deduct per rawMaterialId.
 * @returns New stock snapshot after deduction.
 */
export function applyDeduction(
  stock: StockSnapshot,
  required: Record<string, number>,
): StockSnapshot {
  const result: StockSnapshot = { ...stock };

  for (const [rawMaterialId, qty] of Object.entries(required)) {
    result[rawMaterialId] = (result[rawMaterialId] ?? 0) - qty;
  }

  return result;
}

/**
 * Apply stock refund: add required quantities back to stock.
 *
 * This is the exact inverse of applyDeduction — used when a transaction is refunded
 * (Req 7.10) to restore raw materials.
 *
 * Materials in `required` but absent from `stock` start at 0 then increase.
 * Returns a new StockSnapshot (immutable).
 *
 * @param stock - Current stock snapshot.
 * @param required - Quantities to add back per rawMaterialId.
 * @returns New stock snapshot after refund.
 */
export function applyRefund(stock: StockSnapshot, required: Record<string, number>): StockSnapshot {
  const result: StockSnapshot = { ...stock };

  for (const [rawMaterialId, qty] of Object.entries(required)) {
    result[rawMaterialId] = (result[rawMaterialId] ?? 0) + qty;
  }

  return result;
}
