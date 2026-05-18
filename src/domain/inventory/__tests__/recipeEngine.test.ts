import { describe, it, expect } from 'vitest';

import {
  requiredMaterials,
  checkAvailability,
  applyDeduction,
  applyRefund,
  type Recipe,
  type StockSnapshot,
} from '../recipeEngine';

import type { CartLine } from '../../cart/cartEngine';

// ─── Test Data ───────────────────────────────────────────────────────────────

const recipes: Recipe[] = [
  {
    menuItemId: 'es-teh-original',
    ingredients: [
      { rawMaterialId: 'teh-celup', qtyPerUnit: 2 },
      { rawMaterialId: 'gula', qtyPerUnit: 30 },
      { rawMaterialId: 'air', qtyPerUnit: 250 },
      { rawMaterialId: 'cup', qtyPerUnit: 1 },
    ],
  },
  {
    menuItemId: 'es-teh-lemon',
    ingredients: [
      { rawMaterialId: 'teh-celup', qtyPerUnit: 2 },
      { rawMaterialId: 'gula', qtyPerUnit: 25 },
      { rawMaterialId: 'lemon', qtyPerUnit: 1 },
      { rawMaterialId: 'air', qtyPerUnit: 250 },
      { rawMaterialId: 'cup', qtyPerUnit: 1 },
    ],
  },
];

const stock: StockSnapshot = {
  'teh-celup': 100,
  gula: 5000,
  air: 50000,
  cup: 200,
  lemon: 10,
};

// ─── requiredMaterials ───────────────────────────────────────────────────────

describe('requiredMaterials', () => {
  it('aggregates quantities from a single line', () => {
    const lines: CartLine[] = [
      { menuItemId: 'es-teh-original', name: 'Es Teh Original', unitPrice: 5000, qty: 3 },
    ];
    const result = requiredMaterials(recipes, lines);
    expect(result).toEqual({
      'teh-celup': 6, // 2 * 3
      gula: 90, // 30 * 3
      air: 750, // 250 * 3
      cup: 3, // 1 * 3
    });
  });

  it('aggregates quantities across multiple lines sharing ingredients', () => {
    const lines: CartLine[] = [
      { menuItemId: 'es-teh-original', name: 'Es Teh Original', unitPrice: 5000, qty: 2 },
      { menuItemId: 'es-teh-lemon', name: 'Es Teh Lemon', unitPrice: 7000, qty: 1 },
    ];
    const result = requiredMaterials(recipes, lines);
    expect(result).toEqual({
      'teh-celup': 6, // (2*2) + (2*1)
      gula: 85, // (30*2) + (25*1)
      air: 750, // (250*2) + (250*1)
      cup: 3, // (1*2) + (1*1)
      lemon: 1, // (1*1)
    });
  });

  it('returns empty record for empty cart', () => {
    expect(requiredMaterials(recipes, [])).toEqual({});
  });

  it('ignores cart lines without a matching recipe', () => {
    const lines: CartLine[] = [
      { menuItemId: 'unknown-item', name: 'Unknown', unitPrice: 3000, qty: 5 },
    ];
    expect(requiredMaterials(recipes, lines)).toEqual({});
  });

  it('ignores cart lines without recipe while aggregating others', () => {
    const lines: CartLine[] = [
      { menuItemId: 'es-teh-original', name: 'Es Teh Original', unitPrice: 5000, qty: 1 },
      { menuItemId: 'no-recipe', name: 'No Recipe', unitPrice: 2000, qty: 10 },
    ];
    const result = requiredMaterials(recipes, lines);
    expect(result).toEqual({
      'teh-celup': 2,
      gula: 30,
      air: 250,
      cup: 1,
    });
  });
});

// ─── checkAvailability ───────────────────────────────────────────────────────

describe('checkAvailability', () => {
  it('returns empty array when all materials are sufficient', () => {
    const required = { 'teh-celup': 10, gula: 100, air: 500, cup: 5 };
    expect(checkAvailability(required, stock)).toEqual([]);
  });

  it('returns shortfall for materials where required > available', () => {
    const required = { 'teh-celup': 150, lemon: 15 };
    const shortfalls = checkAvailability(required, stock);
    expect(shortfalls).toHaveLength(2);
    expect(shortfalls).toContainEqual({
      rawMaterialId: 'teh-celup',
      required: 150,
      available: 100,
      shortBy: 50,
    });
    expect(shortfalls).toContainEqual({
      rawMaterialId: 'lemon',
      required: 15,
      available: 10,
      shortBy: 5,
    });
  });

  it('treats missing stock entries as available = 0', () => {
    const required = { 'non-existent': 5 };
    const shortfalls = checkAvailability(required, stock);
    expect(shortfalls).toEqual([
      { rawMaterialId: 'non-existent', required: 5, available: 0, shortBy: 5 },
    ]);
  });

  it('returns empty array for empty requirements', () => {
    expect(checkAvailability({}, stock)).toEqual([]);
  });

  it('does not report shortfall when required equals available', () => {
    const required = { 'teh-celup': 100 }; // exactly equal
    expect(checkAvailability(required, stock)).toEqual([]);
  });
});

// ─── applyDeduction ──────────────────────────────────────────────────────────

describe('applyDeduction', () => {
  it('subtracts required quantities from stock', () => {
    const required = { 'teh-celup': 10, gula: 200 };
    const result = applyDeduction(stock, required);
    expect(result['teh-celup']).toBe(90);
    expect(result['gula']).toBe(4800);
    // Other materials unchanged
    expect(result['air']).toBe(50000);
    expect(result['cup']).toBe(200);
    expect(result['lemon']).toBe(10);
  });

  it('allows stock to go negative (Req 6.9)', () => {
    const required = { 'teh-celup': 150 }; // stock is 100
    const result = applyDeduction(stock, required);
    expect(result['teh-celup']).toBe(-50);
  });

  it('handles materials not in stock (starts at 0)', () => {
    const required = { 'new-material': 5 };
    const result = applyDeduction(stock, required);
    expect(result['new-material']).toBe(-5);
  });

  it('does not mutate original stock', () => {
    const original = { ...stock };
    applyDeduction(stock, { 'teh-celup': 10 });
    expect(stock).toEqual(original);
  });

  it('returns unchanged stock for empty requirements', () => {
    const result = applyDeduction(stock, {});
    expect(result).toEqual(stock);
  });
});

// ─── applyRefund ─────────────────────────────────────────────────────────────

describe('applyRefund', () => {
  it('adds required quantities back to stock', () => {
    const required = { 'teh-celup': 10, gula: 200 };
    const result = applyRefund(stock, required);
    expect(result['teh-celup']).toBe(110);
    expect(result['gula']).toBe(5200);
  });

  it('handles materials not in stock (starts at 0)', () => {
    const required = { 'new-material': 5 };
    const result = applyRefund(stock, required);
    expect(result['new-material']).toBe(5);
  });

  it('does not mutate original stock', () => {
    const original = { ...stock };
    applyRefund(stock, { 'teh-celup': 10 });
    expect(stock).toEqual(original);
  });

  it('returns unchanged stock for empty requirements', () => {
    const result = applyRefund(stock, {});
    expect(result).toEqual(stock);
  });
});

// ─── Round-trip Property (Property 3) ────────────────────────────────────────

describe('deduction + refund round-trip', () => {
  it('refund after deduction restores original stock', () => {
    const lines: CartLine[] = [
      { menuItemId: 'es-teh-original', name: 'Es Teh Original', unitPrice: 5000, qty: 5 },
      { menuItemId: 'es-teh-lemon', name: 'Es Teh Lemon', unitPrice: 7000, qty: 3 },
    ];
    const required = requiredMaterials(recipes, lines);
    const afterDeduction = applyDeduction(stock, required);
    const afterRefund = applyRefund(afterDeduction, required);

    // Should be identical to original stock for all keys
    for (const key of Object.keys(stock)) {
      expect(afterRefund[key]).toBe(stock[key]);
    }
  });

  it('round-trip works even when deduction causes negative stock', () => {
    const lowStock: StockSnapshot = { 'teh-celup': 2, gula: 10 };
    const lines: CartLine[] = [
      { menuItemId: 'es-teh-original', name: 'Es Teh Original', unitPrice: 5000, qty: 10 },
    ];
    const required = requiredMaterials(recipes, lines);
    const afterDeduction = applyDeduction(lowStock, required);

    // Stock goes negative
    expect(afterDeduction['teh-celup']).toBe(-18); // 2 - 20
    expect(afterDeduction['gula']).toBe(-290); // 10 - 300

    const afterRefund = applyRefund(afterDeduction, required);
    expect(afterRefund['teh-celup']).toBe(2);
    expect(afterRefund['gula']).toBe(10);
  });
});
