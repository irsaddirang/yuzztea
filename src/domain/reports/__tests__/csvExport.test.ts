import { describe, it, expect } from 'vitest';

import {
  escapeField,
  buildSummaryCsv,
  buildDetailCsv,
  buildCsv,
  SUMMARY_SCHEMA,
  type SummaryRow,
  type DetailRow,
} from '../csvExport';

describe('csvExport', () => {
  describe('escapeField', () => {
    it('returns plain string unchanged', () => {
      expect(escapeField('hello')).toBe('hello');
    });

    it('wraps field containing comma in double quotes', () => {
      expect(escapeField('hello, world')).toBe('"hello, world"');
    });

    it('wraps field containing double quote and escapes by doubling', () => {
      expect(escapeField('say "hi"')).toBe('"say ""hi"""');
    });

    it('wraps field containing newline (LF)', () => {
      expect(escapeField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('wraps field containing carriage return (CR)', () => {
      expect(escapeField('line1\rline2')).toBe('"line1\rline2"');
    });

    it('wraps field containing CRLF', () => {
      expect(escapeField('line1\r\nline2')).toBe('"line1\r\nline2"');
    });

    it('handles field with comma and quotes together', () => {
      expect(escapeField('"price", $100')).toBe('"""price"", $100"');
    });

    it('converts null to empty string', () => {
      expect(escapeField(null)).toBe('');
    });

    it('converts undefined to empty string', () => {
      expect(escapeField(undefined)).toBe('');
    });

    it('converts number to string', () => {
      expect(escapeField(12500)).toBe('12500');
    });

    it('converts zero to string', () => {
      expect(escapeField(0)).toBe('0');
    });
  });

  describe('buildSummaryCsv', () => {
    const sampleRows: SummaryRow[] = [
      {
        date: '2024-01-15',
        totalSales: 1500000,
        transactionCount: 45,
        averageTransaction: 33333.33,
        tunai: 800000,
        qris: 500000,
        transfer: 200000,
      },
      {
        date: '2024-01-16',
        totalSales: 2000000,
        transactionCount: 60,
        averageTransaction: 33333.33,
        tunai: 1000000,
        qris: 700000,
        transfer: 300000,
      },
    ];

    it('produces CRLF line endings', () => {
      const csv = buildSummaryCsv(sampleRows);
      const lines = csv.split('\r\n');
      // Should have header + 2 data rows + trailing empty from final CRLF
      expect(lines.length).toBe(4); // header, row1, row2, empty after final CRLF
      expect(lines[3]).toBe('');
    });

    it('has fixed header row matching SUMMARY_SCHEMA', () => {
      const csv = buildSummaryCsv(sampleRows);
      const headerLine = csv.split('\r\n')[0];
      expect(headerLine).toBe(
        'Tanggal,Total Penjualan,Jumlah Transaksi,Rata-rata Transaksi,Tunai,QRIS,Transfer',
      );
    });

    it('each data row has same number of columns as header', () => {
      const csv = buildSummaryCsv(sampleRows);
      const lines = csv.split('\r\n').filter((l) => l.length > 0);
      const headerColCount = lines[0]!.split(',').length;
      for (let i = 1; i < lines.length; i++) {
        // Simple split works here since sample data has no commas in values
        expect(lines[i]!.split(',').length).toBe(headerColCount);
      }
    });

    it('produces consistent headers regardless of data content', () => {
      const emptyResult = buildSummaryCsv([]);
      const fullResult = buildSummaryCsv(sampleRows);
      const emptyHeader = emptyResult.split('\r\n')[0];
      const fullHeader = fullResult.split('\r\n')[0];
      expect(emptyHeader).toBe(fullHeader);
    });

    it('handles empty rows array (header only)', () => {
      const csv = buildSummaryCsv([]);
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe(
        'Tanggal,Total Penjualan,Jumlah Transaksi,Rata-rata Transaksi,Tunai,QRIS,Transfer',
      );
      expect(lines[1]).toBe('');
      expect(lines.length).toBe(2);
    });
  });

  describe('buildDetailCsv', () => {
    const sampleRows: DetailRow[] = [
      {
        transactionId: 'tx-001',
        date: '15/01/2024',
        time: '10:30:00',
        outlet: 'Yuzztea Bandung',
        cashier: 'Andi',
        items: 'Es Teh Original x2, Es Teh Lemon x1',
        subtotal: 45000,
        discount: 5000,
        tax: 0,
        total: 40000,
        paymentMethod: 'tunai',
        amountPaid: 50000,
        changeDue: 10000,
        status: 'confirmed',
      },
    ];

    it('has fixed header row matching DETAIL_SCHEMA', () => {
      const csv = buildDetailCsv(sampleRows);
      const headerLine = csv.split('\r\n')[0];
      expect(headerLine).toBe(
        'ID Transaksi,Tanggal,Waktu,Outlet,Kasir,Item,Subtotal,Diskon,Pajak,Total,Metode Bayar,Jumlah Bayar,Kembalian,Status',
      );
    });

    it('escapes fields containing commas in item descriptions', () => {
      const csv = buildDetailCsv(sampleRows);
      const dataLine = csv.split('\r\n')[1];
      // The "items" field contains commas, so it should be quoted
      expect(dataLine).toContain('"Es Teh Original x2, Es Teh Lemon x1"');
    });

    it('produces consistent headers between different data sets', () => {
      const csv1 = buildDetailCsv(sampleRows);
      const csv2 = buildDetailCsv([
        {
          transactionId: 'tx-002',
          date: '15/01/2024',
          time: '10:30:00',
          outlet: 'Yuzztea Bandung',
          cashier: 'Andi',
          items: 'Es Teh Original x2, Es Teh Lemon x1',
          subtotal: 45000,
          discount: 5000,
          tax: 0,
          total: 100000,
          paymentMethod: 'tunai',
          amountPaid: 100000,
          changeDue: 0,
          status: 'confirmed',
        },
      ]);
      const header1 = csv1.split('\r\n')[0];
      const header2 = csv2.split('\r\n')[0];
      expect(header1).toBe(header2);
    });

    it('handles fields with double quotes', () => {
      const rowWithQuotes: DetailRow[] = [
        {
          transactionId: 'tx-001',
          date: '15/01/2024',
          time: '10:30:00',
          outlet: 'Yuzztea Bandung',
          cashier: 'Andi',
          items: 'Es Teh "Special" x1',
          subtotal: 45000,
          discount: 5000,
          tax: 0,
          total: 40000,
          paymentMethod: 'tunai',
          amountPaid: 50000,
          changeDue: 10000,
          status: 'confirmed',
        },
      ];
      const csv = buildDetailCsv(rowWithQuotes);
      const dataLine = csv.split('\r\n')[1];
      expect(dataLine).toContain('"Es Teh ""Special"" x1"');
    });
  });

  describe('buildCsv (generic)', () => {
    it('ends with CRLF', () => {
      const csv = buildCsv([], SUMMARY_SCHEMA);
      expect(csv.endsWith('\r\n')).toBe(true);
    });

    it('does not contain bare LF (only CRLF)', () => {
      const rows: SummaryRow[] = [
        {
          date: '2024-01-01',
          totalSales: 100,
          transactionCount: 1,
          averageTransaction: 100,
          tunai: 100,
          qris: 0,
          transfer: 0,
        },
      ];
      const csv = buildCsv(rows, SUMMARY_SCHEMA);
      // Remove all CRLF, then check no bare LF remains
      const withoutCrlf = csv.replace(/\r\n/g, '');
      expect(withoutCrlf).not.toContain('\n');
    });

    it('column count is consistent across all rows', () => {
      const rows: SummaryRow[] = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        totalSales: i * 1000,
        transactionCount: i,
        averageTransaction: i > 0 ? 1000 : 0,
        tunai: i * 500,
        qris: i * 300,
        transfer: i * 200,
      }));
      const csv = buildCsv(rows, SUMMARY_SCHEMA);
      const lines = csv.split('\r\n').filter((l) => l.length > 0);
      const expectedCols = SUMMARY_SCHEMA.length;
      for (const line of lines) {
        // Count commas (for fields without internal commas)
        expect(line.split(',').length).toBe(expectedCols);
      }
    });
  });
});
