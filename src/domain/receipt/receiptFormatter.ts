/**
 * Receipt Formatter — pure functions for thermal receipt text generation.
 *
 * Produces deterministic monospace text for 58mm (32 cols) and 80mm (48 cols) thermal printers.
 * Uses word-aware wrapping and locale id-ID currency formatting.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.8, 8.9
 */

import { formatInTimeZone } from 'date-fns-tz';

// ─── Result Type ─────────────────────────────────────────────────────────────

export type Result<T, E extends string> = { ok: true; value: T } | { ok: false; error: E };

// ─── Types ───────────────────────────────────────────────────────────────────

export type ReceiptInput = {
  outlet: { name: string; address: string };
  txId: string;
  createdAt: Date;
  cashierName: string;
  lines: { name: string; qty: number; unitPrice: number; subtotal: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: 'tunai' | 'qris' | 'transfer';
  amountPaid: number;
  change: number;
  reprint?: { at: Date };
};

type ReceiptWidth = 58 | 80;

// ─── Constants ───────────────────────────────────────────────────────────────

const TIMEZONE = 'Asia/Jakarta';
const TIME_FORMAT = 'dd/MM/yyyy HH:mm:ss';

const COLS: Record<ReceiptWidth, number> = {
  58: 32,
  80: 48,
};

// ─── Currency Formatting ─────────────────────────────────────────────────────

/**
 * Format a number as Indonesian Rupiah (locale id-ID, no decimals).
 * Returns Result with formatted string or error if formatting fails.
 */
export function formatRupiah(n: number): Result<string, 'CURRENCY_FORMAT_FAILED'> {
  try {
    const formatted = new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
    return { ok: true, value: formatted };
  } catch {
    return { ok: false, error: 'CURRENCY_FORMAT_FAILED' };
  }
}

// ─── Time Formatting ─────────────────────────────────────────────────────────

/**
 * Format a Date to DD/MM/YYYY HH:mm:ss in Asia/Jakarta timezone.
 */
export function formatJakartaTime(d: Date): string {
  return formatInTimeZone(d, TIMEZONE, TIME_FORMAT);
}

// ─── Text Helpers ────────────────────────────────────────────────────────────

/**
 * Word-aware text wrapping. Splits text into lines that fit within maxCols.
 * If a single word exceeds maxCols, it is forcibly broken.
 */
function wrapText(text: string, maxCols: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (word.length > maxCols) {
      // Flush current line if non-empty
      if (currentLine.length > 0) {
        lines.push(currentLine);
        currentLine = '';
      }
      // Force-break long word
      for (let i = 0; i < word.length; i += maxCols) {
        lines.push(word.slice(i, i + maxCols));
      }
    } else if (currentLine.length === 0) {
      currentLine = word;
    } else if (currentLine.length + 1 + word.length <= maxCols) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

/**
 * Center text within the given column width.
 */
function centerText(text: string, cols: number): string {
  if (text.length >= cols) return text.slice(0, cols);
  const padding = Math.floor((cols - text.length) / 2);
  return ' '.repeat(padding) + text;
}

/**
 * Create a line with left-aligned label and right-aligned value.
 */
function labelValue(label: string, value: string, cols: number): string {
  const gap = cols - label.length - value.length;
  if (gap < 1) {
    // Value takes priority; truncate label
    const maxLabel = cols - value.length - 1;
    if (maxLabel <= 0) return value.slice(0, cols);
    return label.slice(0, maxLabel) + ' ' + value;
  }
  return label + ' '.repeat(gap) + value;
}

/**
 * Create a separator line of dashes.
 */
function separator(cols: number): string {
  return '-'.repeat(cols);
}

// ─── Receipt Formatting ──────────────────────────────────────────────────────

/**
 * Format a complete receipt for thermal printing.
 *
 * Width 58mm = 32 cols, 80mm = 48 cols (monospace).
 * Returns Result.error('CURRENCY_FORMAT_FAILED') without partial text if any
 * currency value fails to format (Req 8.9).
 * Adds "REPRINT" label + timestamp if reprint is present (Req 8.8).
 */
export function formatReceipt(
  input: ReceiptInput,
  width: ReceiptWidth,
): Result<string, 'CURRENCY_FORMAT_FAILED'> {
  const cols = COLS[width];

  // ─── Pre-format all currency values (Req 8.9: fail atomically) ───────────
  const currencyValues: { label: string; amount: number }[] = [
    ...input.lines
      .map((line) => [
        { label: `unitPrice:${line.name}`, amount: line.unitPrice },
        { label: `subtotal:${line.name}`, amount: line.subtotal },
      ])
      .flat(),
    { label: 'subtotal', amount: input.subtotal },
    { label: 'discount', amount: input.discount },
    { label: 'tax', amount: input.tax },
    { label: 'total', amount: input.total },
    { label: 'amountPaid', amount: input.amountPaid },
    { label: 'change', amount: input.change },
  ];

  const formattedCurrency: Map<string, string> = new Map();

  for (const { label, amount } of currencyValues) {
    const result = formatRupiah(amount);
    if (!result.ok) {
      return { ok: false, error: 'CURRENCY_FORMAT_FAILED' };
    }
    // Use label + amount as key to handle duplicates
    formattedCurrency.set(`${label}:${amount}`, result.value);
  }

  // Helper to get pre-formatted currency
  const getCurrency = (label: string, amount: number): string => {
    return formattedCurrency.get(`${label}:${amount}`) ?? '';
  };

  // ─── Build receipt lines ─────────────────────────────────────────────────
  const output: string[] = [];

  // Header: Outlet name (centered)
  for (const line of wrapText(input.outlet.name, cols)) {
    output.push(centerText(line, cols));
  }

  // Header: Outlet address (centered)
  for (const line of wrapText(input.outlet.address, cols)) {
    output.push(centerText(line, cols));
  }

  output.push(separator(cols));

  // Transaction info
  output.push(labelValue('No', input.txId, cols));
  output.push(labelValue('Tanggal', formatJakartaTime(input.createdAt), cols));
  output.push(labelValue('Kasir', input.cashierName, cols));

  output.push(separator(cols));

  // Line items
  for (const line of input.lines) {
    // Item name (may wrap)
    const nameLines = wrapText(line.name, cols);
    for (const nameLine of nameLines) {
      output.push(nameLine);
    }
    // Qty x price = subtotal
    const qtyPrice = `${line.qty} x ${getCurrency(`unitPrice:${line.name}`, line.unitPrice)}`;
    const lineSubtotal = getCurrency(`subtotal:${line.name}`, line.subtotal);
    output.push(labelValue('  ' + qtyPrice, lineSubtotal, cols));
  }

  output.push(separator(cols));

  // Totals
  output.push(labelValue('Subtotal', getCurrency('subtotal', input.subtotal), cols));

  if (input.discount > 0) {
    output.push(labelValue('Diskon', getCurrency('discount', input.discount), cols));
  }

  if (input.tax > 0) {
    output.push(labelValue('Pajak', getCurrency('tax', input.tax), cols));
  }

  output.push(labelValue('TOTAL', getCurrency('total', input.total), cols));

  output.push(separator(cols));

  // Payment info
  const methodLabel =
    input.paymentMethod === 'tunai'
      ? 'Tunai'
      : input.paymentMethod === 'qris'
        ? 'QRIS'
        : 'Transfer';
  output.push(
    labelValue('Bayar (' + methodLabel + ')', getCurrency('amountPaid', input.amountPaid), cols),
  );
  output.push(labelValue('Kembali', getCurrency('change', input.change), cols));

  output.push(separator(cols));

  // Reprint label (Req 8.8)
  if (input.reprint) {
    output.push(centerText('*** REPRINT ***', cols));
    output.push(centerText(formatJakartaTime(input.reprint.at), cols));
    output.push(separator(cols));
  }

  // Footer
  output.push(centerText('Terima Kasih', cols));

  return { ok: true, value: output.join('\n') };
}
