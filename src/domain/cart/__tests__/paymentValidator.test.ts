import { describe, it, expect } from 'vitest';

import { validatePayment, changeDue } from '../paymentValidator';

describe('paymentValidator', () => {
  describe('changeDue', () => {
    it('returns difference for tunai when paid > total', () => {
      expect(changeDue('tunai', 15000, 20000)).toBe(5000);
    });

    it('returns 0 for tunai when paid === total', () => {
      expect(changeDue('tunai', 15000, 15000)).toBe(0);
    });

    it('returns 0 for tunai when paid < total (no negative)', () => {
      expect(changeDue('tunai', 15000, 10000)).toBe(0);
    });

    it('returns 0 for qris regardless of amounts', () => {
      expect(changeDue('qris', 15000, 15000)).toBe(0);
      expect(changeDue('qris', 15000, 20000)).toBe(0);
    });

    it('returns 0 for transfer regardless of amounts', () => {
      expect(changeDue('transfer', 15000, 15000)).toBe(0);
      expect(changeDue('transfer', 15000, 20000)).toBe(0);
    });
  });

  describe('validatePayment — tunai', () => {
    it('accepts when amountPaid >= total', () => {
      const result = validatePayment({ total: 15000, amountPaid: 20000, method: 'tunai' });
      expect(result).toEqual({
        ok: true,
        value: { total: 15000, amountPaid: 20000, method: 'tunai', changeDue: 5000 },
      });
    });

    it('accepts when amountPaid === total (exact cash)', () => {
      const result = validatePayment({ total: 15000, amountPaid: 15000, method: 'tunai' });
      expect(result).toEqual({
        ok: true,
        value: { total: 15000, amountPaid: 15000, method: 'tunai', changeDue: 0 },
      });
    });

    it('rejects when amountPaid < total with INSUFFICIENT_PAYMENT', () => {
      const result = validatePayment({ total: 15000, amountPaid: 10000, method: 'tunai' });
      expect(result).toEqual({ ok: false, error: 'INSUFFICIENT_PAYMENT' });
    });

    it('accepts total 0 with amountPaid 0', () => {
      const result = validatePayment({ total: 0, amountPaid: 0, method: 'tunai' });
      expect(result).toEqual({
        ok: true,
        value: { total: 0, amountPaid: 0, method: 'tunai', changeDue: 0 },
      });
    });
  });

  describe('validatePayment — qris', () => {
    it('accepts when amountPaid === total', () => {
      const result = validatePayment({ total: 25000, amountPaid: 25000, method: 'qris' });
      expect(result).toEqual({
        ok: true,
        value: { total: 25000, amountPaid: 25000, method: 'qris', changeDue: 0 },
      });
    });

    it('rejects when amountPaid > total with AMOUNT_MISMATCH', () => {
      const result = validatePayment({ total: 25000, amountPaid: 30000, method: 'qris' });
      expect(result).toEqual({ ok: false, error: 'AMOUNT_MISMATCH' });
    });

    it('rejects when amountPaid < total with AMOUNT_MISMATCH', () => {
      const result = validatePayment({ total: 25000, amountPaid: 20000, method: 'qris' });
      expect(result).toEqual({ ok: false, error: 'AMOUNT_MISMATCH' });
    });
  });

  describe('validatePayment — transfer', () => {
    it('accepts when amountPaid === total', () => {
      const result = validatePayment({ total: 50000, amountPaid: 50000, method: 'transfer' });
      expect(result).toEqual({
        ok: true,
        value: { total: 50000, amountPaid: 50000, method: 'transfer', changeDue: 0 },
      });
    });

    it('rejects when amountPaid > total with AMOUNT_MISMATCH', () => {
      const result = validatePayment({ total: 50000, amountPaid: 60000, method: 'transfer' });
      expect(result).toEqual({ ok: false, error: 'AMOUNT_MISMATCH' });
    });

    it('rejects when amountPaid < total with AMOUNT_MISMATCH', () => {
      const result = validatePayment({ total: 50000, amountPaid: 40000, method: 'transfer' });
      expect(result).toEqual({ ok: false, error: 'AMOUNT_MISMATCH' });
    });
  });
});
