/**
 * Receipt Share — pure functions for sharing receipts via WhatsApp or email.
 *
 * Validates contact information using WhatsappSchema and EmailContactSchema,
 * then builds share URLs for the respective platforms.
 *
 * Validates: Requirements 8.6, 8.7
 */

import { WhatsappSchema, EmailContactSchema } from '@/domain/validators';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ContactInput = {
  whatsapp?: string;
  email?: string;
};

export type ContactValidationResult =
  | { ok: true; channel: 'whatsapp'; value: string }
  | { ok: true; channel: 'email'; value: string }
  | { ok: false; error: string };

// ─── Contact Validation ──────────────────────────────────────────────────────

/**
 * Validate a contact input. At least one of whatsapp or email must be provided.
 * WhatsApp takes priority if both are provided.
 *
 * Returns validation result without modifying any transaction state.
 * Validates: Req 8.6, 8.7
 */
export function validateContact(input: ContactInput): ContactValidationResult {
  if (input.whatsapp) {
    const result = WhatsappSchema.safeParse(input.whatsapp);
    if (result.success) {
      return { ok: true, channel: 'whatsapp', value: result.data };
    }
    return { ok: false, error: result.error.issues[0]?.message ?? 'Format kontak invalid' };
  }

  if (input.email) {
    const result = EmailContactSchema.safeParse(input.email);
    if (result.success) {
      return { ok: true, channel: 'email', value: result.data };
    }
    return { ok: false, error: result.error.issues[0]?.message ?? 'Format kontak invalid' };
  }

  return { ok: false, error: 'Nomor WhatsApp atau email harus diisi' };
}

// ─── URL Builders ────────────────────────────────────────────────────────────

/**
 * Build a WhatsApp share URL (wa.me) with the given phone number and text.
 * Phone number should be digits only (10-15 chars).
 */
export function buildWaShareUrl(phone: string, text: string): string {
  const encodedText = encodeURIComponent(text);
  return `https://wa.me/${phone}?text=${encodedText}`;
}

/**
 * Build a mailto: URL with the given email, subject, and body.
 */
export function buildMailtoUrl(email: string, subject: string, body: string): string {
  const encodedSubject = encodeURIComponent(subject);
  const encodedBody = encodeURIComponent(body);
  return `mailto:${email}?subject=${encodedSubject}&body=${encodedBody}`;
}
