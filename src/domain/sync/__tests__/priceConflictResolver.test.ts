import { describe, it, expect } from 'vitest';

import {
  resolveSync,
  type LocalTransaction,
  type CurrentMenuPrices,
} from '../priceConflictResolver';

describe('priceConflictResolver', () => {
  describe('resolveSync', () => {
    it('returns confirmed when all line prices match current menu prices', () => {
      const localTx: LocalTransaction = {
        id: 'tx-001',
        lines: [
          { menuItemId: 'item-a', unitPrice: 15000 },
          { menuItemId: 'item-b', unitPrice: 20000 },
        ],
      };
      const currentPrices: CurrentMenuPrices = {
        'item-a': 15000,
        'item-b': 20000,
      };

      const result = resolveSync(localTx, currentPrices);
      expect(result).toEqual({ status: 'confirmed' });
    });

    it('returns conflict_review when any line price differs from current', () => {
      const localTx: LocalTransaction = {
        id: 'tx-002',
        lines: [
          { menuItemId: 'item-a', unitPrice: 15000 },
          { menuItemId: 'item-b', unitPrice: 20000 },
        ],
      };
      const currentPrices: CurrentMenuPrices = {
        'item-a': 15000,
        'item-b': 25000, // price changed
      };

      const result = resolveSync(localTx, currentPrices);
      expect(result).toEqual({
        status: 'conflict_review',
        conflictingItems: [{ menuItemId: 'item-b', localPrice: 20000, currentPrice: 25000 }],
      });
    });

    it('returns confirmed when transaction has no lines', () => {
      const localTx: LocalTransaction = { id: 'tx-003', lines: [] };
      const currentPrices: CurrentMenuPrices = { 'item-a': 10000 };

      const result = resolveSync(localTx, currentPrices);
      expect(result).toEqual({ status: 'confirmed' });
    });

    it('returns confirmed when menu item is not in current prices (new item removed from menu)', () => {
      const localTx: LocalTransaction = {
        id: 'tx-004',
        lines: [{ menuItemId: 'item-removed', unitPrice: 12000 }],
      };
      const currentPrices: CurrentMenuPrices = {};

      const result = resolveSync(localTx, currentPrices);
      expect(result).toEqual({ status: 'confirmed' });
    });

    it('reports multiple conflicts when several prices differ', () => {
      const localTx: LocalTransaction = {
        id: 'tx-005',
        lines: [
          { menuItemId: 'item-a', unitPrice: 10000 },
          { menuItemId: 'item-b', unitPrice: 20000 },
          { menuItemId: 'item-c', unitPrice: 30000 },
        ],
      };
      const currentPrices: CurrentMenuPrices = {
        'item-a': 12000, // changed
        'item-b': 20000, // same
        'item-c': 35000, // changed
      };

      const result = resolveSync(localTx, currentPrices);
      expect(result.status).toBe('conflict_review');
      if (result.status === 'conflict_review') {
        expect(result.conflictingItems).toHaveLength(2);
        expect(result.conflictingItems).toContainEqual({
          menuItemId: 'item-a',
          localPrice: 10000,
          currentPrice: 12000,
        });
        expect(result.conflictingItems).toContainEqual({
          menuItemId: 'item-c',
          localPrice: 30000,
          currentPrice: 35000,
        });
      }
    });

    it('preserves local unitPrice in conflict (never mutates to current price)', () => {
      const localTx: LocalTransaction = {
        id: 'tx-006',
        lines: [{ menuItemId: 'item-a', unitPrice: 15000 }],
      };
      const currentPrices: CurrentMenuPrices = { 'item-a': 18000 };

      resolveSync(localTx, currentPrices);

      // Verify the local transaction was not mutated
      expect(localTx.lines[0].unitPrice).toBe(15000);
    });
  });
});
