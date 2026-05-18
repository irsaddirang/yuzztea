import { describe, it, expect } from 'vitest';

import {
  addLine,
  setQty,
  removeLine,
  computeTotals,
  type CartLine,
  type Discount,
  type TaxRule,
} from '../cartEngine';

/**
 * Edge case tests for CartEngine.
 * Validates: Requirements 7.2
 */
describe('cartEngine edge cases', () => {
  const taxDisabled: TaxRule = { enabled: false, ratePercent: 0 };
  const tax10: TaxRule = { enabled: true, ratePercent: 10 };

  describe('empty cart (0 lines)', () => {
    it('subtotal=0, discount=0, tax=0, total=0 with no discount and tax disabled', () => {
      const totals = computeTotals([], null, taxDisabled);
      expect(totals.subtotal).toBe(0);
      expect(totals.discount).toBe(0);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(0);
    });

    it('subtotal=0, discount=0, tax=0, total=0 even with tax enabled', () => {
      const totals = computeTotals([], null, tax10);
      expect(totals.subtotal).toBe(0);
      expect(totals.discount).toBe(0);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(0);
    });

    it('subtotal=0, discount=0, tax=0, total=0 with amount discount applied', () => {
      const discount: Discount = { kind: 'amount', value: 5000 };
      const totals = computeTotals([], discount, tax10);
      expect(totals.subtotal).toBe(0);
      expect(totals.discount).toBe(5000);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(0);
    });
  });

  describe('discount amount > subtotal → total = 0 (not negative)', () => {
    it('amount discount exceeding subtotal results in total 0', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 3000, qty: 1 }];
      const discount: Discount = { kind: 'amount', value: 10000 };
      const totals = computeTotals(lines, discount, taxDisabled);
      expect(totals.subtotal).toBe(3000);
      expect(totals.total).toBe(0);
    });

    it('amount discount exceeding subtotal with tax enabled still results in total 0', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 3000, qty: 1 }];
      const discount: Discount = { kind: 'amount', value: 10000 };
      const totals = computeTotals(lines, discount, tax10);
      expect(totals.subtotal).toBe(3000);
      // taxableBase = max(0, 3000 - 10000) = 0
      // tax = floor(0 * 10 / 100) = 0
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(0);
    });
  });

  describe('discount percent 100% → total = 0', () => {
    it('100% discount zeroes out the total', () => {
      const lines: CartLine[] = [
        { menuItemId: 'a', name: 'Teh Original', unitPrice: 8000, qty: 2 },
        { menuItemId: 'b', name: 'Teh Lemon', unitPrice: 10000, qty: 1 },
      ];
      const discount: Discount = { kind: 'percent', value: 100 };
      const totals = computeTotals(lines, discount, taxDisabled);
      expect(totals.subtotal).toBe(26000);
      expect(totals.discount).toBe(26000);
      expect(totals.total).toBe(0);
    });

    it('100% discount with tax enabled still results in total 0', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 15000, qty: 1 }];
      const discount: Discount = { kind: 'percent', value: 100 };
      const totals = computeTotals(lines, discount, tax10);
      expect(totals.subtotal).toBe(15000);
      expect(totals.discount).toBe(15000);
      // taxableBase = max(0, 15000 - 15000) = 0
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(0);
    });
  });

  describe('tax disabled → tax = 0 regardless of rate', () => {
    it('tax is 0 even with high rate when disabled', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 50000, qty: 3 }];
      const taxHighButDisabled: TaxRule = { enabled: false, ratePercent: 25 };
      const totals = computeTotals(lines, null, taxHighButDisabled);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(150000);
    });

    it('tax is 0 with rate 100% when disabled', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 10000, qty: 1 }];
      const taxMaxDisabled: TaxRule = { enabled: false, ratePercent: 100 };
      const totals = computeTotals(lines, null, taxMaxDisabled);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(10000);
    });
  });

  describe('adding 101st line → rejected (returns same array)', () => {
    it('rejects the 101st distinct line item', () => {
      const lines: CartLine[] = Array.from({ length: 100 }, (_, i) => ({
        menuItemId: `item-${i}`,
        name: `Item ${i}`,
        unitPrice: 1000,
        qty: 1,
      }));
      const result = addLine(lines, { menuItemId: 'item-100', name: 'Item 100', unitPrice: 2000 });
      expect(result).toHaveLength(100);
      expect(result).toEqual(lines);
    });

    it('still allows incrementing existing item at capacity', () => {
      const lines: CartLine[] = Array.from({ length: 100 }, (_, i) => ({
        menuItemId: `item-${i}`,
        name: `Item ${i}`,
        unitPrice: 1000,
        qty: 1,
      }));
      const result = addLine(lines, { menuItemId: 'item-50', name: 'Item 50', unitPrice: 1000 });
      expect(result).toHaveLength(100);
      expect(result[50]!.qty).toBe(2);
    });
  });

  describe('setQty to 0 → removes line', () => {
    it('removes the line when qty set to 0', () => {
      const lines: CartLine[] = [
        { menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 3 },
        { menuItemId: 'b', name: 'Kopi', unitPrice: 8000, qty: 1 },
      ];
      const result = setQty(lines, 'a', 0);
      expect(result).toHaveLength(1);
      expect(result[0]!.menuItemId).toBe('b');
    });

    it('removes the only line when qty set to 0, resulting in empty cart', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 5 }];
      const result = setQty(lines, 'a', 0);
      expect(result).toHaveLength(0);
    });
  });

  describe('removeLine for non-existent menuItemId → no change', () => {
    it('returns unchanged array when removing non-existent item from populated cart', () => {
      const lines: CartLine[] = [
        { menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 1 },
        { menuItemId: 'b', name: 'Kopi', unitPrice: 8000, qty: 2 },
      ];
      const result = removeLine(lines, 'nonexistent-id');
      expect(result).toHaveLength(2);
      expect(result).toEqual(lines);
    });

    it('returns empty array when removing from empty cart', () => {
      const result = removeLine([], 'nonexistent-id');
      expect(result).toHaveLength(0);
    });
  });
});
