/**
 * Payment Validator — pure functions for payment validation.
 *
 * Rules:
 * - tunai (cash): amountPaid >= total → valid, changeDue = amountPaid - total
 * - qris: amountPaid === total → valid, changeDue = 0
 * - transfer: amountPaid === total → valid, changeDue = 0
 * - Otherwise → error with specific code
 *
 * Validates: Requirements 7.3, 7.5, 7.6
 */

import type { PaymentMethod } from '@/domain/validators';

// ─── Types ───────────────────────────────────────────────────────────────────

export type PaymentError = 'INSUFFICIENT_PAYMENT' | 'AMOUNT_MISMATCH';

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export interface ConfirmedPayment {
  total: number;
  amountPaid: number;
  method: PaymentMethod;
  changeDue: number;
}

export interface PaymentInput {
  total: number;
  amountPaid: number;
  method: PaymentMethod;
}

// ─── Functions ───────────────────────────────────────────────────────────────

/**
 * Calculate change due based on payment method.
 * Non-cash methods always return 0 (exact payment required).
 * Cash returns the difference (amountPaid - total), minimum 0.
 */
export function changeDue(method: PaymentMethod, total: number, paid: number): number {
  if (method === 'tunai') {
    return Math.max(0, paid - total);
  }
  return 0;
}

/**
 * Validate a payment attempt.
 *
 * - tunai: amountPaid must be >= total (overpayment allowed, change returned)
 * - qris/transfer: amountPaid must be exactly equal to total
 *
 * Returns Result<ConfirmedPayment, PaymentError>.
 */
export function validatePayment(input: PaymentInput): Result<ConfirmedPayment, PaymentError> {
  const { total, amountPaid, method } = input;

  if (method === 'tunai') {
    if (amountPaid < total) {
      return { ok: false, error: 'INSUFFICIENT_PAYMENT' };
    }
    return {
      ok: true,
      value: {
        total,
        amountPaid,
        method,
        changeDue: amountPaid - total,
      },
    };
  }

  // qris or transfer: exact amount required
  if (amountPaid !== total) {
    return { ok: false, error: 'AMOUNT_MISMATCH' };
  }

  return {
    ok: true,
    value: {
      total,
      amountPaid,
      method,
      changeDue: 0,
    },
  };
}
