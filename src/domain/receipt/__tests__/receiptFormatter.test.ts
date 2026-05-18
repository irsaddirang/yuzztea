import { describe, it, expect } from 'vitest';

import { formatRupiah, formatJakartaTime, formatReceipt } from '../receiptFormatter';

import type { ReceiptInput } from '../receiptFormatter';

describe('formatRupiah', () => {
  it('formats positive integer as Rupiah without decimals', () => {
    const result = formatRupiah(12500);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Rp');
      expect(result.value).toContain('12.500');
      // No decimal separator
      expect(result.value).not.toMatch(/,\d{2}$/);
    }
  });

  it('formats zero', () => {
    const result = formatRupiah(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Rp');
      expect(result.value).toContain('0');
    }
  });

  it('formats large numbers correctly', () => {
    const result = formatRupiah(10000000);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Rp');
      expect(result.value).toContain('10.000.000');
    }
  });

  it('returns ok result type', () => {
    const result = formatRupiah(5000);
    expect(result).toHaveProperty('ok', true);
    expect(result).toHaveProperty('value');
  });
});

describe('formatJakartaTime', () => {
  it('formats date in DD/MM/YYYY HH:mm:ss Asia/Jakarta', () => {
    // 2024-01-15T10:30:45Z = 2024-01-15 17:30:45 WIB (UTC+7)
    const date = new Date('2024-01-15T10:30:45Z');
    const result = formatJakartaTime(date);
    expect(result).toBe('15/01/2024 17:30:45');
  });

  it('handles midnight UTC correctly', () => {
    // 2024-06-01T00:00:00Z = 2024-06-01 07:00:00 WIB
    const date = new Date('2024-06-01T00:00:00Z');
    const result = formatJakartaTime(date);
    expect(result).toBe('01/06/2024 07:00:00');
  });
});

describe('formatReceipt', () => {
  const baseInput: ReceiptInput = {
    outlet: { name: 'Yuzztea Outlet Senayan', address: 'Jl. Sudirman No. 1, Jakarta' },
    txId: 'TX-001',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    cashierName: 'Budi',
    lines: [
      { name: 'Es Teh Original', qty: 2, unitPrice: 8000, subtotal: 16000 },
      { name: 'Es Teh Lemon', qty: 1, unitPrice: 10000, subtotal: 10000 },
    ],
    subtotal: 26000,
    discount: 0,
    tax: 0,
    total: 26000,
    paymentMethod: 'tunai',
    amountPaid: 30000,
    change: 4000,
  };

  it('returns ok result for valid input', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
  });

  it('produces 32-col lines for 58mm width', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const lines = result.value.split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(32);
      }
    }
  });

  it('produces 48-col lines for 80mm width', () => {
    const result = formatReceipt(baseInput, 80);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const lines = result.value.split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(48);
      }
    }
  });

  it('contains outlet name and address', () => {
    const result = formatReceipt(baseInput, 80);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Yuzztea Outlet Senayan');
      expect(result.value).toContain('Jl. Sudirman No. 1, Jakarta');
    }
  });

  it('contains transaction ID and cashier name', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('TX-001');
      expect(result.value).toContain('Budi');
    }
  });

  it('contains formatted date in Jakarta timezone', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('15/01/2024 17:00:00');
    }
  });

  it('contains item names and quantities', () => {
    const result = formatReceipt(baseInput, 80);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Es Teh Original');
      expect(result.value).toContain('Es Teh Lemon');
      expect(result.value).toContain('2 x');
      expect(result.value).toContain('1 x');
    }
  });

  it('contains payment method label', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Tunai');
    }
  });

  it('shows QRIS label for qris payment', () => {
    const input = { ...baseInput, paymentMethod: 'qris' as const, change: 0 };
    const result = formatReceipt(input, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('QRIS');
    }
  });

  it('shows Transfer label for transfer payment', () => {
    const input = { ...baseInput, paymentMethod: 'transfer' as const, change: 0 };
    const result = formatReceipt(input, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Transfer');
    }
  });

  it('adds REPRINT label and timestamp when reprint is present (Req 8.8)', () => {
    const input: ReceiptInput = {
      ...baseInput,
      reprint: { at: new Date('2024-01-15T12:00:00Z') },
    };
    const result = formatReceipt(input, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('REPRINT');
      // Reprint timestamp in Jakarta time: 12:00 UTC = 19:00 WIB
      expect(result.value).toContain('15/01/2024 19:00:00');
    }
  });

  it('does not contain REPRINT when reprint is absent', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toContain('REPRINT');
    }
  });

  it('omits discount line when discount is 0', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toContain('Diskon');
    }
  });

  it('shows discount line when discount > 0', () => {
    const input = { ...baseInput, discount: 2000, total: 24000 };
    const result = formatReceipt(input, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Diskon');
    }
  });

  it('omits tax line when tax is 0', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).not.toContain('Pajak');
    }
  });

  it('shows tax line when tax > 0', () => {
    const input = { ...baseInput, tax: 2600, total: 28600 };
    const result = formatReceipt(input, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Pajak');
    }
  });

  it('contains footer', () => {
    const result = formatReceipt(baseInput, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toContain('Terima Kasih');
    }
  });

  it('wraps long outlet name within column width', () => {
    const input: ReceiptInput = {
      ...baseInput,
      outlet: {
        name: 'Yuzztea Premium Outlet Grand Indonesia Mall',
        address: 'Jl. MH Thamrin No. 1, Jakarta Pusat 10310',
      },
    };
    const result = formatReceipt(input, 58);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const lines = result.value.split('\n');
      for (const line of lines) {
        expect(line.length).toBeLessThanOrEqual(32);
      }
    }
  });
});
