/**
 * Property-based tests for Cart Engine and Payment Validator.
 *
 * Uses fast-check with deterministic seed from src/test/property.ts.
 */

import { computeTotals, type CartLine, type Discount, type TaxRule } from '../cartEngine';
import { validatePayment, type PaymentInput } from '../paymentValidator';

import type { PaymentMethod } from '@/domain/validators';

import { runProperty, fc, describe } from '@/test/property';

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid CartLine with integer unitPrice (Rupiah) and qty >= 1 */
const arbCartLine: fc.Arbitrary<CartLine> = fc.record({
  menuItemId: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  unitPrice: fc.integer({ min: 0, max: 10_000_000 }),
  qty: fc.integer({ min: 1, max: 100 }),
});

/** Generate 0-100 cart lines (Req 7.2 max 100 line items) */
const arbCartLines: fc.Arbitrary<CartLine[]> = fc.array(arbCartLine, {
  minLength: 0,
  maxLength: 100,
});

/** Generate an optional Discount */
const arbDiscount: fc.Arbitrary<Discount | null> = fc.oneof(
  fc.constant(null),
  fc.record({
    kind: fc.constantFrom('amount' as const, 'percent' as const),
    value: fc.integer({ min: 0, max: 10_000_000 }),
  }),
);

/** Generate a TaxRule */
const arbTaxRule: fc.Arbitrary<TaxRule> = fc.record({
  enabled: fc.boolean(),
  ratePercent: fc.integer({ min: 0, max: 100 }),
});

/** Generate a PaymentMethod */
const arbPaymentMethod: fc.Arbitrary<PaymentMethod> = fc.constantFrom('tunai', 'qris', 'transfer');

// ─── Property 1: Cart totals correctness ─────────────────────────────────────

/**
 * **Validates: Requirements 7.2**
 *
 * For any CartLine[] (0-100), discount, tax:
 * - subtotal = sum(qty * unitPrice)
 * - total = max(0, subtotal - discount) + tax
 * - tax = floor(taxableBase * rate / 100) when enabled, 0 otherwise
 * - changeDue(amountPaid) = max(0, amountPaid - total) for any amountPaid >= 0
 */
describe('Property 1: Cart totals correctness', () => {
  runProperty(
    'subtotal equals sum of qty * unitPrice for all lines',
    fc.property(arbCartLines, arbDiscount, arbTaxRule, (lines, discount, tax) => {
      const totals = computeTotals(lines, discount, tax);
      const expectedSubtotal = lines.reduce((sum, l) => sum + l.qty * l.unitPrice, 0);
      return totals.subtotal === expectedSubtotal;
    }),
  );

  runProperty(
    'discount amount is correctly computed',
    fc.property(arbCartLines, arbDiscount, arbTaxRule, (lines, discount, tax) => {
      const totals = computeTotals(lines, discount, tax);
      if (discount === null) {
        return totals.discount === 0;
      }
      if (discount.kind === 'amount') {
        return totals.discount === discount.value;
      }
      // percent
      const expectedDiscount = Math.floor((totals.subtotal * discount.value) / 100);
      return totals.discount === expectedDiscount;
    }),
  );

  runProperty(
    'tax = floor(taxableBase * ratePercent / 100) when enabled, 0 otherwise',
    fc.property(arbCartLines, arbDiscount, arbTaxRule, (lines, discount, tax) => {
      const totals = computeTotals(lines, discount, tax);
      const taxableBase = Math.max(0, totals.subtotal - totals.discount);
      if (!tax.enabled) {
        return totals.tax === 0;
      }
      const expectedTax = Math.floor((taxableBase * tax.ratePercent) / 100);
      return totals.tax === expectedTax;
    }),
  );

  runProperty(
    'total = max(0, subtotal - discount) + tax',
    fc.property(arbCartLines, arbDiscount, arbTaxRule, (lines, discount, tax) => {
      const totals = computeTotals(lines, discount, tax);
      const taxableBase = Math.max(0, totals.subtotal - totals.discount);
      const expectedTotal = taxableBase + totals.tax;
      return totals.total === expectedTotal;
    }),
  );

  runProperty(
    'changeDue(amountPaid) = max(0, amountPaid - total) for any amountPaid >= 0',
    fc.property(
      arbCartLines,
      arbDiscount,
      arbTaxRule,
      fc.integer({ min: 0, max: 100_000_000 }),
      (lines, discount, tax, amountPaid) => {
        const totals = computeTotals(lines, discount, tax);
        const expectedChange = Math.max(0, amountPaid - totals.total);
        return totals.changeDue(amountPaid) === expectedChange;
      },
    ),
  );

  runProperty(
    'total is always non-negative',
    fc.property(arbCartLines, arbDiscount, arbTaxRule, (lines, discount, tax) => {
      const totals = computeTotals(lines, discount, tax);
      return totals.total >= 0;
    }),
  );
});

// ─── Property 2: Payment validation ─────────────────────────────────────────

/**
 * **Validates: Requirements 7.5, 7.6**
 *
 * For any total >= 0, amountPaid >= 0, method:
 * validatePayment accepts iff:
 *   (tunai && paid >= total) || ((qris || transfer) && paid === total)
 */
describe('Property 2: Payment validation', () => {
  runProperty(
    'accepts iff (tunai && paid >= total) || ((qris|transfer) && paid === total)',
    fc.property(
      fc.integer({ min: 0, max: 100_000_000 }),
      fc.integer({ min: 0, max: 100_000_000 }),
      arbPaymentMethod,
      (total, amountPaid, method) => {
        const input: PaymentInput = { total, amountPaid, method };
        const result = validatePayment(input);

        const shouldAccept =
          (method === 'tunai' && amountPaid >= total) ||
          ((method === 'qris' || method === 'transfer') && amountPaid === total);

        return result.ok === shouldAccept;
      },
    ),
  );

  runProperty(
    'tunai rejection returns INSUFFICIENT_PAYMENT error code',
    fc.property(
      fc.integer({ min: 1, max: 100_000_000 }),
      fc.integer({ min: 0, max: 100_000_000 }),
      (total, amountPaid) => {
        // Ensure amountPaid < total for rejection
        fc.pre(amountPaid < total);
        const result = validatePayment({ total, amountPaid, method: 'tunai' });
        return !result.ok && result.error === 'INSUFFICIENT_PAYMENT';
      },
    ),
  );

  runProperty(
    'qris/transfer rejection returns AMOUNT_MISMATCH error code',
    fc.property(
      fc.integer({ min: 0, max: 100_000_000 }),
      fc.integer({ min: 0, max: 100_000_000 }),
      fc.constantFrom('qris' as PaymentMethod, 'transfer' as PaymentMethod),
      (total, amountPaid, method) => {
        fc.pre(amountPaid !== total);
        const result = validatePayment({ total, amountPaid, method });
        return !result.ok && result.error === 'AMOUNT_MISMATCH';
      },
    ),
  );

  runProperty(
    'accepted tunai payment has correct changeDue = amountPaid - total',
    fc.property(
      fc.integer({ min: 0, max: 100_000_000 }),
      fc.integer({ min: 0, max: 100_000_000 }),
      (total, amountPaid) => {
        fc.pre(amountPaid >= total);
        const result = validatePayment({ total, amountPaid, method: 'tunai' });
        return result.ok && result.value.changeDue === amountPaid - total;
      },
    ),
  );

  runProperty(
    'accepted qris/transfer payment has changeDue = 0',
    fc.property(
      fc.integer({ min: 0, max: 100_000_000 }),
      fc.constantFrom('qris' as PaymentMethod, 'transfer' as PaymentMethod),
      (total, method) => {
        const result = validatePayment({ total, amountPaid: total, method });
        return result.ok && result.value.changeDue === 0;
      },
    ),
  );
});
