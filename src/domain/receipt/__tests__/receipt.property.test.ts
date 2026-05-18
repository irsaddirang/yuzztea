import { describe } from 'vitest';

import { handlePrintFailure } from '../printFailure';
import { formatReceipt, formatRupiah } from '../receiptFormatter';
import { validateContact } from '../receiptShare';

import type { TransactionWithStatus } from '../printFailure';
import type { ReceiptInput } from '../receiptFormatter';

import { fc, runProperty } from '@/test/property';

/**
 * Property 13: Receipt content & width compliance
 *
 * For any valid ReceiptInput and width 58|80, all lines <= cols (32 or 48),
 * contains required fields, and formatRupiah never fails for valid numeric input.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.9**
 */

/**
 * Property 14: Reprint preserves content
 *
 * formatReceipt with reprint contains "REPRINT" and original content is preserved.
 *
 * **Validates: Requirements 8.8**
 */

/**
 * Property 15: Print failure preserves transaction
 *
 * handlePrintFailure(tx).tx.status === tx.status (never mutates status).
 *
 * **Validates: Requirements 8.5, 8.6, 8.7**
 */

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const shortStringArb = fc.string({ minLength: 1, maxLength: 20 });

const receiptLineArb = fc
  .record({
    name: fc.string({ minLength: 1, maxLength: 30 }),
    qty: fc.integer({ min: 1, max: 99 }),
    unitPrice: fc.integer({ min: 1000, max: 10_000_000 }),
  })
  .map((l) => ({
    ...l,
    subtotal: l.qty * l.unitPrice,
  }));

const paymentMethodArb = fc.constantFrom('tunai' as const, 'qris' as const, 'transfer' as const);

const dateArb = fc
  .integer({ min: 1_600_000_000_000, max: 1_900_000_000_000 })
  .map((ts) => new Date(ts));

const receiptInputArb: fc.Arbitrary<ReceiptInput> = fc
  .record({
    outlet: fc.record({
      name: fc.string({ minLength: 1, maxLength: 40 }),
      address: fc.string({ minLength: 1, maxLength: 60 }),
    }),
    txId: fc.string({ minLength: 1, maxLength: 20 }),
    createdAt: dateArb,
    cashierName: fc.string({ minLength: 1, maxLength: 30 }),
    lines: fc.array(receiptLineArb, { minLength: 1, maxLength: 10 }),
    paymentMethod: paymentMethodArb,
  })
  .map((input) => {
    const subtotal = input.lines.reduce((sum, l) => sum + l.subtotal, 0);
    const discount = 0;
    const tax = 0;
    const total = subtotal - discount + tax;
    const amountPaid = total;
    const change = 0;
    return {
      ...input,
      subtotal,
      discount,
      tax,
      total,
      amountPaid,
      change,
    };
  });

const widthArb = fc.constantFrom(58 as const, 80 as const);

const transactionStatusArb = fc.constantFrom(
  'pending',
  'confirmed',
  'cancelled',
  'refunded',
  'pending_reconciliation',
  'pending_sync',
  'conflict_review',
);

const transactionArb: fc.Arbitrary<TransactionWithStatus> = fc
  .record({
    status: transactionStatusArb,
    id: shortStringArb,
    total: fc.integer({ min: 0, max: 10_000_000 }),
    outletId: shortStringArb,
  })
  .map((t) => t as TransactionWithStatus);

const validWhatsappArb = fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
  minLength: 10,
  maxLength: 15,
});

const validEmailContactArb = fc
  .tuple(
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
      minLength: 1,
      maxLength: 20,
    }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')), {
      minLength: 1,
      maxLength: 15,
    }),
    fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')), {
      minLength: 2,
      maxLength: 6,
    }),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

// ─── Property 13: Receipt content & width compliance ─────────────────────────

describe('Property 13: Receipt content & width compliance', () => {
  runProperty(
    'all output lines are <= cols for the given width (32 for 58mm, 48 for 80mm)',
    fc.property(receiptInputArb, widthArb, (input, width) => {
      const result = formatReceipt(input, width);
      if (!result.ok) return false; // should not fail for valid input
      const cols = width === 58 ? 32 : 48;
      const lines = result.value.split('\n');
      return lines.every((line) => line.length <= cols);
    }),
  );

  runProperty(
    'receipt contains outlet name',
    fc.property(receiptInputArb, widthArb, (input, width) => {
      const result = formatReceipt(input, width);
      if (!result.ok) return false;
      // Outlet name should appear (possibly wrapped/centered, so check trimmed content)
      const text = result.value;
      // For short names, they appear directly; for long names, at least the first word appears
      const firstWord = input.outlet.name.split(/\s+/)[0];
      return text.includes(firstWord);
    }),
  );

  runProperty(
    'receipt contains outlet address',
    fc.property(receiptInputArb, widthArb, (input, width) => {
      const result = formatReceipt(input, width);
      if (!result.ok) return false;
      const text = result.value;
      const firstWord = input.outlet.address.split(/\s+/)[0];
      return text.includes(firstWord);
    }),
  );

  runProperty(
    'receipt contains transaction ID',
    fc.property(receiptInputArb, widthArb, (input, width) => {
      const result = formatReceipt(input, width);
      if (!result.ok) return false;
      return result.value.includes(input.txId);
    }),
  );

  runProperty(
    'receipt contains timestamp in DD/MM/YYYY HH:mm:ss format',
    fc.property(receiptInputArb, widthArb, (input, width) => {
      const result = formatReceipt(input, width);
      if (!result.ok) return false;
      // Check for date pattern DD/MM/YYYY HH:mm:ss
      const datePattern = /\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/;
      return datePattern.test(result.value);
    }),
  );

  runProperty(
    'receipt contains cashier name',
    fc.property(receiptInputArb, widthArb, (input, width) => {
      const result = formatReceipt(input, width);
      if (!result.ok) return false;
      return result.value.includes(input.cashierName);
    }),
  );

  runProperty(
    'receipt contains payment method label',
    fc.property(receiptInputArb, widthArb, (input, width) => {
      const result = formatReceipt(input, width);
      if (!result.ok) return false;
      const methodLabels: Record<string, string> = {
        tunai: 'Tunai',
        qris: 'QRIS',
        transfer: 'Transfer',
      };
      return result.value.includes(methodLabels[input.paymentMethod]);
    }),
  );

  runProperty(
    'receipt contains Rp currency symbol for total',
    fc.property(receiptInputArb, widthArb, (input, width) => {
      const result = formatReceipt(input, width);
      if (!result.ok) return false;
      return result.value.includes('Rp');
    }),
  );

  runProperty(
    'formatRupiah succeeds for any valid integer amount',
    fc.property(fc.integer({ min: 0, max: 999_999_999 }), (amount) => {
      const result = formatRupiah(amount);
      return result.ok === true && result.value.length > 0;
    }),
  );
});

// ─── Property 14: Reprint preserves content ──────────────────────────────────

describe('Property 14: Reprint preserves content', () => {
  runProperty(
    'reprint receipt contains "REPRINT" label',
    fc.property(receiptInputArb, widthArb, dateArb, (input, width, reprintDate) => {
      const reprintInput: ReceiptInput = { ...input, reprint: { at: reprintDate } };
      const result = formatReceipt(reprintInput, width);
      if (!result.ok) return false;
      return result.value.includes('REPRINT');
    }),
  );

  runProperty(
    'original content is preserved in reprint (removing REPRINT lines yields same content)',
    fc.property(receiptInputArb, widthArb, dateArb, (input, width, reprintDate) => {
      // Format without reprint
      const originalResult = formatReceipt(input, width);
      if (!originalResult.ok) return false;

      // Format with reprint
      const reprintInput: ReceiptInput = { ...input, reprint: { at: reprintDate } };
      const reprintResult = formatReceipt(reprintInput, width);
      if (!reprintResult.ok) return false;

      // Remove REPRINT-related lines from reprint output
      const cols = width === 58 ? 32 : 48;
      const sep = '-'.repeat(cols);
      const reprintLines = reprintResult.value.split('\n');

      // Find and remove the REPRINT block (REPRINT label + timestamp + separator)
      const reprintIdx = reprintLines.findIndex((l) => l.includes('REPRINT'));
      if (reprintIdx === -1) return false;

      // Remove the REPRINT line, the timestamp line after it, and the separator after that
      const filteredLines = [...reprintLines];
      // The REPRINT block is: "*** REPRINT ***", timestamp, separator
      let removeCount = 1; // at least the REPRINT line
      if (
        reprintIdx + 1 < filteredLines.length &&
        !filteredLines[reprintIdx + 1].includes(sep.slice(0, 5))
      ) {
        removeCount = 2; // REPRINT + timestamp
      }
      if (
        reprintIdx + removeCount < filteredLines.length &&
        filteredLines[reprintIdx + removeCount] === sep
      ) {
        removeCount += 1; // + separator
      }
      filteredLines.splice(reprintIdx, removeCount);

      const originalText = originalResult.value;
      const filteredText = filteredLines.join('\n');

      return originalText === filteredText;
    }),
  );
});

// ─── Property 15: Print failure preserves transaction ────────────────────────

describe('Property 15: Print failure preserves transaction', () => {
  runProperty(
    'handlePrintFailure never mutates transaction status',
    fc.property(transactionArb, (tx) => {
      const originalStatus = tx.status;
      const result = handlePrintFailure(tx);
      return result.tx.status === originalStatus;
    }),
  );

  runProperty(
    'handlePrintFailure returns action "savePdf"',
    fc.property(transactionArb, (tx) => {
      const result = handlePrintFailure(tx);
      return result.action === 'savePdf';
    }),
  );

  runProperty(
    'handlePrintFailure returns the same transaction reference',
    fc.property(transactionArb, (tx) => {
      const result = handlePrintFailure(tx);
      return result.tx === tx;
    }),
  );

  runProperty(
    'validateContact accepts valid WhatsApp numbers (10-15 digits)',
    fc.property(validWhatsappArb, (phone) => {
      const result = validateContact({ whatsapp: phone });
      return result.ok === true && result.channel === 'whatsapp';
    }),
  );

  runProperty(
    'validateContact accepts valid email contacts',
    fc.property(validEmailContactArb, (email) => {
      const result = validateContact({ email });
      return result.ok === true && result.channel === 'email';
    }),
  );

  runProperty(
    'validateContact rejects invalid WhatsApp (non-digit or wrong length)',
    fc.property(
      fc.oneof(
        // Too short (< 10 digits)
        fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 1, maxLength: 9 }),
        // Too long (> 15 digits)
        fc.stringOf(fc.constantFrom(...'0123456789'.split('')), { minLength: 16, maxLength: 20 }),
        // Contains non-digits
        fc
          .tuple(
            fc.stringOf(fc.constantFrom(...'0123456789'.split('')), {
              minLength: 5,
              maxLength: 10,
            }),
            fc.constantFrom('a', 'b', 'x', '+', '-', ' '),
          )
          .map(([digits, char]) => digits + char + digits.slice(0, 3)),
      ),
      (invalid) => {
        const result = validateContact({ whatsapp: invalid });
        return result.ok === false;
      },
    ),
  );

  runProperty(
    'validateContact rejects empty input (no whatsapp or email)',
    fc.property(fc.constant({}), (input) => {
      const result = validateContact(input);
      return result.ok === false;
    }),
  );
});
