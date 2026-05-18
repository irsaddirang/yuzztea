import { z } from 'zod';

// ─── Primitives ──────────────────────────────────────────────────────────────

/**
 * Email: 5-254 chars, must contain "@" followed by domain with "."
 * Validates: Req 1.1
 */
export const EmailSchema = z
  .string()
  .min(5, 'Email minimal 5 karakter')
  .max(254, 'Email maksimal 254 karakter')
  .regex(/.+@.+\..+/, 'Format email tidak valid');

export type Email = z.infer<typeof EmailSchema>;

/**
 * Password: 8-128 chars
 * Validates: Req 1.1
 */
export const PasswordSchema = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(128, 'Password maksimal 128 karakter');

export type Password = z.infer<typeof PasswordSchema>;

/**
 * Outlet code: 3-20 chars, alphanumeric only
 * Validates: Req 3.2
 */
export const OutletCodeSchema = z
  .string()
  .min(3, 'Kode outlet minimal 3 karakter')
  .max(20, 'Kode outlet maksimal 20 karakter')
  .regex(/^[A-Za-z0-9]+$/, 'Kode outlet hanya boleh alfanumerik');

export type OutletCode = z.infer<typeof OutletCodeSchema>;

/**
 * Time format HH:MM (00:00 - 23:59)
 * Validates: Req 3.2
 */
export const HHMMSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Format waktu harus HH:MM (00:00-23:59)');

export type HHMM = z.infer<typeof HHMMSchema>;

/**
 * WhatsApp number: 10-15 digits
 * Validates: Req 8.6
 */
export const WhatsappSchema = z
  .string()
  .regex(/^\d{10,15}$/, 'Nomor WhatsApp harus 10-15 digit angka');

export type Whatsapp = z.infer<typeof WhatsappSchema>;

/**
 * Email contact for receipt sharing
 * Validates: Req 8.6
 */
export const EmailContactSchema = z.string().regex(/.+@.+\..+/, 'Format email kontak tidak valid');

export type EmailContact = z.infer<typeof EmailContactSchema>;

// ─── Enums ───────────────────────────────────────────────────────────────────

export const RoleEnum = z.enum(['owner', 'outlet_manager', 'cashier']);
export type Role = z.infer<typeof RoleEnum>;

export const RawMaterialUnitEnum = z.enum(['gram', 'ml', 'pcs', 'liter', 'kg']);
export type RawMaterialUnit = z.infer<typeof RawMaterialUnitEnum>;

export const PaymentMethodEnum = z.enum(['tunai', 'qris', 'transfer']);
export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const TransactionStatusEnum = z.enum([
  'pending',
  'confirmed',
  'cancelled',
  'refunded',
  'pending_reconciliation',
  'pending_sync',
  'conflict_review',
]);
export type TransactionStatus = z.infer<typeof TransactionStatusEnum>;

export const ImageMimeEnum = z.enum(['image/jpeg', 'image/png', 'image/webp']);
export type ImageMime = z.infer<typeof ImageMimeEnum>;

// ─── Entity Drafts ───────────────────────────────────────────────────────────

/**
 * Outlet draft for create/update
 * Validates: Req 3.2, 3.3
 */
export const OutletDraftSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Nama outlet wajib diisi')
      .max(100, 'Nama outlet maksimal 100 karakter'),
    code: OutletCodeSchema,
    address: z.string().min(1, 'Alamat wajib diisi').max(255, 'Alamat maksimal 255 karakter'),
    city: z.string().min(1, 'Kota wajib diisi').max(50, 'Kota maksimal 50 karakter'),
    openTime: HHMMSchema,
    closeTime: HHMMSchema,
  })
  .refine((data) => data.closeTime > data.openTime, {
    message: 'Jam tutup harus lebih besar dari jam buka',
    path: ['closeTime'],
  });

export type OutletDraft = z.infer<typeof OutletDraftSchema>;

/**
 * Menu item draft for create/update
 * Validates: Req 5.1, 5.2
 */
export const MenuItemDraftSchema = z.object({
  name: z.string().min(1, 'Nama menu wajib diisi').max(100, 'Nama menu maksimal 100 karakter'),
  category: z.string().min(1, 'Kategori wajib diisi').max(50, 'Kategori maksimal 50 karakter'),
  basePrice: z
    .number()
    .int('Harga harus bilangan bulat')
    .min(0, 'Harga minimal 0')
    .max(10_000_000, 'Harga maksimal 10.000.000'),
  description: z.string().max(500, 'Deskripsi maksimal 500 karakter').optional(),
  unit: z.string().min(1, 'Satuan wajib diisi'),
  active: z.boolean(),
  imageBytes: z
    .number()
    .max(2 * 1024 * 1024, 'Ukuran gambar maksimal 2 MB')
    .optional(),
  imageMime: ImageMimeEnum.optional(),
});

export type MenuItemDraft = z.infer<typeof MenuItemDraftSchema>;

/**
 * User draft for create/update
 * Validates: Req 4.1
 */
export const UserDraftSchema = z.object({
  username: z
    .string()
    .min(3, 'Username minimal 3 karakter')
    .max(64, 'Username maksimal 64 karakter'),
  email: EmailSchema,
  role: RoleEnum,
  displayName: z.string().min(1, 'Nama tampilan wajib diisi').optional(),
  active: z.boolean(),
});

export type UserDraft = z.infer<typeof UserDraftSchema>;

/**
 * Outlet assignment: at least 1 outlet_id required for Manager/Cashier
 * Validates: Req 4.3, 4.4
 */
export const OutletAssignmentSchema = z.object({
  userId: z.string().uuid('User ID harus UUID valid'),
  outletIds: z
    .array(z.string().uuid('Outlet ID harus UUID valid'))
    .min(1, 'Minimal 1 outlet harus ditugaskan'),
});

export type OutletAssignment = z.infer<typeof OutletAssignmentSchema>;

// ─── Inventory ───────────────────────────────────────────────────────────────

/**
 * Raw material definition
 * Validates: Req 6.1
 */
export const RawMaterialSchema = z.object({
  name: z
    .string()
    .min(1, 'Nama bahan baku wajib diisi')
    .max(100, 'Nama bahan baku maksimal 100 karakter'),
  unit: RawMaterialUnitEnum,
});

export type RawMaterial = z.infer<typeof RawMaterialSchema>;

/**
 * Raw material stock per outlet
 * Validates: Req 6.1
 */
export const RawMaterialStockSchema = z.object({
  rawMaterialId: z.string().uuid('Raw material ID harus UUID valid'),
  outletId: z.string().uuid('Outlet ID harus UUID valid'),
  quantity: z
    .number()
    .min(0, 'Kuantitas minimal 0')
    .max(999_999.99, 'Kuantitas maksimal 999.999,99'),
  minQuantity: z
    .number()
    .min(0, 'Kuantitas minimum minimal 0')
    .max(999_999.99, 'Kuantitas minimum maksimal 999.999,99'),
});

export type RawMaterialStock = z.infer<typeof RawMaterialStockSchema>;

/**
 * Single recipe ingredient
 * Validates: Req 6.2
 */
export const RecipeIngredientSchema = z.object({
  rawMaterialId: z.string().uuid('Raw material ID harus UUID valid'),
  qtyPerUnit: z
    .number()
    .gt(0, 'Kuantitas per unit harus lebih dari 0')
    .max(999_999.99, 'Kuantitas per unit maksimal 999.999,99'),
});

export type RecipeIngredient = z.infer<typeof RecipeIngredientSchema>;

/**
 * Recipe draft: 1 to 50 ingredients per menu item
 * Validates: Req 6.2, 6.3
 */
export const RecipeDraftSchema = z.object({
  menuItemId: z.string().uuid('Menu item ID harus UUID valid'),
  ingredients: z
    .array(RecipeIngredientSchema)
    .min(1, 'Recipe harus memiliki minimal 1 ingredient')
    .max(50, 'Recipe maksimal 50 ingredients'),
});

export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

/**
 * Stock receiving draft
 * Validates: Req 6.6, 6.8
 */
export const ReceivingDraftSchema = z.object({
  outletId: z.string().uuid('Outlet ID harus UUID valid'),
  rawMaterialId: z.string().uuid('Raw material ID harus UUID valid'),
  quantity: z
    .number()
    .min(0, 'Kuantitas minimal 0')
    .max(999_999.99, 'Kuantitas maksimal 999.999,99'),
  supplier: z
    .string()
    .min(1, 'Nama supplier minimal 1 karakter')
    .max(100, 'Nama supplier maksimal 100 karakter')
    .optional(),
  unitPrice: z
    .number()
    .min(0, 'Harga satuan minimal 0')
    .max(1_000_000, 'Harga satuan maksimal 1.000.000')
    .optional(),
});

export type ReceivingDraft = z.infer<typeof ReceivingDraftSchema>;

/**
 * Stock opname (adjustment) draft
 * Validates: Req 6.7, 6.8
 */
export const OpnameDraftSchema = z.object({
  outletId: z.string().uuid('Outlet ID harus UUID valid'),
  rawMaterialId: z.string().uuid('Raw material ID harus UUID valid'),
  qtyAfter: z
    .number()
    .min(0, 'Kuantitas sesudah minimal 0')
    .max(999_999.99, 'Kuantitas sesudah maksimal 999.999,99'),
  reason: z.string().min(1, 'Alasan wajib diisi').max(500, 'Alasan maksimal 500 karakter'),
});

export type OpnameDraft = z.infer<typeof OpnameDraftSchema>;

// ─── Transaction ─────────────────────────────────────────────────────────────

/**
 * Transaction line item
 */
const TransactionLineSchema = z.object({
  menuItemId: z.string().uuid('Menu item ID harus UUID valid'),
  nameSnapshot: z.string().min(1, 'Nama item wajib diisi'),
  unitPrice: z.number().int('Harga harus bilangan bulat').min(0, 'Harga minimal 0'),
  quantity: z.number().int('Kuantitas harus bilangan bulat').min(1, 'Kuantitas minimal 1'),
});

/**
 * Transaction draft for creating a new transaction
 * Validates: Req 7.4
 */
export const TransactionDraftSchema = z.object({
  outletId: z.string().uuid('Outlet ID harus UUID valid'),
  cashierUserId: z.string().uuid('Cashier user ID harus UUID valid'),
  lines: z
    .array(TransactionLineSchema)
    .min(1, 'Transaksi harus memiliki minimal 1 item')
    .max(100, 'Transaksi maksimal 100 item'),
  subtotal: z.number().int().min(0),
  discount: z.number().int().min(0),
  tax: z.number().int().min(0),
  total: z.number().int().min(0),
  paymentMethod: PaymentMethodEnum,
  amountPaid: z.number().int().min(0),
  changeDue: z.number().int().min(0),
  deviceId: z.string().optional(),
});

export type TransactionDraft = z.infer<typeof TransactionDraftSchema>;

/**
 * Refund context: validates conditions for issuing a refund
 * Validates: Req 7.10, 7.11
 */
export const RefundContextSchema = z.object({
  transactionId: z.string().uuid('Transaction ID harus UUID valid'),
  transactionStatus: z.literal('confirmed', {
    errorMap: () => ({ message: 'Hanya transaksi berstatus confirmed yang dapat di-refund' }),
  }),
  createdAt: z.coerce.date(),
  alreadyRefunded: z.literal(false, {
    errorMap: () => ({ message: 'Transaksi sudah pernah di-refund' }),
  }),
  issuedBy: z.string().uuid('Issued by harus UUID valid'),
});

export type RefundContext = z.infer<typeof RefundContextSchema>;

// ─── Filters ─────────────────────────────────────────────────────────────────

/**
 * Date range filter: start <= end, max 12 months for reports (Req 9.2, 9.3)
 * Also used for audit log with max 24 months (Req 14.3, 14.4)
 */
export const DateRangeFilterSchema = z
  .object({
    startDate: z.coerce.date({ required_error: 'Tanggal mulai wajib diisi' }),
    endDate: z.coerce.date({ required_error: 'Tanggal akhir wajib diisi' }),
    maxMonths: z.number().int().min(1).max(24).default(12),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'Tanggal mulai harus sama atau sebelum tanggal akhir',
    path: ['startDate'],
  })
  .refine(
    (data) => {
      const diffMs = data.endDate.getTime() - data.startDate.getTime();
      const maxMs = data.maxMonths * 30.44 * 24 * 60 * 60 * 1000; // approximate months
      return diffMs <= maxMs;
    },
    {
      message: 'Rentang tanggal melebihi batas maksimum',
      path: ['endDate'],
    },
  );

export type DateRangeFilter = z.infer<typeof DateRangeFilterSchema>;

/**
 * Audit log filter
 * Validates: Req 14.3, 14.4
 */
export const AuditLogFilterSchema = z
  .object({
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    actionType: z.string().optional(),
    outletId: z.string().uuid('Outlet ID harus UUID valid').optional(),
    userId: z.string().uuid('User ID harus UUID valid').optional(),
    page: z.number().int().min(1).default(1),
    pageSize: z.number().int().min(1).max(100).default(50),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return data.startDate <= data.endDate;
      }
      return true;
    },
    {
      message: 'Tanggal mulai harus sama atau sebelum tanggal akhir',
      path: ['startDate'],
    },
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        const diffMs = data.endDate.getTime() - data.startDate.getTime();
        const maxMs = 24 * 30.44 * 24 * 60 * 60 * 1000; // 24 months
        return diffMs <= maxMs;
      }
      return true;
    },
    {
      message: 'Rentang tanggal audit log maksimal 24 bulan',
      path: ['endDate'],
    },
  );

export type AuditLogFilter = z.infer<typeof AuditLogFilterSchema>;
