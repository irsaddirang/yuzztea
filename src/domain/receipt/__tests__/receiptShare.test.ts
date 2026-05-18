import { describe, it, expect } from 'vitest';

import { validateContact, buildWaShareUrl, buildMailtoUrl } from '../receiptShare';

describe('receiptShare', () => {
  describe('validateContact', () => {
    it('accepts valid WhatsApp number (10-15 digits)', () => {
      const result = validateContact({ whatsapp: '6281234567890' });
      expect(result).toEqual({ ok: true, channel: 'whatsapp', value: '6281234567890' });
    });

    it('accepts valid email', () => {
      const result = validateContact({ email: 'customer@example.com' });
      expect(result).toEqual({ ok: true, channel: 'email', value: 'customer@example.com' });
    });

    it('prioritizes WhatsApp when both provided', () => {
      const result = validateContact({
        whatsapp: '6281234567890',
        email: 'customer@example.com',
      });
      expect(result).toEqual({ ok: true, channel: 'whatsapp', value: '6281234567890' });
    });

    it('rejects WhatsApp with less than 10 digits', () => {
      const result = validateContact({ whatsapp: '123456789' });
      expect(result.ok).toBe(false);
    });

    it('rejects WhatsApp with more than 15 digits', () => {
      const result = validateContact({ whatsapp: '1234567890123456' });
      expect(result.ok).toBe(false);
    });

    it('rejects WhatsApp with non-digit characters', () => {
      const result = validateContact({ whatsapp: '62812-345-678' });
      expect(result.ok).toBe(false);
    });

    it('rejects invalid email format', () => {
      const result = validateContact({ email: 'not-an-email' });
      expect(result.ok).toBe(false);
    });

    it('returns error when neither whatsapp nor email provided', () => {
      const result = validateContact({});
      expect(result).toEqual({ ok: false, error: 'Nomor WhatsApp atau email harus diisi' });
    });

    it('falls back to email validation when whatsapp is empty string', () => {
      const result = validateContact({ whatsapp: '', email: 'test@mail.com' });
      expect(result).toEqual({ ok: true, channel: 'email', value: 'test@mail.com' });
    });
  });

  describe('buildWaShareUrl', () => {
    it('builds correct wa.me URL', () => {
      const url = buildWaShareUrl('6281234567890', 'Hello World');
      expect(url).toBe('https://wa.me/6281234567890?text=Hello%20World');
    });

    it('encodes special characters in text', () => {
      const url = buildWaShareUrl('6281234567890', 'Total: Rp 15.000');
      expect(url).toContain('text=Total%3A%20Rp%2015.000');
    });
  });

  describe('buildMailtoUrl', () => {
    it('builds correct mailto URL', () => {
      const url = buildMailtoUrl('test@example.com', 'Receipt', 'Your receipt');
      expect(url).toBe('mailto:test@example.com?subject=Receipt&body=Your%20receipt');
    });

    it('encodes special characters in subject and body', () => {
      const url = buildMailtoUrl('a@b.com', 'Struk #123', 'Total: Rp 50.000');
      expect(url).toContain('subject=Struk%20%23123');
      expect(url).toContain('body=Total%3A%20Rp%2050.000');
    });
  });
});
