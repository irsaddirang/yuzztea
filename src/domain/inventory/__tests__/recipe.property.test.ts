/**
 * Property-based tests for Recipe Engine, Stock Shortfall, Menu Visibility,
 * and Delete-with-History protection.
 *
 * Uses fast-check with deterministic seed (0xC0FFEE) for reproducibility.
 *
 * Properties tested:
 * - P3: Stock deduction round-trip with refund
 * - P4: Stock shortfall reporting
 * - P17: Menu availability propagation
 * - P18: Delete-with-history protection
 */

import { describe } from 'vitest';

import { canDeleteMenuItem } from '../deleteWithHistory';
import {
  isVisibleInPos,
  effectiveMenuList,
  type MenuItem,
  type MenuItemOutletOverride,
  type Outlet,
} from '../menuVisibility';
import {
  requiredMaterials,
  checkAvailability,
  applyDeduction,
  applyRefund,
  type Recipe,
  type StockSnapshot,
} from '../recipeEngine';

import type { CartLine } from '../../cart/cartEngine';

import { fc, runProperty, expect } from '@/test/property';

// ─── Arbitraries ─────────────────────────────────────────────────────────────

/** Generate a valid raw material ID (alphanumeric, 1-10 chars) */
const arbRawMaterialId = fc.stringMatching(/^[a-z0-9]{1,10}$/);

/** Generate a valid menu item ID (alphanumeric, 1-10 chars) */
const arbMenuItemId = fc.stringMatching(/^[a-z0-9]{1,10}$/);

/** Generate a positive quantity (for recipe ingredients) */
const arbQtyPerUnit = fc.double({ min: 0.01, max: 999_999.99, noNaN: true });

/** Generate a non-negative stock quantity */
const arbStockQty = fc.double({ min: 0, max: 999_999.99, noNaN: true });

/** Generate a recipe ingredient */
const arbIngredient = fc.record({
  rawMaterialId: arbRawMaterialId,
  qtyPerUnit: arbQtyPerUnit,
});

/** Generate a recipe with 1-5 ingredients (kept small for performance) */
const arbRecipe = fc.record({
  menuItemId: arbMenuItemId,
  ingredients: fc.array(arbIngredient, { minLength: 1, maxLength: 5 }),
});

/** Generate a cart line */
const arbCartLine = fc.record({
  menuItemId: arbMenuItemId,
  name: fc.string({ minLength: 1, maxLength: 20 }),
  unitPrice: fc.integer({ min: 0, max: 10_000_000 }),
  qty: fc.integer({ min: 1, max: 50 }),
});

/** Generate a required materials record (positive quantities) */
const arbRequired = fc.dictionary(
  arbRawMaterialId,
  fc.double({ min: 0.01, max: 1000, noNaN: true }),
);

/** Generate a MenuItem */
const arbMenuItem = fc.record({
  id: fc.uuid(),
  organizationId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  category: fc.string({ minLength: 1, maxLength: 50 }),
  basePrice: fc.integer({ min: 0, max: 10_000_000 }),
  active: fc.boolean(),
});

/** Generate an Outlet */
const arbOutlet = fc.record({
  id: fc.uuid(),
  organizationId: fc.uuid(),
  active: fc.boolean(),
});

/** Generate a MenuItemOutletOverride */
function arbOverride(menuItemId: string, outletId: string): fc.Arbitrary<MenuItemOutletOverride> {
  return fc.record({
    menuItemId: fc.constant(menuItemId),
    outletId: fc.constant(outletId),
    priceOverride: fc.option(fc.integer({ min: 0, max: 10_000_000 }), { nil: null }),
    activeOverride: fc.option(fc.boolean(), { nil: null }),
  });
}

// ─── Property 3: Stock deduction round-trip with refund ──────────────────────

describe('Property 3: Stock deduction round-trip with refund', () => {
  /**
   * **Validates: Requirements 6.4, 7.7, 7.10**
   *
   * For any stock snapshot and required materials,
   * applyRefund(applyDeduction(stock, req), req) === stock for all keys.
   */
  runProperty(
    'applyRefund(applyDeduction(stock, req), req) restores original stock for all keys',
    fc.property(arbRequired, fc.dictionary(arbRawMaterialId, arbStockQty), (required, stock) => {
      const afterDeduction = applyDeduction(stock, required);
      const afterRefund = applyRefund(afterDeduction, required);

      // All original stock keys must be restored
      for (const key of Object.keys(stock)) {
        expect(afterRefund[key]).toBeCloseTo(stock[key], 8);
      }

      // Keys introduced by required but not in original stock should be back to 0
      for (const key of Object.keys(required)) {
        if (!(key in stock)) {
          expect(afterRefund[key]).toBeCloseTo(0, 8);
        }
      }
    }),
    100,
  );

  runProperty(
    'round-trip holds when using requiredMaterials from recipes and cart lines',
    fc.property(
      fc.array(arbRecipe, { minLength: 1, maxLength: 5 }),
      fc.array(arbCartLine, { minLength: 1, maxLength: 10 }),
      fc.dictionary(arbRawMaterialId, arbStockQty),
      (recipes, lines, stock) => {
        const required = requiredMaterials(recipes, lines);
        const afterDeduction = applyDeduction(stock, required);
        const afterRefund = applyRefund(afterDeduction, required);

        // All original stock keys must be restored
        for (const key of Object.keys(stock)) {
          expect(afterRefund[key]).toBeCloseTo(stock[key], 8);
        }

        // Keys introduced by required but not in original stock should be back to 0
        for (const key of Object.keys(required)) {
          if (!(key in stock)) {
            expect(afterRefund[key]).toBeCloseTo(0, 8);
          }
        }
      },
    ),
    100,
  );
});

// ─── Property 4: Stock shortfall reporting ───────────────────────────────────

describe('Property 4: Stock shortfall reporting', () => {
  /**
   * **Validates: Requirements 6.9**
   *
   * checkAvailability returns shortfall iff required > available,
   * with correct shortBy = required - available.
   */
  runProperty(
    'returns shortfall entry iff required > available with correct shortBy',
    fc.property(arbRequired, fc.dictionary(arbRawMaterialId, arbStockQty), (required, stock) => {
      const shortfalls = checkAvailability(required, stock);

      for (const [rawMaterialId, requiredQty] of Object.entries(required)) {
        const available = stock[rawMaterialId] ?? 0;
        const entry = shortfalls.find((s) => s.rawMaterialId === rawMaterialId);

        if (requiredQty > available) {
          // Must have a shortfall entry
          expect(entry).toBeDefined();
          expect(entry!.required).toBe(requiredQty);
          expect(entry!.available).toBe(available);
          expect(entry!.shortBy).toBeCloseTo(requiredQty - available, 8);
        } else {
          // Must NOT have a shortfall entry
          expect(entry).toBeUndefined();
        }
      }

      // No shortfall entries for materials not in required
      for (const entry of shortfalls) {
        expect(entry.rawMaterialId in required).toBe(true);
      }
    }),
    100,
  );

  runProperty(
    'shortfall list is empty when all required <= available',
    fc.property(fc.array(arbRawMaterialId, { minLength: 1, maxLength: 5 }), (ids) => {
      const uniqueIds = [...new Set(ids)];
      // Generate stock that is always >= required
      const required: Record<string, number> = {};
      const stock: StockSnapshot = {};
      for (const id of uniqueIds) {
        const req = Math.random() * 100;
        required[id] = req;
        stock[id] = req + Math.random() * 100; // always >= required
      }

      const shortfalls = checkAvailability(required, stock);
      expect(shortfalls).toHaveLength(0);
    }),
    100,
  );
});

// ─── Property 17: Menu availability propagation ──────────────────────────────

describe('Property 17: Menu availability propagation', () => {
  /**
   * **Validates: Requirements 3.4, 5.3, 5.5**
   *
   * effectiveMenuList only includes items where isVisibleInPos is true.
   */
  runProperty(
    'effectiveMenuList only includes items where isVisibleInPos returns true',
    fc.property(
      fc.array(arbMenuItem, { minLength: 0, maxLength: 10 }),
      arbOutlet,
      (menus, outlet) => {
        // Ensure menus belong to same org as outlet for meaningful test
        const orgId = outlet.organizationId;
        const adjustedMenus: MenuItem[] = menus.map((m) => ({
          ...m,
          organizationId: orgId,
        }));

        // Generate overrides for some items
        const overrides: MenuItemOutletOverride[] = adjustedMenus
          .filter((_, i) => i % 2 === 0)
          .map((m) => ({
            menuItemId: m.id,
            outletId: outlet.id,
            priceOverride: null,
            activeOverride: null,
          }));

        const result = effectiveMenuList(adjustedMenus, overrides, outlet);

        // Every item in result must pass isVisibleInPos
        for (const item of result) {
          const menu = adjustedMenus.find((m) => m.id === item.id)!;
          const override = overrides.find(
            (o) => o.menuItemId === menu.id && o.outletId === outlet.id,
          );
          expect(isVisibleInPos(menu, override, outlet)).toBe(true);
        }

        // Every item NOT in result that is in adjustedMenus must fail isVisibleInPos
        const resultIds = new Set(result.map((r) => r.id));
        for (const menu of adjustedMenus) {
          if (!resultIds.has(menu.id)) {
            const override = overrides.find(
              (o) => o.menuItemId === menu.id && o.outletId === outlet.id,
            );
            expect(isVisibleInPos(menu, override, outlet)).toBe(false);
          }
        }
      },
    ),
    100,
  );

  runProperty(
    'items with activeOverride=false are excluded even if global active=true',
    fc.property(arbMenuItem, arbOutlet, (menu, outlet) => {
      // Force conditions for visibility except activeOverride
      const adjustedMenu: MenuItem = {
        ...menu,
        organizationId: outlet.organizationId,
        active: true,
      };
      const activeOutlet: Outlet = { ...outlet, active: true };
      const override: MenuItemOutletOverride = {
        menuItemId: adjustedMenu.id,
        outletId: activeOutlet.id,
        priceOverride: null,
        activeOverride: false,
      };

      expect(isVisibleInPos(adjustedMenu, override, activeOutlet)).toBe(false);

      const result = effectiveMenuList([adjustedMenu], [override], activeOutlet);
      expect(result).toHaveLength(0);
    }),
    100,
  );

  runProperty(
    'inactive outlet always produces empty menu list',
    fc.property(
      fc.array(arbMenuItem, { minLength: 1, maxLength: 5 }),
      arbOutlet,
      (menus, outlet) => {
        const inactiveOutlet: Outlet = { ...outlet, active: false };
        const adjustedMenus = menus.map((m) => ({
          ...m,
          organizationId: inactiveOutlet.organizationId,
          active: true,
        }));

        const result = effectiveMenuList(adjustedMenus, [], inactiveOutlet);
        expect(result).toHaveLength(0);
      },
    ),
    100,
  );
});

// ─── Property 18: Delete-with-history protection ─────────────────────────────

describe('Property 18: Delete-with-history protection', () => {
  /**
   * **Validates: Requirements 5.8**
   *
   * canDeleteMenuItem returns error iff transactionCount > 0.
   */
  runProperty(
    'canDeleteMenuItem returns error iff transactionCount > 0',
    fc.property(fc.uuid(), fc.nat({ max: 1000 }), (menuItemId, transactionCount) => {
      const result = canDeleteMenuItem(menuItemId, transactionCount);

      if (transactionCount > 0) {
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe('MENU_HAS_TX_HISTORY');
        }
      } else {
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value).toBe(true);
        }
      }
    }),
    100,
  );

  runProperty(
    'canDeleteMenuItem always allows deletion when transactionCount is 0',
    fc.property(fc.uuid(), (menuItemId) => {
      const result = canDeleteMenuItem(menuItemId, 0);
      expect(result).toEqual({ ok: true, value: true });
    }),
    100,
  );

  runProperty(
    'canDeleteMenuItem always rejects deletion when transactionCount >= 1',
    fc.property(
      fc.uuid(),
      fc.integer({ min: 1, max: 1_000_000 }),
      (menuItemId, transactionCount) => {
        const result = canDeleteMenuItem(menuItemId, transactionCount);
        expect(result).toEqual({ ok: false, error: 'MENU_HAS_TX_HISTORY' });
      },
    ),
    100,
  );
});
