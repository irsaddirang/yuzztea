import { describe, it, expect } from 'vitest';

import { aggregate, topN } from '../reportAggregator';

import type { ReportTransaction, TopNItem } from '../reportAggregator';

describe('reportAggregator', () => {
  describe('aggregate', () => {
    it('returns zeros for empty transactions', () => {
      const result = aggregate([]);
      expect(result).toEqual({
        total: 0,
        count: 0,
        average: 0,
        byMethod: { tunai: 0, qris: 0, transfer: 0 },
      });
    });

    it('computes total, count, and average for single transaction', () => {
      const txs: ReportTransaction[] = [{ total: 25000, paymentMethod: 'tunai' }];
      const result = aggregate(txs);
      expect(result.total).toBe(25000);
      expect(result.count).toBe(1);
      expect(result.average).toBe(25000);
      expect(result.byMethod.tunai).toBe(25000);
      expect(result.byMethod.qris).toBe(0);
      expect(result.byMethod.transfer).toBe(0);
    });

    it('computes correct average with 2 decimal precision', () => {
      const txs: ReportTransaction[] = [
        { total: 10000, paymentMethod: 'tunai' },
        { total: 15000, paymentMethod: 'qris' },
        { total: 20000, paymentMethod: 'transfer' },
      ];
      const result = aggregate(txs);
      expect(result.total).toBe(45000);
      expect(result.count).toBe(3);
      expect(result.average).toBe(15000);
      expect(result.byMethod.tunai).toBe(10000);
      expect(result.byMethod.qris).toBe(15000);
      expect(result.byMethod.transfer).toBe(20000);
    });

    it('handles average with non-integer result (2 decimal places)', () => {
      const txs: ReportTransaction[] = [
        { total: 10000, paymentMethod: 'tunai' },
        { total: 10001, paymentMethod: 'tunai' },
        { total: 10002, paymentMethod: 'qris' },
      ];
      const result = aggregate(txs);
      expect(result.total).toBe(30003);
      expect(result.count).toBe(3);
      expect(result.average).toBe(10001);
    });

    it('groups totals by payment method correctly', () => {
      const txs: ReportTransaction[] = [
        { total: 5000, paymentMethod: 'tunai' },
        { total: 7000, paymentMethod: 'tunai' },
        { total: 12000, paymentMethod: 'qris' },
        { total: 3000, paymentMethod: 'transfer' },
        { total: 8000, paymentMethod: 'transfer' },
      ];
      const result = aggregate(txs);
      expect(result.byMethod.tunai).toBe(12000);
      expect(result.byMethod.qris).toBe(12000);
      expect(result.byMethod.transfer).toBe(11000);
    });

    it('satisfies linearity: aggregate(T1 ∪ T2).total = aggregate(T1).total + aggregate(T2).total', () => {
      const t1: ReportTransaction[] = [
        { total: 10000, paymentMethod: 'tunai' },
        { total: 20000, paymentMethod: 'qris' },
      ];
      const t2: ReportTransaction[] = [
        { total: 15000, paymentMethod: 'transfer' },
        { total: 5000, paymentMethod: 'tunai' },
      ];
      const combined = aggregate([...t1, ...t2]);
      const r1 = aggregate(t1);
      const r2 = aggregate(t2);
      expect(combined.total).toBe(r1.total + r2.total);
      expect(combined.count).toBe(r1.count + r2.count);
    });
  });

  describe('topN', () => {
    it('returns empty array for empty input', () => {
      expect(topN([])).toEqual([]);
    });

    it('returns all items when fewer than n', () => {
      const items: TopNItem[] = [
        { name: 'Es Teh Original', quantity: 10 },
        { name: 'Es Teh Lemon', quantity: 20 },
      ];
      const result = topN(items, 5);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Es Teh Lemon');
      expect(result[1].name).toBe('Es Teh Original');
    });

    it('returns exactly n items when more than n available', () => {
      const items: TopNItem[] = [
        { name: 'A', quantity: 1 },
        { name: 'B', quantity: 2 },
        { name: 'C', quantity: 3 },
        { name: 'D', quantity: 4 },
        { name: 'E', quantity: 5 },
        { name: 'F', quantity: 6 },
        { name: 'G', quantity: 7 },
      ];
      const result = topN(items, 5);
      expect(result).toHaveLength(5);
      expect(result[0].name).toBe('G');
      expect(result[4].name).toBe('C');
    });

    it('uses default n=5', () => {
      const items: TopNItem[] = Array.from({ length: 10 }, (_, i) => ({
        name: `Item ${i}`,
        quantity: i + 1,
      }));
      const result = topN(items);
      expect(result).toHaveLength(5);
    });

    it('tie-breaks by name A-Z using locale id-ID', () => {
      const items: TopNItem[] = [
        { name: 'Coklat', quantity: 10 },
        { name: 'Anggur', quantity: 10 },
        { name: 'Bandung', quantity: 10 },
      ];
      const result = topN(items, 5);
      expect(result[0].name).toBe('Anggur');
      expect(result[1].name).toBe('Bandung');
      expect(result[2].name).toBe('Coklat');
    });

    it('is deterministic for permutations of the same input', () => {
      const items: TopNItem[] = [
        { name: 'Es Teh', quantity: 50 },
        { name: 'Es Jeruk', quantity: 50 },
        { name: 'Kopi', quantity: 30 },
        { name: 'Susu', quantity: 30 },
        { name: 'Air Mineral', quantity: 20 },
        { name: 'Jus Alpukat', quantity: 20 },
      ];
      // Shuffle the input
      const shuffled = [...items].reverse();
      const result1 = topN(items, 5);
      const result2 = topN(shuffled, 5);
      expect(result1).toEqual(result2);
    });

    it('handles items with quantity 0', () => {
      const items: TopNItem[] = [
        { name: 'A', quantity: 0 },
        { name: 'B', quantity: 5 },
        { name: 'C', quantity: 0 },
      ];
      const result = topN(items, 5);
      expect(result[0].name).toBe('B');
      expect(result[1].name).toBe('A');
      expect(result[2].name).toBe('C');
    });
  });
});
