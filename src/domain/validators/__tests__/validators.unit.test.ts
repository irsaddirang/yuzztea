import { describe, it, expect } from 'vitest';

import {
  EmailSchema,
  PasswordSchema,
  OutletCodeSchema,
  HHMMSchema,
  MenuItemDraftSchema,
  RecipeDraftSchema,
} from '../index';

/**
 * Unit tests for validator boundary values.
 * Requirements: 1.1, 3.2, 5.1, 6.2
 */

describe('EmailSchema boundary values', () => {
  // Req 1.1: email 5-254 chars, must contain "@" and domain with "."

  it('accepts exactly 5 chars (minimum boundary)', () => {
    // "a@b.c" = 5 chars
    const result = EmailSchema.safeParse('a@b.c');
    expect(result.success).toBe(true);
  });

  it('rejects exactly 4 chars (below minimum)', () => {
    // "a@b." = 4 chars — too short
    const result = EmailSchema.safeParse('a@b.');
    expect(result.success).toBe(false);
  });

  it('accepts exactly 254 chars (maximum boundary)', () => {
    // Build a valid email that is exactly 254 chars
    // "a@" + domain + ".com" — domain needs to fill up to 254 total
    const localPart = 'a'; // 1 char
    const at = '@'; // 1 char
    const tld = '.com'; // 4 chars
    const domainLen = 254 - localPart.length - at.length - tld.length; // 248
    const domain = 'b'.repeat(domainLen);
    const email = `${localPart}${at}${domain}${tld}`;
    expect(email.length).toBe(254);
    const result = EmailSchema.safeParse(email);
    expect(result.success).toBe(true);
  });

  it('rejects exactly 255 chars (above maximum)', () => {
    const localPart = 'a';
    const at = '@';
    const tld = '.com';
    const domainLen = 255 - localPart.length - at.length - tld.length; // 249
    const domain = 'b'.repeat(domainLen);
    const email = `${localPart}${at}${domain}${tld}`;
    expect(email.length).toBe(255);
    const result = EmailSchema.safeParse(email);
    expect(result.success).toBe(false);
  });
});

describe('PasswordSchema boundary values', () => {
  // Req 1.1: password 8-128 chars

  it('accepts exactly 8 chars (minimum boundary)', () => {
    const result = PasswordSchema.safeParse('a'.repeat(8));
    expect(result.success).toBe(true);
  });

  it('rejects exactly 7 chars (below minimum)', () => {
    const result = PasswordSchema.safeParse('a'.repeat(7));
    expect(result.success).toBe(false);
  });

  it('accepts exactly 128 chars (maximum boundary)', () => {
    const result = PasswordSchema.safeParse('a'.repeat(128));
    expect(result.success).toBe(true);
  });

  it('rejects exactly 129 chars (above maximum)', () => {
    const result = PasswordSchema.safeParse('a'.repeat(129));
    expect(result.success).toBe(false);
  });
});

describe('OutletCodeSchema boundary values', () => {
  // Req 3.2: 3-20 chars, alphanumeric only

  it('accepts exactly 3 chars (minimum boundary)', () => {
    const result = OutletCodeSchema.safeParse('ABC');
    expect(result.success).toBe(true);
  });

  it('rejects exactly 2 chars (below minimum)', () => {
    const result = OutletCodeSchema.safeParse('AB');
    expect(result.success).toBe(false);
  });

  it('accepts exactly 20 chars (maximum boundary)', () => {
    const result = OutletCodeSchema.safeParse('A'.repeat(20));
    expect(result.success).toBe(true);
  });

  it('rejects exactly 21 chars (above maximum)', () => {
    const result = OutletCodeSchema.safeParse('A'.repeat(21));
    expect(result.success).toBe(false);
  });

  it('rejects non-alphanumeric characters', () => {
    expect(OutletCodeSchema.safeParse('YZT-01').success).toBe(false);
    expect(OutletCodeSchema.safeParse('YZT 01').success).toBe(false);
    expect(OutletCodeSchema.safeParse('YZT_01').success).toBe(false);
    expect(OutletCodeSchema.safeParse('YZT@01').success).toBe(false);
  });

  it('accepts mixed alphanumeric', () => {
    expect(OutletCodeSchema.safeParse('Abc123').success).toBe(true);
    expect(OutletCodeSchema.safeParse('999').success).toBe(true);
  });
});

describe('HHMMSchema boundary values', () => {
  // Req 3.2: HH:MM format, 00:00-23:59

  it('accepts "00:00" (minimum valid time)', () => {
    const result = HHMMSchema.safeParse('00:00');
    expect(result.success).toBe(true);
  });

  it('accepts "23:59" (maximum valid time)', () => {
    const result = HHMMSchema.safeParse('23:59');
    expect(result.success).toBe(true);
  });

  it('rejects "24:00" (hour out of range)', () => {
    const result = HHMMSchema.safeParse('24:00');
    expect(result.success).toBe(false);
  });

  it('rejects "8:30" (single digit hour, missing leading zero)', () => {
    const result = HHMMSchema.safeParse('8:30');
    expect(result.success).toBe(false);
  });

  it('rejects "12:60" (minute out of range)', () => {
    const result = HHMMSchema.safeParse('12:60');
    expect(result.success).toBe(false);
  });

  it('accepts "12:00" (midday)', () => {
    const result = HHMMSchema.safeParse('12:00');
    expect(result.success).toBe(true);
  });
});

describe('MenuItemDraftSchema imageBytes boundary values', () => {
  // Req 5.1: image max 2 MB

  const validBase = {
    name: 'Es Teh Original',
    category: 'Minuman',
    basePrice: 15000,
    unit: 'cup',
    active: true,
  };

  it('accepts imageBytes exactly 2*1024*1024 (2 MB boundary)', () => {
    const result = MenuItemDraftSchema.safeParse({
      ...validBase,
      imageBytes: 2 * 1024 * 1024,
    });
    expect(result.success).toBe(true);
  });

  it('rejects imageBytes 2*1024*1024 + 1 (1 byte over 2 MB)', () => {
    const result = MenuItemDraftSchema.safeParse({
      ...validBase,
      imageBytes: 2 * 1024 * 1024 + 1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts without imageBytes (optional field)', () => {
    const result = MenuItemDraftSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });
});

describe('RecipeDraftSchema ingredients boundary values', () => {
  // Req 6.2: 1-50 ingredients per recipe

  const validUuid = '550e8400-e29b-41d4-a716-446655440000';

  function makeIngredients(count: number) {
    return Array.from({ length: count }, (_, i) => ({
      rawMaterialId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
      qtyPerUnit: 1,
    }));
  }

  it('rejects 0 ingredients (below minimum)', () => {
    const result = RecipeDraftSchema.safeParse({
      menuItemId: validUuid,
      ingredients: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts 1 ingredient (minimum boundary)', () => {
    const result = RecipeDraftSchema.safeParse({
      menuItemId: validUuid,
      ingredients: makeIngredients(1),
    });
    expect(result.success).toBe(true);
  });

  it('accepts 50 ingredients (maximum boundary)', () => {
    const result = RecipeDraftSchema.safeParse({
      menuItemId: validUuid,
      ingredients: makeIngredients(50),
    });
    expect(result.success).toBe(true);
  });

  it('rejects 51 ingredients (above maximum)', () => {
    const result = RecipeDraftSchema.safeParse({
      menuItemId: validUuid,
      ingredients: makeIngredients(51),
    });
    expect(result.success).toBe(false);
  });
});
