# Implementation Plan: Yuzztea POS SaaS

## Overview

Implementasi mengikuti urutan: bootstrap proyek → backend Supabase (schema, RLS, RPC) → validator Zod yang dipakai bersama → modul Domain murni dengan property test → data layer (repository + Dexie + sync queue) → komponen cross-cutting (Shell, GlassCard, ConnectionBadge, PrintButton, tema) → autentikasi & routing → realtime → modul POS → modul admin (Outlets, Users, Menu, Inventory, Reports, Audit) → wiring shell → integration / E2E / visual / bundle smoke → CI/CD GitHub Pages.

Setiap task merujuk ke requirement (Req X.Y) dan, untuk property test, ke nomor properti (P1-P26) di `design.md`. Sub-task bertanda `*` adalah opsional (umumnya tes), tetap masuk dependency graph. Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui (selektif) + Supabase JS + TanStack Query v5 + Zustand + React Hook Form + Zod + Dexie + date-fns(-tz) + Recharts + lucide-react. Test: Vitest + fast-check + Testing Library + Playwright.

## Tasks

- [ ] 1. Bootstrap project dan tooling
  - [ ] 1.1 Inisialisasi Vite + React 18 + TypeScript SPA dengan struktur folder src/{app,domain,data,features,components,lib,styles,test}
    - Buat `package.json`, `tsconfig.json` (strict), `vite.config.ts` dengan `base: './'` (HashRouter compatible), `index.html`, `src/main.tsx`, `src/App.tsx` placeholder
    - Tambahkan dependency: `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js`, `@tanstack/react-query`, `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`, `dexie`, `dexie-react-hooks`, `date-fns`, `date-fns-tz`, `recharts`, `lucide-react`, `clsx`, `tailwind-merge`, `jspdf`, `uuid`
    - _Requirements: 13.4_
  - [ ] 1.2 Konfigurasi Tailwind + token brand Yuzztea + dark mode `class`
    - Setup `tailwind.config.ts`, `postcss.config.js`, `src/styles/globals.css` dengan CSS variables `--brand-primary`, `--brand-secondary`, `--brand-accent`, `--surface-bg`, `--surface-card`, `--surface-card-solid`, `--text-strong`, `--text-muted`, dan token state (success/warning/error/info) untuk light + dark
    - Daftarkan font Satoshi/DM Sans (heading), Inter (body), JetBrains Mono (tabular)
    - Tambahkan utilitas glassmorphism (`.glass`, `.glass-solid`) dengan `backdrop-blur-md`, opasitas 0.78 light / 0.55 dark, border 1px halus
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 12.6_
  - [ ] 1.3 Setup Vitest + fast-check + Testing Library + jsdom
    - Buat `vitest.config.ts` dengan `setupFiles: ['src/test/setup.ts']`, jsdom env, alias `@/`
    - Tambahkan `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `fast-check`, `vitest`, `jsdom`
    - Konfigurasi seed deterministik fast-check `0xC0FFEE`, helper `runProperty(name, prop, runs=100)` di `src/test/property.ts`
    - _Requirements: testing strategy (Properties 1-26)_
  - [ ] 1.4 Setup Playwright untuk E2E + visual
    - `playwright.config.ts` dengan project Chromium + WebKit, viewport profil 360, 768, 1024, 1440
    - Folder `e2e/` dengan helper login fixture, network throttle, dan snapshot dir
    - _Requirements: 12.1, 12.2_
  - [ ] 1.5 Setup ESLint + Prettier + commit hooks
    - `eslint.config.js` dengan plugin React, TypeScript, jsx-a11y, react-hooks, import order
    - `.prettierrc` (semicolons true, trailingComma 'all', printWidth 100), `lint-staged` + `husky` (opsional)
    - Skrip `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`
    - _Requirements: 13.4_
  - [ ] 1.6 Konfigurasi env + Supabase client wrapper
    - Buat `.env.example` dengan `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
    - `src/lib/supabase.ts`: factory `createClient` (anon only), throw saat key kosong; **assert** `service_role` tidak ada di import.meta.env
    - _Requirements: 15.1, 15.2_

- [ ] 2. Supabase backend: schema, RLS, dan SECURITY DEFINER functions
  - [ ] 2.1 Skema migrasi awal (organization, outlet, user_profile, outlet_assignment)
    - File `supabase/migrations/0001_init.sql` membuat tabel organization, outlet (cek `close_time > open_time`, kode unik dalam org), user_profile (enum role), outlet_assignment, indeks pada `outlet_id`, `user_id`, `organization_id`
    - Trigger `updated_at` otomatis
    - _Requirements: 2.1, 3.2, 3.6, 4.1_
  - [ ] 2.2 Skema menu, recipe, raw_material, dan stock
    - File `supabase/migrations/0002_menu_inventory.sql`: menu_item, menu_item_outlet (overlay PK), menu_price_history, raw_material, raw_material_stock (PK komposit), recipe_ingredient (cek 1..50 per menu), outlet_hours_history
    - Constraint check pada `base_price` (0..10_000_000), `qty_per_unit` (>0..999_999.99), `quantity` numeric(10,2)
    - _Requirements: 3.5, 5.1, 5.7, 6.1, 6.2, 6.3_
  - [ ] 2.3 Skema transaction, transaction_line, refund, stock_receiving, stock_opname, audit_log
    - File `supabase/migrations/0003_tx_audit.sql`: transaction (enum status lengkap termasuk pending_sync/conflict_review, check `subtotal-discount+tax = total`), transaction_line (snapshot price), refund (unique per transaction_id), stock_receiving, stock_opname dengan diff computed, audit_log insert-only
    - Indeks pada `outlet_id`, `created_at desc`, `cashier_user_id`, `(menu_item_id, created_at)` untuk top-N
    - _Requirements: 5.7, 6.6, 6.7, 7.4, 7.10, 14.2_
  - [ ] 2.4 RLS policies untuk semua tabel multi-tenant
    - Helper SQL: `current_org()`, `current_role_norm()`, `current_active_outlet_ids()`
    - Policy SELECT/INSERT/UPDATE/DELETE per tabel sesuai matriks (Owner=org-wide, Manager/Cashier=outlet IN assignment, audit_log SELECT owner only, UPDATE/DELETE blocked)
    - Test SQL fixture mendemonstrasikan isolasi (digunakan integration test)
    - _Requirements: 2.2, 2.3, 2.4, 2.7, 2.8, 14.5, 14.6, 15.2_
  - [ ] 2.5 SECURITY DEFINER functions untuk operasi atomic
    - `create_transaction(payload jsonb)`: insert tx + tx_lines + dec stok + insert audit (jika refund) dalam satu transaksi; mengembalikan id tx atau error spesifik
    - `refund_transaction(tx_id uuid)`: cek 24h window + status confirmed + belum refunded; insert refund, ubah status, kembalikan stok, insert audit
    - `record_audit(payload jsonb)`: insert ke audit_log dengan validasi (entity, action_type whitelist), truncate value_before/value_after ke 2000 char
    - `log_unauthorized_outlet_attempt(outlet_id uuid, action text)` insert audit "auth.unauthorized_outlet"
    - _Requirements: 6.4, 7.7, 7.8, 7.10, 7.11, 14.1, 14.2, 14.6, 2.8_
  - [ ] 2.6 Trigger menu price history dan outlet hours history
    - Trigger `BEFORE UPDATE` pada `menu_item` / `menu_item_outlet` insert ke `menu_price_history` jika harga berubah; retensi 24 bulan via cron pg_cron atau view `WHERE effective_at >= now() - interval '24 months'`
    - Trigger pada `outlet` saat jam berubah → insert `outlet_hours_history` (retensi 365 hari)
    - _Requirements: 3.5, 5.7_
  - [ ] 2.7 Realtime publication setup
    - `ALTER PUBLICATION supabase_realtime ADD TABLE transaction, transaction_line, raw_material_stock, menu_item_outlet, menu_item;`
    - Pastikan replikasi mengikuti RLS via row filter publication (Postgres 15+)
    - _Requirements: 10.1, 10.2_

- [ ] 3. Shared Zod validators (Property 16)
  - [ ] 3.1 Implementasi seluruh schema entitas di `src/domain/validators/index.ts`
    - `EmailSchema`, `PasswordSchema`, `OutletDraftSchema`, `OutletCodeSchema`, `HHMMSchema`, `MenuItemDraftSchema` (image bytes max 2MB, mime JPEG/PNG/WebP), `UserDraftSchema`, `OutletAssignmentSchema`, `RawMaterialSchema`, `RawMaterialStockSchema`, `RecipeIngredientSchema`, `RecipeDraftSchema` (1..50 ingredients), `ReceivingDraftSchema`, `OpnameDraftSchema`, `TransactionDraftSchema`, `RefundContextSchema`, `WhatsappSchema`, `EmailContactSchema`, `DateRangeFilterSchema` (mulai <= akhir, max 12/24 bulan), `AuditLogFilterSchema`
    - Ekspor type via `z.infer`
    - _Requirements: 1.1, 3.2, 3.3, 4.1, 4.3, 4.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.6, 6.7, 6.8, 8.6, 9.2, 9.3, 14.3, 14.4_
  - [ ]* 3.2 Property test untuk validator (Property 16)
    - **Property 16: Entity validators** — semua schema menerima input valid dan menolak input dengan satu pelanggaran field; `schema.parse(schema.parse(x))` deterministik untuk input valid
    - **Validates: Requirements 3.2, 3.3, 4.1, 4.3, 4.4, 5.1, 5.2, 6.1, 6.2, 6.3, 6.6, 6.7, 6.8, 8.6, 9.2, 9.3, 14.3, 14.4**
    - File `src/domain/validators/__tests__/validators.property.test.ts`
  - [ ]* 3.3 Unit test contoh konkret untuk validator
    - Email batas 5/254, password batas 8/128, outlet code 3/20 alfanumerik, HH:MM range, image > 2MB ditolak, recipe 0/51 ingredient ditolak
    - _Requirements: 1.1, 3.2, 5.1, 6.2_

- [ ] 4. Domain - Auth, Session, Throttle, Route Guard, Storage Hygiene
  - [ ] 4.1 Implementasi `authThrottle.ts` (Property 8)
    - `recordFailure(state, now)`, `canAttempt(state, now)`, jendela 10 menit, backoff `min(2^(n-5)*1000, 300_000)` ms setelah 5 kegagalan
    - _Requirements: 1.6, 15.7, 15.8_
  - [ ] 4.2 Implementasi `sessionExpiry.ts` (Property 7)
    - `isSessionExpired(lastActivityAt, now)` `true` iff selisih `>= 12 * 3600 * 1000` ms; helper `touchActivity(state, now)`
    - _Requirements: 1.3_
  - [ ] 4.3 Implementasi `authorize.ts` predikat (Property 5)
    - Tipe `Role`, `ResourceScope`, fungsi `authorize({role, userOutletIds, scope, requestedOutletId})` dengan tabel keputusan (Owner/Manager/Cashier × pos/management/audit)
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 4.2, 4.5, 5.4, 14.5_
  - [ ] 4.4 Implementasi `routeGuard.ts` (Property 6)
    - Konstanta `publicRoutes`, `adminRoutes`, fungsi `routeGuard(route, session)` mengembalikan `{kind:'allow'} | {kind:'redirect', to:string}`
    - _Requirements: 1.5, 2.5, 2.6, 14.5_
  - [ ] 4.5 Implementasi `sessionStorageAdapter.ts` (Property 26)
    - `storeSession(session)` menulis hanya ke `sessionStorage` dengan key `yuzztea_session_*`; pastikan password tidak masuk; tidak menambahkan ke URL/hash
    - `clearSession()` menghapus semua key prefix tersebut
    - _Requirements: 1.4, 15.4, 15.5, 15.6_
  - [ ]* 4.6 Property tests untuk auth domain (Properties 5, 6, 7, 8, 26)
    - **Property 5: Authorization predicate** — Validates: Requirements 2.2, 2.3, 2.4, 2.5, 4.2, 4.5, 5.4, 14.5
    - **Property 6: Route guard determinism** — Validates: Requirements 1.5, 2.5, 2.6, 14.5
    - **Property 7: Idle session expiry** — Validates: Requirements 1.3
    - **Property 8: Login throttle backoff** — Validates: Requirements 1.6, 15.7, 15.8
    - **Property 26: Storage hygiene** — Validates: Requirements 1.4, 15.4, 15.5, 15.6
    - File: `src/domain/auth/__tests__/auth.property.test.ts`

- [ ] 5. Domain - Cart Engine, Payment, Stock Helpers
  - [ ] 5.1 Implementasi `cartEngine.ts`
    - Tipe `CartLine`, `Discount`, `TaxRule`, `CartTotals`; fungsi `addLine`, `setQty`, `removeLine`, `clamp`, `computeTotals`
    - Aturan: subtotal int, total = max(0, subtotal-discount)+tax, tax floor((subtotal-discount)*rate/100) saat aktif, kapasitas 100 baris (Req 7.2)
    - _Requirements: 7.2_
  - [ ] 5.2 Implementasi `paymentValidator.ts`
    - `validatePayment({total, amountPaid, method})` → `Result<ConfirmedPayment, PaymentError>`; tunai: paid >= total; QRIS/transfer: paid === total; `changeDue(method, total, paid)` 0 untuk non-tunai
    - _Requirements: 7.3, 7.5, 7.6_
  - [ ]* 5.3 Property tests untuk cart & payment (Properties 1, 2)
    - **Property 1: Cart totals correctness** — Validates: Requirements 7.2
    - **Property 2: Payment validation** — Validates: Requirements 7.5, 7.6
    - File: `src/domain/cart/__tests__/cart.property.test.ts`
  - [ ]* 5.4 Unit test konkret cart edge cases
    - 0 line → totals nol; diskon > subtotal → total 0; tax disabled → tax = 0; line ke-101 ditolak
    - _Requirements: 7.2_

- [ ] 6. Domain - Recipe Engine, Stock Shortfall, Menu Propagation
  - [ ] 6.1 Implementasi `recipeEngine.ts`
    - `requiredMaterials(recipes, lines)` agregasi qty per raw_material; `applyDeduction(stock, req)`, `applyRefund(stock, req)`, `checkAvailability(req, stock)` (Property 4)
    - _Requirements: 6.4, 6.9, 7.7, 7.10_
  - [ ] 6.2 Implementasi `menuVisibility.ts` (Property 17)
    - `isVisibleInPos(menuItem, override?, outlet)` boolean; `effectivePrice(menuItem, override?)` integer; `effectiveMenuList(menus, overrides, outlet)` daftar terurut kategori
    - _Requirements: 3.4, 5.3, 5.5_
  - [ ] 6.3 Implementasi `deleteWithHistory.ts` (Property 18)
    - `canDeleteMenuItem(menuItemId, transactionCount)` → `Result<true, 'MENU_HAS_TX_HISTORY'>`
    - _Requirements: 5.8_
  - [ ]* 6.4 Property tests untuk recipe & menu (Properties 3, 4, 17, 18)
    - **Property 3: Stock deduction round-trip with refund** — Validates: Requirements 6.4, 7.7, 7.10
    - **Property 4: Stock shortfall reporting** — Validates: Requirements 6.9
    - **Property 17: Menu availability propagation** — Validates: Requirements 3.4, 5.3, 5.5
    - **Property 18: Delete-with-history protection** — Validates: Requirements 5.8
    - File: `src/domain/inventory/__tests__/recipe.property.test.ts`

- [ ] 7. Domain - Receipt Formatter
  - [ ] 7.1 Implementasi `receiptFormatter.ts`
    - `formatRupiah(n)` locale id-ID tanpa desimal, `formatJakartaTime(d)` `DD/MM/YYYY HH:mm:ss`
    - `formatReceipt(input, width: 58|58|80)` produce teks deterministik 32 cols (58mm) / 48 cols (80mm), word-aware wrap, label `REPRINT` + timestamp jika `reprint` ada (Req 8.8)
    - _Requirements: 8.1, 8.2, 8.3, 8.8_
  - [ ] 7.2 Implementasi `receiptShare.ts` & `printFailure.ts` (Property 15)
    - `validateContact({whatsapp?, email?})` schema; `buildWaShareUrl`, `buildMailtoUrl`
    - `handlePrintFailure(tx)` → `{tx, action:'savePdf'}` tanpa mengubah `tx.status`
    - _Requirements: 8.5, 8.6, 8.7_
  - [ ]* 7.3 Property tests receipt (Properties 13, 14, 15)
    - **Property 13: Receipt content & width compliance** — Validates: Requirements 8.1, 8.2, 8.3
    - **Property 14: Reprint preserves content** — Validates: Requirements 8.8
    - **Property 15: Print failure preserves transaction** — Validates: Requirements 8.5, 8.6, 8.7
    - File: `src/domain/receipt/__tests__/receipt.property.test.ts`

- [ ] 8. Domain - Sync Queue, Realtime Reducer, Reconnect Backoff
  - [ ] 8.1 Implementasi `syncQueue.ts` (Property 11)
    - Tipe `PendingTx`, fungsi `enqueue(queue, tx)` (cap 500), `nextBatch(queue)` (sort by createdAt asc), `shouldRetry(tx)` (retryCount<5), `markRetry(tx)`, `markFailed(tx)`
    - _Requirements: 11.2, 11.3, 11.4, 11.6, 11.7_
  - [ ] 8.2 Implementasi `priceConflictResolver.ts` (Property 12)
    - `resolveSync(localTx, currentMenuPrice)` → status `confirmed` jika sama; `conflict_review` dengan unitPrice lokal jika beda
    - _Requirements: 11.5_
  - [ ] 8.3 Implementasi `reconnectBackoff.ts` (Property 9)
    - `nextReconnectDelay(attempt)` mengembalikan `[1000,2000,4000,8000,16000,30000,30000,30000,30000,30000]` untuk 1..10, `null` untuk >10
    - _Requirements: 10.4, 10.5_
  - [ ] 8.4 Implementasi `realtimeReducer.ts` (Property 10)
    - `handlePayload(state, payload, schema, logger)` — validasi via Zod; payload invalid → state tidak berubah, logger.error dipanggil tepat sekali
    - Schema payload: `RealtimeTransactionPayload`, `RealtimeStockPayload`, `RealtimeMenuPayload`
    - _Requirements: 10.7_
  - [ ]* 8.5 Property tests sync & realtime (Properties 9, 10, 11, 12)
    - **Property 9: Reconnect backoff schedule** — Validates: Requirements 10.4, 10.5
    - **Property 10: Realtime payload safety** — Validates: Requirements 10.7
    - **Property 11: Sync queue invariants** — Validates: Requirements 11.2, 11.3, 11.4, 11.6, 11.7
    - **Property 12: Price conflict resolution** — Validates: Requirements 11.5
    - File: `src/domain/sync/__tests__/sync.property.test.ts`

- [ ] 9. Domain - Reports, Audit, Glass Contrast, Draft Retention
  - [ ] 9.1 Implementasi `reportAggregator.ts` (Properties 19, 20)
    - `aggregate(transactions)` → `{total, count, average, byMethod}`; `topN(items, n=5)` deterministik dengan tie-break A-Z locale id-ID
    - _Requirements: 9.1, 9.4, 9.6, 9.7_
  - [ ] 9.2 Implementasi `csvExport.ts` (Property 21)
    - `buildSummaryCsv(rows, schema)` & `buildDetailCsv(rows, schema)` mengikuti RFC 4180; header tetap antar export
    - _Requirements: 9.8_
  - [ ] 9.3 Implementasi `auditEntry.ts` (Properties 22, 23)
    - `buildAuditEntry({user, role, outletId?, action_type, entity, entityId, valueBefore, valueAfter, now})` menghasilkan record dengan timestamp ISO 8601 Asia/Jakarta, truncate 2000 char, scrub `password|token` keys
    - `queryAuditLog(entries, filter)` paginated, default 30 hari, max 24 bulan, sort created_at desc, 50/halaman
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 2.8, 3.5, 5.7_
  - [ ] 9.4 Implementasi `glassContrast.ts` (Property 24)
    - `contrastRatio(fg, bg)` (WCAG), `chooseSurface(fg, bg, fontSizePx)` → `'glass'|'solid'` sesuai Req 13.7
    - _Requirements: 13.2, 13.3, 13.7, 12.6_
  - [ ] 9.5 Implementasi `draftRetention.ts` (Property 25)
    - `mergeDraftOnResize(prevDraft, breakpointFromTo)` mempertahankan field non-submit; helper hook `useDraftPersistence(routeKey)` di Zustand
    - _Requirements: 12.7_
  - [ ]* 9.6 Property tests reports/audit/UI helpers (Properties 19, 20, 21, 22, 23, 24, 25)
    - **Property 19: Report aggregation linearity** — Validates: Requirements 9.1, 9.4, 9.7
    - **Property 20: Top-N selection determinism** — Validates: Requirements 9.6
    - **Property 21: CSV export schema stability** — Validates: Requirements 9.8
    - **Property 22: Audit entry construction** — Validates: Requirements 14.1, 14.2, 2.8, 3.5, 5.7
    - **Property 23: Audit log filter & pagination** — Validates: Requirements 14.3, 14.4
    - **Property 24: Glass fallback contrast** — Validates: Requirements 13.2, 13.3, 13.7
    - **Property 25: Form draft retention across breakpoints** — Validates: Requirements 12.7
    - File: `src/domain/reports/__tests__/reports.property.test.ts` & `src/domain/ui/__tests__/ui.property.test.ts`

- [ ] 10. Checkpoint - Pastikan domain layer hijau
  - Jalankan `pnpm typecheck && pnpm test` (semua property test domain harus lulus minimal 100 runs, properti kritikal 500). Ensure all tests pass, ask the user if questions arise.

- [ ] 11. Data layer dasar (Supabase + Dexie + repositories)
  - [ ] 11.1 Setup Dexie database `src/data/db.ts`
    - Stores: `cache_menu_items`, `cache_outlets`, `cache_recipes`, `cache_stock`, `pending_sync`, `failed_sync`, `drafts` (form draft retention)
    - Versioning + index `outletId`, `createdAt`
    - _Requirements: 11.1, 11.2, 11.4, 12.7_
  - [ ] 11.2 TanStack Query setup + retry policy global
    - `src/lib/queryClient.ts` dengan `staleTime` dan retry exponential terbatas; integrasi dengan `ConnectionState`
    - _Requirements: 10.6, 11.1_
  - [ ] 11.3 Repository: Auth/Session
    - `src/data/repositories/authRepo.ts`: signInWithPassword, signOut, fetch user_profile + outlet_assignments; handle invalidation 60s pada session berikutnya
    - _Requirements: 1.1, 1.4, 4.6, 4.7_
  - [ ] 11.4 Repository: Outlet, User, Assignment
    - CRUD via PostgREST, validasi via schema task 3.1; fungsi `setActive`, `assignOutlets`
    - _Requirements: 3.1, 3.2, 3.3, 4.1-4.5_
  - [ ] 11.5 Repository: MenuItem + MenuItemOutlet overlay + price history
    - `list(outletId)` join overlay; `setPrice(menuItemId, outletId?, price)` (memicu history via trigger); `delete(menuItemId)` panggil `canDeleteMenuItem` lebih dulu
    - _Requirements: 5.1-5.8_
  - [ ] 11.6 Repository: RawMaterial, Stock, Recipe, Receiving, Opname
    - Operasi receiving/opname memanggil RPC SECURITY DEFINER; `getStock(outletId)`, `lowStock(outletId)` query
    - _Requirements: 6.1-6.9_
  - [ ] 11.7 Repository: Transaction, Refund (online path)
    - `create(draft)` panggil RPC `create_transaction`; `refund(txId)` panggil `refund_transaction`; `list(filter)` paginasi
    - _Requirements: 7.4, 7.7, 7.8, 7.10, 7.11_
  - [ ] 11.8 Repository: Audit log (read-only client)
    - `query(filter)` join dengan `queryAuditLog` domain; tulis hanya via RPC `record_audit`
    - _Requirements: 14.1-14.5_
  - [ ] 11.9 Sync orchestrator service
    - `src/data/sync/orchestrator.ts` integrasi `syncQueue` + repository: drain FIFO, retry @ 30s × 5, resolve `conflict_review` via `priceConflictResolver`, persist `failed_sync`
    - Hook `useOfflineQueue` mempublikasikan `pendingTxCount`
    - _Requirements: 11.2-11.7_
  - [ ]* 11.10 Integration tests repository (mocked + Supabase test project)
    - RLS isolation owner/manager/cashier, atomic `create_transaction` rollback bila stok minus dilarang konfigurasinya, `refund_transaction` 24h boundary, `record_audit` truncation
    - _Requirements: 2.7, 2.8, 6.4, 7.7, 7.10, 14.6, 15.2_

- [ ] 12. Cross-cutting components & theme
  - [ ] 12.1 Implementasi `<GlassCard>` + `<SolidCard>` fallback
    - Props `tone`, `padding`, `bordered`; gunakan `chooseSurface` runtime untuk memilih variant; mode terang opasitas `>= 0.78`, gelap `>= 0.55`; border `border-gray-200` light, `border-white/15` dark; transisi 200 ms
    - _Requirements: 13.1, 13.2, 13.3, 13.5, 13.7_
  - [ ] 12.2 Implementasi `<Button>`, `<Input>`, `<Select>`, `<Dialog>`, `<Toast>` di atas shadcn/ui
    - Standar interaksi: `cursor-pointer` semua interaktif, `focus-visible:outline-2 outline-offset-2`, transisi color/border/shadow only (tanpa scale/translate), touch target `min-h-11 min-w-11` (44px)
    - Lucide icons size token (`w-5 h-5` body, `w-6 h-6` button)
    - _Requirements: 12.5, 12.6, 13.5, 13.6_
  - [ ] 12.3 Implementasi `<Shell>` layout responsif & navbar floating
    - Mobile single column, tablet two-column, desktop three-pane; navbar `fixed top-4 left-4 right-4 rounded-xl glass`; konten padding-top sesuai tinggi navbar
    - Safe-area inset (`env(safe-area-inset-bottom)` untuk FAB Bayar di POS mobile)
    - Hook `useBreakpoint()` + `useDraftPersistence()` agar input form bertahan saat resize
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.7_
  - [ ] 12.4 Implementasi `<ConnectionBadge>` (online/offline/reconnecting/disconnected_terminal) + badge pending sync
    - Subscribe ke Zustand `ConnectionState`; tombol "Coba Lagi" saat `disconnected_terminal`
    - Indikator muncul ≤ 3s setelah offline (disambungkan ke event `online/offline` + heartbeat)
    - _Requirements: 10.3, 10.5, 10.6, 11.7_
  - [ ] 12.5 Implementasi `<PrintButton>` + helper PDF
    - Memicu `window.print()` dengan timeout 5s; jika tidak tersedia → fallback `jsPDF` simpan PDF; tidak mengubah `tx.status`
    - _Requirements: 8.4, 8.5_
  - [ ] 12.6 Theme provider + dark mode toggle + `prefers-reduced-motion` adapter
    - Persistensi preferensi di `localStorage` (bukan token); media query `prefers-color-scheme`; matikan animasi parallax/blur saat reduced motion
    - _Requirements: 13.4, 13.6_
  - [ ]* 12.7 Component tests (Testing Library)
    - GlassCard menghormati `chooseSurface`; ConnectionBadge transisi state; PrintButton timeout fallback; Shell mempertahankan draft via `useDraftPersistence`
    - _Requirements: 10.5, 12.7, 13.7_

- [ ] 13. Realtime channel manager
  - [ ] 13.1 Implementasi `src/data/realtime/manager.ts`
    - Subscribe channel `outlet:{id}` per outlet di session; integrasi `nextReconnectDelay` (Property 9) dan `handlePayload` (Property 10); update Zustand `ConnectionState`
    - Setelah reconnect → `queryClient.invalidateQueries(['hot'])` agar konsisten <= 5s (Req 10.6)
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6, 10.7_
  - [ ]* 13.2 Integration test realtime SLA (Vitest + Supabase test project)
    - Insert tx → klien lain menerima dalam < 5s; payload korup diabaikan; setelah 10 fail → `disconnected_terminal`
    - _Requirements: 10.1, 10.2, 10.5, 10.7_

- [ ] 14. Auth feature module + Routing
  - [ ] 14.1 Halaman `/login` dengan form RHF + Zod + throttle countdown
    - Pesan error generik (Req 1.2); countdown sisa waktu throttle ditampilkan (Req 15.8); kirim hanya HTTPS (Req 15.3); password tidak ditulis ke storage (Property 26)
    - _Requirements: 1.1, 1.2, 1.6, 15.3, 15.7, 15.8_
  - [ ] 14.2 Halaman `/no-outlet` (notifikasi tanpa outlet)
    - Tampilkan saat `role != owner && outletIds.length == 0` (Req 2.6)
    - _Requirements: 2.6_
  - [ ] 14.3 Routing app + `<RouteGuard>` consumer dari `routeGuard()`
    - HashRouter; matrix route → scope; redirect `/admin/*` → `/pos` untuk Cashier (Req 2.5)
    - _Requirements: 1.5, 2.5, 2.6, 14.5_
  - [ ] 14.4 Idle timer 12 jam + activity listener
    - Subscribe pointer/key events untuk `touchActivity`; saat `isSessionExpired` → logout + redirect `/login` (Req 1.3)
    - _Requirements: 1.3_
  - [ ] 14.5 Logout flow + invalidasi storage
    - Tombol logout: `clearSession()` ≤ 2s, hapus token Supabase, redirect `/login` (Req 1.4, 15.6)
    - _Requirements: 1.4, 4.7, 15.6_
  - [ ]* 14.6 E2E auth (Playwright)
    - Login sukses, salah > 5 kali memunculkan countdown, Cashier akses `/admin/*` redirect ke `/pos`, idle 12h logout otomatis
    - _Requirements: 1.1, 1.3, 1.6, 2.5_

- [ ] 15. POS module (`/pos`, `/pos/checkout`)
  - [ ] 15.1 Halaman `/pos` katalog menu + cart panel
    - Virtualized grid menu per kategori (`react-window` atau windowing manual), filter aktif via `effectiveMenuList`, gambar lazy + `alt`
    - Cart panel side-by-side di tablet, collapsible bottom sheet di mobile dengan FAB "Bayar" `fixed bottom-4 inset-x-4 safe-area`
    - Re-compute totals < 200ms (Req 7.2) via `cartEngine` di Zustand
    - _Requirements: 7.1, 7.2, 7.9, 12.3, 12.4, 12.5_
  - [ ] 15.2 Halaman `/pos/checkout` pembayaran
    - Form metode bayar (tunai/QRIS/transfer), `validatePayment`, peringatan stok minus dari `checkAvailability` (Req 6.9)
    - Konfirmasi → online: panggil `transactionRepo.create`; offline: enqueue ke `pending_sync` (`syncQueue`)
    - Kapasitas 500 → tampilkan pesan antrian penuh (Req 11.6)
    - _Requirements: 6.9, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 11.2, 11.6, 11.7_
  - [ ] 15.3 Halaman struk / dialog post-checkout
    - Render `formatReceipt` 58/80mm preview, tombol Print (PrintButton), Save PDF, Share WhatsApp/email dengan validasi kontak (Req 8.6, 8.7), label REPRINT pada cetak ulang
    - _Requirements: 8.1, 8.2, 8.3, 8.6, 8.7, 8.8_
  - [ ] 15.4 Refund flow (Manager/Owner)
    - Dialog refund dari daftar transaksi 24h terakhir; panggil RPC `refund_transaction`; tampilkan alasan tolak (Req 7.11)
    - _Requirements: 7.10, 7.11_
  - [ ] 15.5 Cache offline POS (Dexie hydrate + invalidate)
    - Saat online: hydrate `cache_menu_items`, `cache_outlets`, `cache_recipes`; saat offline: gunakan cache (Req 11.1)
    - _Requirements: 11.1_
  - [ ]* 15.6 Component & integration tests POS
    - Cart re-compute < 200ms benchmark; offline checkout enqueue + sync replay setelah online; konflik harga → conflict_review banner
    - _Requirements: 7.2, 11.3, 11.4, 11.5_

- [ ] 16. Admin: Outlet management (`/admin/outlets`)
  - [ ] 16.1 Halaman list outlet + tombol create/edit/deactivate
    - List ≤ 2s (Req 3.6) menggunakan TanStack Query, status aktif/non-aktif visual
    - _Requirements: 3.1, 3.6_
  - [ ] 16.2 Form outlet (RHF + `OutletDraftSchema`)
    - Validasi inline; jam_tutup > jam_buka; kode unik dalam org; simpan ≤ 3s
    - _Requirements: 3.1, 3.2, 3.3, 3.5_
  - [ ] 16.3 Riwayat jam operasional (drawer)
    - Query `outlet_hours_history` 365 hari terakhir
    - _Requirements: 3.5_
  - [ ]* 16.4 E2E outlet CRUD + non-aktif blokir POS
    - Outlet non-aktif → POS menolak transaksi baru dengan pesan "Outlet non-aktif"
    - _Requirements: 3.4_

- [ ] 17. Admin: Users & assignments (`/admin/users`)
  - [ ] 17.1 Halaman list user + filter peran/outlet
    - Owner melihat semua; Manager hanya yang assignment-nya overlap (Req 4.2, 4.5)
    - _Requirements: 4.1, 4.2, 4.5_
  - [ ] 17.2 Form create/edit user dengan multi-outlet assignment
    - Validasi `UserDraftSchema` + minimal 1 outlet untuk Manager/Cashier; nonaktifkan akun → invalidasi session ≤ 60s
    - _Requirements: 4.1, 4.3, 4.4, 4.6, 4.7_
  - [ ]* 17.3 Test propagasi assignment ke session berikutnya
    - Manager mengubah Cashier assignment → session aktif tidak berubah; session baru memuat outlet baru ≤ 60s
    - _Requirements: 4.6_

- [ ] 18. Admin: Menu management (`/admin/menu`)
  - [ ] 18.1 Halaman list menu + overlay per outlet
    - Tabel menampilkan basePrice + override per outlet; filter kategori
    - _Requirements: 5.1, 5.3, 5.5_
  - [ ] 18.2 Form menu (RHF + `MenuItemDraftSchema`) + upload gambar Supabase Storage
    - Mime/ukuran ≤ 2 MB; preview gambar; alt text; persist ke storage bucket `menu-images`
    - _Requirements: 5.1, 5.2_
  - [ ] 18.3 Edit harga / status per outlet (overlay)
    - Manager hanya outlet penugasan; trigger menulis `menu_price_history` (Req 5.7)
    - Realtime: perubahan terlihat di POS ≤ 5s (Req 5.6) via channel manager
    - _Requirements: 5.4, 5.6, 5.7_
  - [ ] 18.4 Hapus menu — gunakan `canDeleteMenuItem` (Property 18)
    - Tolak jika ada transaksi historis dan sarankan non-aktifkan (Req 5.8)
    - _Requirements: 5.8_
  - [ ]* 18.5 E2E perubahan harga propagasi ke POS
    - Owner ubah harga → POS Cashier outlet terkait melihat harga baru ≤ 5s
    - _Requirements: 5.6_

- [ ] 19. Admin: Inventory (`/admin/inventory`)
  - [ ] 19.1 Halaman list raw_material + stok per outlet + low-stock badge
    - Notifikasi stok rendah ≤ 10s (Req 6.5) realtime via channel; persist hingga dibaca/normal kembali
    - _Requirements: 6.1, 6.5_
  - [ ] 19.2 Editor recipe per menu (1..50 ingredient)
    - Validasi `RecipeDraftSchema`; tolak raw_material yang tidak terdaftar (Req 6.3)
    - _Requirements: 6.2, 6.3_
  - [ ] 19.3 Form penerimaan stok (`ReceivingDraftSchema`)
    - Submit → RPC `record_receiving` (atau repo); update timestamp_terakhir
    - _Requirements: 6.6, 6.8_
  - [ ] 19.4 Form stock opname (`OpnameDraftSchema`) + diff otomatis
    - Submit → RPC; alasan 1..500 char; audit log otomatis via trigger
    - _Requirements: 6.7, 6.8, 14.1_
  - [ ]* 19.5 Integration test atomic deduction & refund
    - Buat tx confirmed → stok turun sesuai recipe atomik; refund → stok kembali; gagal stok → status `pending_reconciliation` (Req 7.8)
    - _Requirements: 6.4, 7.7, 7.8, 7.10_

- [ ] 20. Admin: Reports (`/admin/reports`)
  - [ ] 20.1 Halaman ringkasan + filter rentang (`DateRangeFilterSchema`)
    - Default harian/mingguan/bulanan; tolak rentang invalid (Req 9.3); render ≤ 3s untuk 1 bulan (Req 9.10)
    - Owner: agregat lintas outlet + tabel per outlet; Manager: hanya outlet assignment (Req 9.4, 9.5)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.10_
  - [ ] 20.2 Charts (Recharts) — Line tren harian + Bar Top-5 menu + Donut metode bayar
    - Gunakan `aggregate` & `topN`; empty state "Tidak ada data" (Req 9.7)
    - _Requirements: 9.6, 9.7_
  - [ ] 20.3 Tombol Export CSV (`buildSummaryCsv`/`buildDetailCsv`)
    - Trigger download via `Blob`; gagal → toast tanpa download parsial (Req 9.9)
    - _Requirements: 9.8, 9.9_
  - [ ]* 20.4 Test deterministik CSV header + Top-N tie-break
    - Dua range berbeda → header byte-equal; tie-break A-Z stabil
    - _Requirements: 9.6, 9.8_

- [ ] 21. Admin: Audit log (`/admin/audit`)
  - [ ] 21.1 Halaman audit log dengan filter (rentang, action_type, outlet, user)
    - Default 30 hari; max 24 bulan (Req 14.3, 14.4); pagination 50/halaman; sort terbaru dulu
    - Akses Owner only — Manager/Cashier diredirect (Req 14.5)
    - _Requirements: 14.3, 14.4, 14.5_
  - [ ] 21.2 Tampilan diff value_before / value_after
    - Truncate visual + tooltip; tidak menampilkan field sensitif (password/token sudah di-scrub di domain)
    - _Requirements: 14.2, 14.6_

- [ ] 22. Wiring app shell + global providers
  - [ ] 22.1 `App.tsx` orchestrasi: ThemeProvider, QueryClientProvider, SessionProvider, RealtimeProvider, Router, Shell, Toaster
    - Inisialisasi `realtimeManager` setelah session ada; cleanup saat logout
    - _Requirements: 10.1, 10.6, 13.4_
  - [ ] 22.2 Hook `useSession` + `useConnectionState` + `useOfflineQueue` ekspos ke seluruh feature
    - Single source of truth Zustand; persist `lastActivityAt`
    - _Requirements: 1.3, 10.3, 11.7_
  - [ ] 22.3 Error boundary + skeleton + offline screen
    - Setiap route lazy-load + Suspense skeleton; ErrorBoundary fallback "Muat ulang"
    - _Requirements: 13.4_

- [ ] 23. Checkpoint - Smoke jalan E2E flow inti
  - Ensure all tests pass, ask the user if questions arise. Jalankan `pnpm test`, `pnpm test:e2e -- --project=chromium` smoke (login → POS → checkout → struk → admin reports).

- [ ] 24. Integration tests (Vitest + Supabase test project)
  - [ ]* 24.1 RLS isolation matrix
    - Owner cross-outlet OK; Manager out-of-assignment kosong; Cashier admin endpoint kosong; payload `auth.unauthorized_outlet` tercatat
    - _Requirements: 2.7, 2.8, 14.1, 15.2_
  - [ ]* 24.2 Atomic transaction + refund + audit
    - Race: dua refund concurrent — hanya satu sukses; audit memuat both intent
    - _Requirements: 7.7, 7.10, 7.11, 14.1_
  - [ ]* 24.3 Realtime SLA & reconnect
    - Insert tx ↔ klien dashboard < 5s; disconnect 10×1s..30s → `disconnected_terminal`; tombol Coba Lagi sukses → state recovered
    - _Requirements: 10.1, 10.2, 10.4, 10.5, 10.6_
  - [ ]* 24.4 Offline → online sync replay
    - Buat 5 tx offline → online, semua confirmed urutan createdAt; salah satu konflik harga → `conflict_review`
    - _Requirements: 11.2, 11.3, 11.5_
  - [ ]* 24.5 Audit retention archive
    - Entri > 24 bulan menjadi read-only; insert/update/delete ditolak (Req 14.6)
    - _Requirements: 14.6_

- [ ] 25. E2E Playwright per persona
  - [ ]* 25.1 Cashier offline POS lifecycle
    - Toggle offline → buat 3 tx → toggle online → semua tersinkron < 60s; badge berubah dari 3→0
    - _Requirements: 11.1, 11.2, 11.3, 11.7_
  - [ ]* 25.2 Owner reports + CSV export
    - Filter rentang invalid ditolak; export CSV terunduh; header konsisten antar export
    - _Requirements: 9.3, 9.8_
  - [ ]* 25.3 Manager menu price change → POS realtime
    - Manager ubah harga → terminal POS Cashier outlet sama melihat ≤ 5s
    - _Requirements: 5.6_

- [ ] 26. Visual regression + accessibility
  - [ ]* 26.1 Snapshot Playwright untuk POS, Reports, Audit di 360, 768, 1024, 1440 px (light + dark)
    - Tidak ada scroll horizontal; navbar `top-4 left-4 right-4`; touch target ≥ 44 px
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 13.1, 13.2, 13.3_
  - [ ]* 26.2 Axe-core accessibility checks
    - WCAG AA contrast pada surface glass; setiap input punya label; alt pada gambar menu
    - _Requirements: 12.6, 13.2, 13.3_
  - [ ]* 26.3 Reduced motion test
    - `prefers-reduced-motion: reduce` → tidak ada parallax/blur transition; transisi fungsional ≤ 200 ms tetap aktif
    - _Requirements: 13.5, 13.6_

- [ ] 27. Build, bundle audit, dan GitHub Pages deploy
  - [ ] 27.1 Bundle audit script
    - Skrip Node `scripts/audit-bundle.ts` memindai `dist/**` untuk string `service_role`, key Supabase service, dan token rahasia umum; fail build saat ditemukan
    - _Requirements: 15.1_
  - [ ] 27.2 Workflow GitHub Actions
    - File `.github/workflows/ci.yml`: jobs `lint`, `typecheck`, `test`, `test:e2e` (Chromium), `build`, `audit:bundle`, `deploy` (gh-pages branch artifact upload only on `main`)
    - _Requirements: 15.1_
  - [ ] 27.3 Konfigurasi HashRouter + GitHub Pages base
    - Pastikan `vite build --base=./`; `404.html` SPA fallback; verifikasi reload deep link tidak rusak
    - _Requirements: 15.3_
  - [ ]* 27.4 Smoke test build artefak
    - Cek ukuran bundle awal < 1 MB (gzip), `dist/assets/*.js` tidak mengandung kunci `service_role`, `SUPABASE_SERVICE`, atau token umum
    - _Requirements: 15.1_

- [ ] 28. Final checkpoint
  - Ensure all tests pass, ask the user if questions arise. Jalankan `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e:headless && pnpm build && pnpm audit:bundle`. Tinjau coverage matrix Properties 1-26 versus Requirements 1-15.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP, namun semuanya tetap masuk Task Dependency Graph untuk perencanaan paralel.
- Setiap task merujuk requirement spesifik (Req X.Y) dan, untuk property test, properti yang divalidasi (P1-P26).
- Domain layer murni dan dapat dites tanpa Supabase; integration tests menggunakan Supabase test project terpisah.
- Checkpoints (10, 23, 28) adalah parent task tanpa decimal — tidak masuk dependency graph.
- Stack TypeScript sesuai design.md; tidak diperlukan klarifikasi bahasa implementasi.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "1.5", "1.6", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "4.1", "4.2", "4.3", "4.5", "5.1", "6.2", "6.3", "8.1", "8.2", "8.3", "9.4", "9.5"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6", "2.7", "3.3", "4.4", "5.2", "6.1", "7.1", "7.2", "8.4", "9.1", "9.2", "9.3", "11.1", "11.2", "12.6"] },
    { "id": 4, "tasks": ["3.2", "4.6", "5.3", "5.4", "6.4", "7.3", "8.5", "9.6", "11.3", "11.4", "11.5", "11.6", "11.7", "11.8", "12.1", "12.2"] },
    { "id": 5, "tasks": ["11.9", "11.10", "12.3", "12.4", "12.5", "13.1"] },
    { "id": 6, "tasks": ["12.7", "13.2", "14.1", "14.2", "14.3", "14.4", "14.5", "15.5", "16.1", "16.2", "16.3", "17.1", "17.2", "18.1", "18.2", "18.3", "18.4", "19.1", "19.2", "19.3", "19.4", "20.1", "21.1", "21.2"] },
    { "id": 7, "tasks": ["14.6", "15.1", "15.2", "15.3", "15.4", "16.4", "17.3", "18.5", "19.5", "20.2", "20.3"] },
    { "id": 8, "tasks": ["15.6", "20.4", "22.1", "22.2", "22.3"] },
    { "id": 9, "tasks": ["24.1", "24.2", "24.3", "24.4", "24.5", "25.1", "25.2", "25.3", "26.1", "26.2", "26.3", "27.1", "27.2", "27.3"] },
    { "id": 10, "tasks": ["27.4"] }
  ]
}
```
