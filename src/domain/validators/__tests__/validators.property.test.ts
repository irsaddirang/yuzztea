import { describe } from 'vitest';

import {
  EmailSchema,
  PasswordSchema,
  OutletCodeSchema,
  HHMMSchema,
  MenuItemDraftSchema,
  RecipeDraftSchema,
  TransactionDraftSchema,
} from '../index';

import { fc, runProperty } from '@/test/property';

/**
 * Property 16: Entity validators
 *
 * All schemas accept valid generated input and reject input with exactly one
 * field violation; schema.parse(schema.parse(x)) is deterministic for valid inputs.
 *
 * **Validates: Requirements 3.2, 3.3, 4.1, 4.3, 4.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.6, 6.7, 6.8, 8.6, 9.2, 9.3, 14.3, 14.4**
 */

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const alphaLower = 'abcdefghijklmnopqrstuvwxyz0123456789';
const alphaAll = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const validEmailArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 50, unit: fc.constantFrom(...alphaLower.split('')) }),
    fc.string({ minLength: 1, maxLength: 30, unit: fc.constantFrom(...alphaLower.split('')) }),
    fc.string({
      minLength: 2,
      maxLength: 10,
      unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
    }),
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`)
  .filter((e) => e.length >= 5 && e.length <= 254);

const validPasswordArb = fc.string({ minLength: 8, maxLength: 128 });

const validOutletCodeArb = fc.string({
  minLength: 3,
  maxLength: 20,
  unit: fc.constantFrom(...alphaAll.split('')),
});

const validHHMMArb = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

const uuidArb = fc
  .tuple(
    fc.string({
      minLength: 8,
      maxLength: 8,
      unit: fc.constantFrom(...'0123456789abcdef'.split('')),
    }),
    fc.string({
      minLength: 4,
      maxLength: 4,
      unit: fc.constantFrom(...'0123456789abcdef'.split('')),
    }),
    fc.string({
      minLength: 4,
      maxLength: 4,
      unit: fc.constantFrom(...'0123456789abcdef'.split('')),
    }),
    fc.string({
      minLength: 4,
      maxLength: 4,
      unit: fc.constantFrom(...'0123456789abcdef'.split('')),
    }),
    fc.string({
      minLength: 12,
      maxLength: 12,
      unit: fc.constantFrom(...'0123456789abcdef'.split('')),
    }),
  )
  .map(([a, b, c, d, e]) => `${a}-${b}-${c}-${d}-${e}`);

const validMenuItemDraftArb = fc.record({
  name: fc.string({ minLength: 1, maxLength: 100 }),
  category: fc.string({ minLength: 1, maxLength: 50 }),
  basePrice: fc.integer({ min: 0, max: 10_000_000 }),
  description: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: undefined }),
  unit: fc.string({ minLength: 1, maxLength: 20 }),
  active: fc.boolean(),
  imageBytes: fc.option(fc.integer({ min: 0, max: 2 * 1024 * 1024 }), { nil: undefined }),
});

const validRecipeIngredientArb = fc.record({
  rawMaterialId: uuidArb,
  qtyPerUnit: fc.double({ min: 0.01, max: 999_999.99, noNaN: true }),
});

const validRecipeDraftArb = fc.record({
  menuItemId: uuidArb,
  ingredients: fc.array(validRecipeIngredientArb, { minLength: 1, maxLength: 50 }),
});

const validTransactionLineArb = fc.record({
  menuItemId: uuidArb,
  nameSnapshot: fc.string({ minLength: 1, maxLength: 100 }),
  unitPrice: fc.integer({ min: 0, max: 10_000_000 }),
  quantity: fc.integer({ min: 1, max: 100 }),
});

const validTransactionDraftArb = fc
  .record({
    outletId: uuidArb,
    cashierUserId: uuidArb,
    lines: fc.array(validTransactionLineArb, { minLength: 1, maxLength: 10 }),
    paymentMethod: fc.constantFrom('tunai' as const, 'qris' as const, 'transfer' as const),
    deviceId: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  })
  .map((draft) => {
    const subtotal = draft.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
    const discount = 0;
    const tax = 0;
    const total = subtotal;
    const amountPaid = total;
    const changeDue = 0;
    return { ...draft, subtotal, discount, tax, total, amountPaid, changeDue };
  });

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Property 16: Entity validators', () => {
  describe('1. All schemas accept valid generated input', () => {
    runProperty(
      'EmailSchema accepts valid emails',
      fc.property(validEmailArb, (email) => {
        const result = EmailSchema.safeParse(email);
        return result.success === true;
      }),
    );

    runProperty(
      'PasswordSchema accepts valid passwords',
      fc.property(validPasswordArb, (password) => {
        const result = PasswordSchema.safeParse(password);
        return result.success === true;
      }),
    );

    runProperty(
      'OutletCodeSchema accepts valid outlet codes',
      fc.property(validOutletCodeArb, (code) => {
        const result = OutletCodeSchema.safeParse(code);
        return result.success === true;
      }),
    );

    runProperty(
      'HHMMSchema accepts valid HH:MM strings',
      fc.property(validHHMMArb, (time) => {
        const result = HHMMSchema.safeParse(time);
        return result.success === true;
      }),
    );

    runProperty(
      'MenuItemDraftSchema accepts valid menu item drafts',
      fc.property(validMenuItemDraftArb, (draft) => {
        const result = MenuItemDraftSchema.safeParse(draft);
        return result.success === true;
      }),
    );

    runProperty(
      'RecipeDraftSchema accepts valid recipe drafts',
      fc.property(validRecipeDraftArb, (draft) => {
        const result = RecipeDraftSchema.safeParse(draft);
        return result.success === true;
      }),
    );

    runProperty(
      'TransactionDraftSchema accepts valid transaction drafts',
      fc.property(validTransactionDraftArb, (draft) => {
        const result = TransactionDraftSchema.safeParse(draft);
        return result.success === true;
      }),
    );
  });

  describe('2. All schemas reject input with exactly one field violation', () => {
    runProperty(
      'EmailSchema rejects emails shorter than 5 chars',
      fc.property(fc.string({ minLength: 1, maxLength: 4 }), (short) => {
        const result = EmailSchema.safeParse(short);
        return result.success === false;
      }),
    );

    runProperty(
      'EmailSchema rejects emails without @ and domain',
      fc.property(
        fc.string({
          minLength: 5,
          maxLength: 50,
          unit: fc.constantFrom(...alphaLower.split('')),
        }),
        (noAt) => {
          const result = EmailSchema.safeParse(noAt);
          return result.success === false;
        },
      ),
    );

    runProperty(
      'PasswordSchema rejects passwords shorter than 8 chars',
      fc.property(fc.string({ minLength: 1, maxLength: 7 }), (short) => {
        const result = PasswordSchema.safeParse(short);
        return result.success === false;
      }),
    );

    runProperty(
      'PasswordSchema rejects passwords longer than 128 chars',
      fc.property(fc.string({ minLength: 129, maxLength: 200 }), (long) => {
        const result = PasswordSchema.safeParse(long);
        return result.success === false;
      }),
    );

    runProperty(
      'OutletCodeSchema rejects codes shorter than 3 chars',
      fc.property(
        fc.string({
          minLength: 1,
          maxLength: 2,
          unit: fc.constantFrom(...alphaAll.split('')),
        }),
        (short) => {
          const result = OutletCodeSchema.safeParse(short);
          return result.success === false;
        },
      ),
    );

    runProperty(
      'OutletCodeSchema rejects codes with non-alphanumeric chars',
      fc.property(
        fc
          .tuple(
            fc.string({
              minLength: 2,
              maxLength: 18,
              unit: fc.constantFrom(...alphaAll.split('')),
            }),
            fc.constantFrom('!', '@', '#', '$', '%', '^', '&', '*', '-', '_', ' '),
          )
          .map(([base, special]) => base + special),
        (invalid) => {
          const result = OutletCodeSchema.safeParse(invalid);
          return result.success === false;
        },
      ),
    );

    runProperty(
      'HHMMSchema rejects invalid time formats',
      fc.property(
        fc.oneof(
          // Hour out of range
          fc
            .tuple(fc.integer({ min: 24, max: 99 }), fc.integer({ min: 0, max: 59 }))
            .map(([h, m]) => `${h}:${m.toString().padStart(2, '0')}`),
          // Minute out of range
          fc
            .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 60, max: 99 }))
            .map(([h, m]) => `${h.toString().padStart(2, '0')}:${m}`),
          // Missing colon
          fc.string({
            minLength: 4,
            maxLength: 4,
            unit: fc.constantFrom(...'0123456789'.split('')),
          }),
        ),
        (invalid) => {
          const result = HHMMSchema.safeParse(invalid);
          return result.success === false;
        },
      ),
    );

    runProperty(
      'MenuItemDraftSchema rejects draft with basePrice out of range',
      fc.property(
        validMenuItemDraftArb.map((draft) => ({
          ...draft,
          basePrice: 10_000_001,
        })),
        (draft) => {
          const result = MenuItemDraftSchema.safeParse(draft);
          return result.success === false;
        },
      ),
    );

    runProperty(
      'MenuItemDraftSchema rejects draft with empty name',
      fc.property(
        validMenuItemDraftArb.map((draft) => ({
          ...draft,
          name: '',
        })),
        (draft) => {
          const result = MenuItemDraftSchema.safeParse(draft);
          return result.success === false;
        },
      ),
    );

    runProperty(
      'RecipeDraftSchema rejects draft with empty ingredients',
      fc.property(
        validRecipeDraftArb.map((draft) => ({
          ...draft,
          ingredients: [],
        })),
        (draft) => {
          const result = RecipeDraftSchema.safeParse(draft);
          return result.success === false;
        },
      ),
    );

    runProperty(
      'RecipeDraftSchema rejects draft with >50 ingredients',
      fc.property(
        fc.record({
          menuItemId: uuidArb,
          ingredients: fc.array(validRecipeIngredientArb, { minLength: 51, maxLength: 55 }),
        }),
        (draft) => {
          const result = RecipeDraftSchema.safeParse(draft);
          return result.success === false;
        },
      ),
    );

    runProperty(
      'TransactionDraftSchema rejects draft with empty lines',
      fc.property(
        validTransactionDraftArb.map((draft) => ({
          ...draft,
          lines: [],
        })),
        (draft) => {
          const result = TransactionDraftSchema.safeParse(draft);
          return result.success === false;
        },
      ),
    );
  });

  describe('3. Idempotency: schema.parse(schema.parse(x)) === schema.parse(x)', () => {
    runProperty(
      'EmailSchema parse is idempotent',
      fc.property(validEmailArb, (email) => {
        const first = EmailSchema.parse(email);
        const second = EmailSchema.parse(first);
        return first === second;
      }),
    );

    runProperty(
      'PasswordSchema parse is idempotent',
      fc.property(validPasswordArb, (password) => {
        const first = PasswordSchema.parse(password);
        const second = PasswordSchema.parse(first);
        return first === second;
      }),
    );

    runProperty(
      'OutletCodeSchema parse is idempotent',
      fc.property(validOutletCodeArb, (code) => {
        const first = OutletCodeSchema.parse(code);
        const second = OutletCodeSchema.parse(first);
        return first === second;
      }),
    );

    runProperty(
      'HHMMSchema parse is idempotent',
      fc.property(validHHMMArb, (time) => {
        const first = HHMMSchema.parse(time);
        const second = HHMMSchema.parse(first);
        return first === second;
      }),
    );

    runProperty(
      'MenuItemDraftSchema parse is idempotent',
      fc.property(validMenuItemDraftArb, (draft) => {
        const first = MenuItemDraftSchema.parse(draft);
        const second = MenuItemDraftSchema.parse(first);
        return JSON.stringify(first) === JSON.stringify(second);
      }),
    );

    runProperty(
      'RecipeDraftSchema parse is idempotent',
      fc.property(validRecipeDraftArb, (draft) => {
        const first = RecipeDraftSchema.parse(draft);
        const second = RecipeDraftSchema.parse(first);
        return JSON.stringify(first) === JSON.stringify(second);
      }),
    );

    runProperty(
      'TransactionDraftSchema parse is idempotent',
      fc.property(validTransactionDraftArb, (draft) => {
        const first = TransactionDraftSchema.parse(draft);
        const second = TransactionDraftSchema.parse(first);
        return JSON.stringify(first) === JSON.stringify(second);
      }),
    );
  });
});
