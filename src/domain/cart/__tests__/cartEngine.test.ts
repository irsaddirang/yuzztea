import { describe, it, expect } from 'vitest';

import {
  addLine,
  setQty,
  removeLine,
  clamp,
  computeTotals,
  type CartLine,
  type Discount,
  type TaxRule,
} from '../cartEngine';

describe('cartEngine', () => {
  const taxDisabled: TaxRule = { enabled: false, ratePercent: 0 };
  const tax10: TaxRule = { enabled: true, ratePercent: 10 };

  describe('clamp', () => {
    it('returns min when n < min', () => {
      expect(clamp(-5, 0, 100)).toBe(0);
    });

    it('returns max when n > max', () => {
      expect(clamp(150, 0, 100)).toBe(100);
    });

    it('returns n when within range', () => {
      expect(clamp(50, 0, 100)).toBe(50);
    });
  });

  describe('addLine', () => {
    it('adds a new item with qty 1', () => {
      const result = addLine([], { menuItemId: 'a', name: 'Teh', unitPrice: 5000 });
      expect(result).toEqual([{ menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 1 }]);
    });

    it('increments qty if item already exists', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 2 }];
      const result = addLine(lines, { menuItemId: 'a', name: 'Teh', unitPrice: 5000 });
      expect(result[0]!.qty).toBe(3);
    });

    it('rejects new item when cart is at 100 lines', () => {
      const lines: CartLine[] = Array.from({ length: 100 }, (_, i) => ({
        menuItemId: `item-${i}`,
        name: `Item ${i}`,
        unitPrice: 1000,
        qty: 1,
      }));
      const result = addLine(lines, { menuItemId: 'new', name: 'New', unitPrice: 2000 });
      expect(result.length).toBe(100);
    });

    it('still increments existing item even at 100 lines', () => {
      const lines: CartLine[] = Array.from({ length: 100 }, (_, i) => ({
        menuItemId: `item-${i}`,
        name: `Item ${i}`,
        unitPrice: 1000,
        qty: 1,
      }));
      const result = addLine(lines, { menuItemId: 'item-0', name: 'Item 0', unitPrice: 1000 });
      expect(result[0]!.qty).toBe(2);
      expect(result.length).toBe(100);
    });
  });

  describe('setQty', () => {
    it('sets qty to specified value', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 1 }];
      const result = setQty(lines, 'a', 5);
      expect(result[0]!.qty).toBe(5);
    });

    it('removes line when qty is 0', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 3 }];
      const result = setQty(lines, 'a', 0);
      expect(result.length).toBe(0);
    });

    it('removes line when qty is negative', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 3 }];
      const result = setQty(lines, 'a', -1);
      expect(result.length).toBe(0);
    });
  });

  describe('removeLine', () => {
    it('removes the specified line', () => {
      const lines: CartLine[] = [
        { menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 1 },
        { menuItemId: 'b', name: 'Kopi', unitPrice: 8000, qty: 2 },
      ];
      const result = removeLine(lines, 'a');
      expect(result.length).toBe(1);
      expect(result[0]!.menuItemId).toBe('b');
    });

    it('returns same array if menuItemId not found', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 1 }];
      const result = removeLine(lines, 'nonexistent');
      expect(result).toEqual(lines);
    });
  });

  describe('computeTotals', () => {
    it('returns all zeros for empty cart', () => {
      const totals = computeTotals([], null, taxDisabled);
      expect(totals.subtotal).toBe(0);
      expect(totals.discount).toBe(0);
      expect(totals.tax).toBe(0);
      expect(totals.total).toBe(0);
    });

    it('computes subtotal correctly', () => {
      const lines: CartLine[] = [
        { menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 2 },
        { menuItemId: 'b', name: 'Kopi', unitPrice: 8000, qty: 1 },
      ];
      const totals = computeTotals(lines, null, taxDisabled);
      expect(totals.subtotal).toBe(18000); // 5000*2 + 8000*1
      expect(totals.total).toBe(18000);
    });

    it('applies amount discount', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 10000, qty: 1 }];
      const discount: Discount = { kind: 'amount', value: 3000 };
      const totals = computeTotals(lines, discount, taxDisabled);
      expect(totals.subtotal).toBe(10000);
      expect(totals.discount).toBe(3000);
      expect(totals.total).toBe(7000);
    });

    it('applies percent discount with floor', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 10000, qty: 1 }];
      const discount: Discount = { kind: 'percent', value: 15 };
      const totals = computeTotals(lines, discount, taxDisabled);
      expect(totals.discount).toBe(1500); // floor(10000 * 15 / 100)
      expect(totals.total).toBe(8500);
    });

    it('total never goes below 0 when discount > subtotal', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 5000, qty: 1 }];
      const discount: Discount = { kind: 'amount', value: 99999 };
      const totals = computeTotals(lines, discount, taxDisabled);
      expect(totals.total).toBe(0);
    });

    it('computes tax when enabled', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 10000, qty: 1 }];
      const totals = computeTotals(lines, null, tax10);
      // tax = floor(10000 * 10 / 100) = 1000
      expect(totals.tax).toBe(1000);
      expect(totals.total).toBe(11000);
    });

    it('computes tax on discounted base', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 10000, qty: 1 }];
      const discount: Discount = { kind: 'amount', value: 2000 };
      const totals = computeTotals(lines, discount, tax10);
      // taxableBase = max(0, 10000 - 2000) = 8000
      // tax = floor(8000 * 10 / 100) = 800
      expect(totals.tax).toBe(800);
      expect(totals.total).toBe(8800); // 8000 + 800
    });

    it('tax is 0 when disabled', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 10000, qty: 1 }];
      const totals = computeTotals(lines, null, taxDisabled);
      expect(totals.tax).toBe(0);
    });

    it('changeDue returns correct change for cash', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 15000, qty: 1 }];
      const totals = computeTotals(lines, null, taxDisabled);
      expect(totals.changeDue(20000)).toBe(5000);
    });

    it('changeDue returns 0 when paid exactly', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 15000, qty: 1 }];
      const totals = computeTotals(lines, null, taxDisabled);
      expect(totals.changeDue(15000)).toBe(0);
    });

    it('changeDue returns 0 when underpaid (no negative change)', () => {
      const lines: CartLine[] = [{ menuItemId: 'a', name: 'Teh', unitPrice: 15000, qty: 1 }];
      const totals = computeTotals(lines, null, taxDisabled);
      expect(totals.changeDue(10000)).toBe(0);
    });
  });
});
