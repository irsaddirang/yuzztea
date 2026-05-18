import { describe, it, expect } from 'vitest';

import { handlePrintFailure } from '../printFailure';

describe('printFailure', () => {
  describe('handlePrintFailure', () => {
    it('returns tx unchanged with action savePdf', () => {
      const tx = {
        id: 'tx-001',
        status: 'confirmed',
        total: 25000,
        outletId: 'outlet-1',
      };

      const result = handlePrintFailure(tx);

      expect(result.action).toBe('savePdf');
      expect(result.tx).toBe(tx); // same reference
      expect(result.tx.status).toBe('confirmed');
    });

    it('does not modify tx.status regardless of initial status', () => {
      const statuses = [
        'pending',
        'confirmed',
        'cancelled',
        'refunded',
        'pending_reconciliation',
        'pending_sync',
        'conflict_review',
      ] as const;

      for (const status of statuses) {
        const tx = { status, id: 'tx-test' };
        const result = handlePrintFailure(tx);
        expect(result.tx.status).toBe(status);
        expect(result.action).toBe('savePdf');
      }
    });

    it('preserves all transaction properties', () => {
      const tx = {
        id: 'tx-complex',
        status: 'confirmed',
        total: 150000,
        outletId: 'outlet-abc',
        cashierUserId: 'user-123',
        lines: [{ name: 'Es Teh', qty: 3, unitPrice: 5000 }],
        paymentMethod: 'tunai',
      };

      const result = handlePrintFailure(tx);

      expect(result.tx).toEqual(tx);
      expect(result.tx.id).toBe('tx-complex');
      expect(result.tx.total).toBe(150000);
      expect(result.tx.lines).toEqual([{ name: 'Es Teh', qty: 3, unitPrice: 5000 }]);
    });

    it('returns the exact same object reference (no mutation)', () => {
      const tx = { status: 'confirmed', id: 'tx-ref' };
      const statusBefore = tx.status;

      const result = handlePrintFailure(tx);

      expect(result.tx).toBe(tx);
      expect(tx.status).toBe(statusBefore);
    });
  });
});
