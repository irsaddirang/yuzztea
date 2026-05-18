/**
 * Cart Engine — pure functions for POS cart computation.
 *
 * All monetary amounts are integers (Rupiah).
 * Max 100 line items per cart (Req 7.2).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type CartLine = {
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
};

export type Discount = { kind: 'amount' | 'percent'; value: number };

export type TaxRule = { enabled: boolean; ratePercent: number };

export interface CartTotals {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  changeDue: (amountPaid: number) => number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_LINES = 100;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Clamp a number between min and max (inclusive).
 */
export function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

// ─── Cart Mutation Functions ─────────────────────────────────────────────────

/**
 * Add a line to the cart. If the menuItemId already exists, increment qty by 1.
 * Rejects if cart already has MAX_LINES distinct items and item is new.
 * Returns a new array (immutable).
 */
export function addLine(lines: CartLine[], item: Omit<CartLine, 'qty'>): CartLine[] {
  const existing = lines.find((l) => l.menuItemId === item.menuItemId);
  if (existing) {
    return lines.map((l) => (l.menuItemId === item.menuItemId ? { ...l, qty: l.qty + 1 } : l));
  }
  if (lines.length >= MAX_LINES) {
    return lines; // capacity reached, reject silently
  }
  return [...lines, { ...item, qty: 1 }];
}

/**
 * Set the quantity of a specific line. If qty <= 0, the line is removed.
 * Returns a new array (immutable).
 */
export function setQty(lines: CartLine[], menuItemId: string, qty: number): CartLine[] {
  if (qty <= 0) {
    return removeLine(lines, menuItemId);
  }
  return lines.map((l) => (l.menuItemId === menuItemId ? { ...l, qty } : l));
}

/**
 * Remove a line from the cart by menuItemId.
 * Returns a new array (immutable).
 */
export function removeLine(lines: CartLine[], menuItemId: string): CartLine[] {
  return lines.filter((l) => l.menuItemId !== menuItemId);
}

// ─── Totals Computation ──────────────────────────────────────────────────────

/**
 * Compute cart totals given lines, optional discount, and tax rule.
 *
 * Rules:
 * - subtotal = sum(line.qty * line.unitPrice) — integer
 * - discountAmount = kind 'amount' → value; kind 'percent' → floor(subtotal * value / 100)
 * - taxableBase = max(0, subtotal - discountAmount)
 * - tax = enabled ? floor(taxableBase * ratePercent / 100) : 0
 * - total = taxableBase + tax (always >= 0)
 * - changeDue(amountPaid) = max(0, amountPaid - total)
 */
export function computeTotals(
  lines: CartLine[],
  discount: Discount | null,
  tax: TaxRule,
): CartTotals {
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);

  let discountAmount = 0;
  if (discount) {
    if (discount.kind === 'amount') {
      discountAmount = discount.value;
    } else {
      // percent
      discountAmount = Math.floor((subtotal * discount.value) / 100);
    }
  }

  const taxableBase = Math.max(0, subtotal - discountAmount);
  const taxAmount = tax.enabled ? Math.floor((taxableBase * tax.ratePercent) / 100) : 0;
  const total = taxableBase + taxAmount;

  return {
    subtotal,
    discount: discountAmount,
    tax: taxAmount,
    total,
    changeDue: (amountPaid: number) => Math.max(0, amountPaid - total),
  };
}
