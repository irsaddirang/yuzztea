/**
 * CSV Export — pure functions for generating RFC 4180 compliant CSV output.
 *
 * - buildSummaryCsv: generates summary report CSV (aggregated metrics)
 * - buildDetailCsv: generates detail report CSV (per-transaction rows)
 *
 * RFC 4180 compliance:
 * - CRLF line endings (\r\n)
 * - Fields containing commas, double quotes, or newlines are enclosed in double quotes
 * - Double quotes within fields are escaped by doubling them ("")
 * - Fixed headers that don't change between exports for the same schema
 *
 * Validates: Requirements 9.8
 * Property: 21 (CSV export schema stability)
 */

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Schema definition for CSV columns.
 * Each entry defines a column name (header) and a key to extract from row data.
 */
export type CsvColumn<T> = {
  header: string;
  key: keyof T & string;
};

export type CsvSchema<T> = readonly CsvColumn<T>[];

/**
 * Summary row for aggregated report export.
 */
export type SummaryRow = {
  date: string;
  totalSales: number;
  transactionCount: number;
  averageTransaction: number;
  tunai: number;
  qris: number;
  transfer: number;
};

/**
 * Detail row for per-transaction report export.
 */
export type DetailRow = {
  transactionId: string;
  date: string;
  time: string;
  outlet: string;
  cashier: string;
  items: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  amountPaid: number;
  changeDue: number;
  status: string;
};

// ─── Fixed Schemas ───────────────────────────────────────────────────────────

/**
 * Fixed schema for summary CSV export.
 * Headers never change between exports — Property 21.
 */
export const SUMMARY_SCHEMA: CsvSchema<SummaryRow> = [
  { header: 'Tanggal', key: 'date' },
  { header: 'Total Penjualan', key: 'totalSales' },
  { header: 'Jumlah Transaksi', key: 'transactionCount' },
  { header: 'Rata-rata Transaksi', key: 'averageTransaction' },
  { header: 'Tunai', key: 'tunai' },
  { header: 'QRIS', key: 'qris' },
  { header: 'Transfer', key: 'transfer' },
] as const;

/**
 * Fixed schema for detail CSV export.
 * Headers never change between exports — Property 21.
 */
export const DETAIL_SCHEMA: CsvSchema<DetailRow> = [
  { header: 'ID Transaksi', key: 'transactionId' },
  { header: 'Tanggal', key: 'date' },
  { header: 'Waktu', key: 'time' },
  { header: 'Outlet', key: 'outlet' },
  { header: 'Kasir', key: 'cashier' },
  { header: 'Item', key: 'items' },
  { header: 'Subtotal', key: 'subtotal' },
  { header: 'Diskon', key: 'discount' },
  { header: 'Pajak', key: 'tax' },
  { header: 'Total', key: 'total' },
  { header: 'Metode Bayar', key: 'paymentMethod' },
  { header: 'Jumlah Bayar', key: 'amountPaid' },
  { header: 'Kembalian', key: 'changeDue' },
  { header: 'Status', key: 'status' },
] as const;

// ─── RFC 4180 Helpers ────────────────────────────────────────────────────────

/**
 * Escape a field value according to RFC 4180:
 * - If the field contains a comma, double quote, or newline (CR or LF), wrap in double quotes
 * - Double quotes within the field are escaped by doubling them ("")
 * - All other fields are returned as-is
 */
export function escapeField(value: unknown): string {
  const str = value == null ? '' : String(value);

  // Check if quoting is needed: contains comma, double quote, CR, or LF
  if (str.includes(',') || str.includes('"') || str.includes('\r') || str.includes('\n')) {
    // Escape internal double quotes by doubling them
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Build a single CSV row from field values, joined by commas.
 */
function buildRow(fields: string[]): string {
  return fields.join(',');
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Build a complete CSV string from rows and a schema.
 * RFC 4180 compliant: CRLF line endings, proper field escaping.
 *
 * The header row is always derived from the schema (fixed order and names),
 * ensuring consistency across exports regardless of data content.
 *
 * @param rows - array of data objects
 * @param schema - column definitions (header + key mapping)
 * @returns RFC 4180 compliant CSV string
 */
export function buildCsv<T extends Record<string, unknown>>(
  rows: T[],
  schema: CsvSchema<T>,
): string {
  // Header row — always the same for a given schema
  const headerFields = schema.map((col) => escapeField(col.header));
  const headerLine = buildRow(headerFields);

  // Data rows
  const dataLines = rows.map((row) => {
    const fields = schema.map((col) => escapeField(row[col.key]));
    return buildRow(fields);
  });

  // Join with CRLF (RFC 4180 mandates CRLF)
  // Final CRLF after last record per RFC 4180 §2 rule 2
  const allLines = [headerLine, ...dataLines];
  return allLines.join('\r\n') + '\r\n';
}

/**
 * Build a summary CSV export from aggregated report rows.
 * Uses the fixed SUMMARY_SCHEMA — headers are stable across exports.
 *
 * @param rows - summary data rows
 * @param schema - optional override schema (defaults to SUMMARY_SCHEMA)
 * @returns RFC 4180 compliant CSV string
 */
export function buildSummaryCsv(
  rows: SummaryRow[],
  schema: CsvSchema<SummaryRow> = SUMMARY_SCHEMA,
): string {
  return buildCsv(rows, schema);
}

/**
 * Build a detail CSV export from per-transaction report rows.
 * Uses the fixed DETAIL_SCHEMA — headers are stable across exports.
 *
 * @param rows - detail data rows
 * @param schema - optional override schema (defaults to DETAIL_SCHEMA)
 * @returns RFC 4180 compliant CSV string
 */
export function buildDetailCsv(
  rows: DetailRow[],
  schema: CsvSchema<DetailRow> = DETAIL_SCHEMA,
): string {
  return buildCsv(rows, schema);
}
