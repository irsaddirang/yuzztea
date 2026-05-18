import { describe, it, expect } from 'vitest';

import {
  EmailSchema,
  PasswordSchema,
  OutletCodeSchema,
  HHMMSchema,
  WhatsappSchema,
  EmailContactSchema,
  OutletDraftSchema,
  MenuItemDraftSchema,
  UserDraftSchema,
  OutletAssignmentSchema,
  RawMaterialSchema,
  RawMaterialStockSchema,
  RecipeIngredientSchema,
  RecipeDraftSchema,
  ReceivingDraftSchema,
  OpnameDraftSchema,
  TransactionDraftSchema,
  RefundContextSchema,
  DateRangeFilterSchema,
  AuditLogFilterSchema,
} from '../index';

describe('Validators smoke test - all schemas export and parse correctly', () => {
  it('EmailSchema accepts valid email', () => {
    expect(EmailSchema.safeParse('user@example.com').success).toBe(true);
  });

  it('EmailSchema rejects invalid email', () => {
    expect(EmailSchema.safeParse('abc').success).toBe(false);
    expect(EmailSchema.safeParse('a@b').success).toBe(false);
  });

  it('PasswordSchema accepts valid password', () => {
    expect(PasswordSchema.safeParse('12345678').success).toBe(true);
  });

  it('PasswordSchema rejects short password', () => {
    expect(PasswordSchema.safeParse('1234567').success).toBe(false);
  });

  it('OutletCodeSchema accepts alphanumeric 3-20', () => {
    expect(OutletCodeSchema.safeParse('YZT01').success).toBe(true);
  });

  it('OutletCodeSchema rejects special chars', () => {
    expect(OutletCodeSchema.safeParse('YZT-01').success).toBe(false);
  });

  it('HHMMSchema accepts valid time', () => {
    expect(HHMMSchema.safeParse('08:30').success).toBe(true);
    expect(HHMMSchema.safeParse('23:59').success).toBe(true);
  });

  it('HHMMSchema rejects invalid time', () => {
    expect(HHMMSchema.safeParse('24:00').success).toBe(false);
    expect(HHMMSchema.safeParse('8:30').success).toBe(false);
  });

  it('WhatsappSchema accepts 10-15 digits', () => {
    expect(WhatsappSchema.safeParse('6281234567890').success).toBe(true);
  });

  it('WhatsappSchema rejects non-digits', () => {
    expect(WhatsappSchema.safeParse('+6281234567890').success).toBe(false);
  });

  it('EmailContactSchema accepts valid email', () => {
    expect(EmailContactSchema.safeParse('test@mail.co').success).toBe(true);
  });

  it('OutletDraftSchema accepts valid outlet', () => {
    const result = OutletDraftSchema.safeParse({
      name: 'Yuzztea Bandung',
      code: 'YZT01',
      address: 'Jl. Merdeka No. 1',
      city: 'Bandung',
      openTime: '08:00',
      closeTime: '22:00',
    });
    expect(result.success).toBe(true);
  });

  it('OutletDraftSchema rejects closeTime <= openTime', () => {
    const result = OutletDraftSchema.safeParse({
      name: 'Yuzztea Bandung',
      code: 'YZT01',
      address: 'Jl. Merdeka No. 1',
      city: 'Bandung',
      openTime: '22:00',
      closeTime: '08:00',
    });
    expect(result.success).toBe(false);
  });

  it('MenuItemDraftSchema accepts valid menu item', () => {
    const result = MenuItemDraftSchema.safeParse({
      name: 'Es Teh Original',
      category: 'Minuman',
      basePrice: 15000,
      unit: 'cup',
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it('MenuItemDraftSchema rejects image > 2MB', () => {
    const result = MenuItemDraftSchema.safeParse({
      name: 'Es Teh Original',
      category: 'Minuman',
      basePrice: 15000,
      unit: 'cup',
      active: true,
      imageBytes: 3 * 1024 * 1024,
    });
    expect(result.success).toBe(false);
  });

  it('UserDraftSchema accepts valid user', () => {
    const result = UserDraftSchema.safeParse({
      username: 'kasir01',
      email: 'kasir01@yuzztea.com',
      role: 'cashier',
      active: true,
    });
    expect(result.success).toBe(true);
  });

  it('OutletAssignmentSchema requires at least 1 outlet', () => {
    const result = OutletAssignmentSchema.safeParse({
      userId: '550e8400-e29b-41d4-a716-446655440000',
      outletIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('RawMaterialSchema accepts valid material', () => {
    const result = RawMaterialSchema.safeParse({
      name: 'Gula Pasir',
      unit: 'gram',
    });
    expect(result.success).toBe(true);
  });

  it('RawMaterialStockSchema accepts valid stock', () => {
    const result = RawMaterialStockSchema.safeParse({
      rawMaterialId: '550e8400-e29b-41d4-a716-446655440000',
      outletId: '550e8400-e29b-41d4-a716-446655440001',
      quantity: 500.5,
      minQuantity: 100,
    });
    expect(result.success).toBe(true);
  });

  it('RecipeIngredientSchema rejects qtyPerUnit = 0', () => {
    const result = RecipeIngredientSchema.safeParse({
      rawMaterialId: '550e8400-e29b-41d4-a716-446655440000',
      qtyPerUnit: 0,
    });
    expect(result.success).toBe(false);
  });

  it('RecipeDraftSchema accepts 1-50 ingredients', () => {
    const result = RecipeDraftSchema.safeParse({
      menuItemId: '550e8400-e29b-41d4-a716-446655440000',
      ingredients: [{ rawMaterialId: '550e8400-e29b-41d4-a716-446655440001', qtyPerUnit: 10 }],
    });
    expect(result.success).toBe(true);
  });

  it('RecipeDraftSchema rejects 0 ingredients', () => {
    const result = RecipeDraftSchema.safeParse({
      menuItemId: '550e8400-e29b-41d4-a716-446655440000',
      ingredients: [],
    });
    expect(result.success).toBe(false);
  });

  it('RecipeDraftSchema rejects 51 ingredients', () => {
    const ingredients = Array.from({ length: 51 }, (_, i) => ({
      rawMaterialId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
      qtyPerUnit: 1,
    }));
    const result = RecipeDraftSchema.safeParse({
      menuItemId: '550e8400-e29b-41d4-a716-446655440000',
      ingredients,
    });
    expect(result.success).toBe(false);
  });

  it('ReceivingDraftSchema accepts valid receiving', () => {
    const result = ReceivingDraftSchema.safeParse({
      outletId: '550e8400-e29b-41d4-a716-446655440000',
      rawMaterialId: '550e8400-e29b-41d4-a716-446655440001',
      quantity: 100,
    });
    expect(result.success).toBe(true);
  });

  it('OpnameDraftSchema accepts valid opname', () => {
    const result = OpnameDraftSchema.safeParse({
      outletId: '550e8400-e29b-41d4-a716-446655440000',
      rawMaterialId: '550e8400-e29b-41d4-a716-446655440001',
      qtyAfter: 50,
      reason: 'Penyesuaian setelah stock opname fisik',
    });
    expect(result.success).toBe(true);
  });

  it('TransactionDraftSchema accepts valid transaction', () => {
    const result = TransactionDraftSchema.safeParse({
      outletId: '550e8400-e29b-41d4-a716-446655440000',
      cashierUserId: '550e8400-e29b-41d4-a716-446655440001',
      lines: [
        {
          menuItemId: '550e8400-e29b-41d4-a716-446655440002',
          nameSnapshot: 'Es Teh Original',
          unitPrice: 15000,
          quantity: 2,
        },
      ],
      subtotal: 30000,
      discount: 0,
      tax: 0,
      total: 30000,
      paymentMethod: 'tunai',
      amountPaid: 50000,
      changeDue: 20000,
    });
    expect(result.success).toBe(true);
  });

  it('RefundContextSchema rejects non-confirmed status', () => {
    const result = RefundContextSchema.safeParse({
      transactionId: '550e8400-e29b-41d4-a716-446655440000',
      transactionStatus: 'pending',
      createdAt: new Date(),
      alreadyRefunded: false,
      issuedBy: '550e8400-e29b-41d4-a716-446655440001',
    });
    expect(result.success).toBe(false);
  });

  it('DateRangeFilterSchema accepts valid range', () => {
    const result = DateRangeFilterSchema.safeParse({
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
    });
    expect(result.success).toBe(true);
  });

  it('DateRangeFilterSchema rejects start > end', () => {
    const result = DateRangeFilterSchema.safeParse({
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-01-01'),
    });
    expect(result.success).toBe(false);
  });

  it('DateRangeFilterSchema rejects range > 12 months (default)', () => {
    const result = DateRangeFilterSchema.safeParse({
      startDate: new Date('2022-01-01'),
      endDate: new Date('2024-06-01'),
    });
    expect(result.success).toBe(false);
  });

  it('AuditLogFilterSchema accepts valid filter', () => {
    const result = AuditLogFilterSchema.safeParse({
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-06-01'),
      actionType: 'menu.price_change',
      page: 1,
      pageSize: 50,
    });
    expect(result.success).toBe(true);
  });

  it('AuditLogFilterSchema rejects range > 24 months', () => {
    const result = AuditLogFilterSchema.safeParse({
      startDate: new Date('2020-01-01'),
      endDate: new Date('2024-06-01'),
    });
    expect(result.success).toBe(false);
  });
});
