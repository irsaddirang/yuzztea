-- =============================================================================
-- Test Fixture: RLS Isolation Demonstration
-- Description: Sets up test data and demonstrates that RLS policies correctly
--              isolate data between organizations, outlets, and roles.
-- Used by: Integration tests (task 11.10)
-- =============================================================================

-- =============================================================================
-- Setup: Create test organizations, outlets, users, and assignments
-- =============================================================================

-- Organization A (Yuzztea)
INSERT INTO organization (id, name) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Yuzztea');

-- Organization B (competitor - should never be visible)
INSERT INTO organization (id, name) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', 'Competitor Tea');

-- Outlets for Org A
INSERT INTO outlet (id, organization_id, name, code, address, city, open_time, close_time) VALUES
  ('aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Outlet Bandung', 'BDG01', 'Jl. Braga 10', 'Bandung', '08:00', '22:00'),
  ('aaaaaaaa-1111-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'Outlet Jakarta', 'JKT01', 'Jl. Sudirman 5', 'Jakarta', '09:00', '23:00'),
  ('aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'Outlet Surabaya', 'SBY01', 'Jl. Tunjungan 3', 'Surabaya', '08:00', '21:00');

-- Outlet for Org B (should never be visible to Org A users)
INSERT INTO outlet (id, organization_id, name, code, address, city, open_time, close_time) VALUES
  ('bbbbbbbb-1111-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'Competitor Outlet', 'CMP01', 'Jl. Lain 1', 'Bogor', '10:00', '20:00');

-- =============================================================================
-- Test Users (created in auth.users first, then user_profile)
-- In real Supabase, auth.users is managed by Supabase Auth.
-- For testing, we simulate JWT claims via set_config.
-- =============================================================================

-- Simulate user profiles (assumes auth.users entries exist)
-- Owner of Org A
-- INSERT INTO user_profile (user_id, organization_id, username, email, role, active, display_name) VALUES
--   ('aaaaaaaa-2222-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'owner_a', 'owner@yuzztea.com', 'owner', true, 'Owner A');

-- Manager of Org A (assigned to Bandung + Jakarta)
-- INSERT INTO user_profile (user_id, organization_id, username, email, role, active, display_name) VALUES
--   ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 'manager_bdg_jkt', 'manager@yuzztea.com', 'outlet_manager', true, 'Manager BDG-JKT');

-- Cashier of Org A (assigned to Bandung only)
-- INSERT INTO user_profile (user_id, organization_id, username, email, role, active, display_name) VALUES
--   ('aaaaaaaa-2222-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'cashier_bdg', 'cashier@yuzztea.com', 'cashier', true, 'Cashier BDG');

-- Owner of Org B
-- INSERT INTO user_profile (user_id, organization_id, username, email, role, active, display_name) VALUES
--   ('bbbbbbbb-2222-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 'owner_b', 'owner@competitor.com', 'owner', true, 'Owner B');

-- =============================================================================
-- Outlet Assignments
-- =============================================================================

-- Manager assigned to Bandung + Jakarta
-- INSERT INTO outlet_assignment (user_id, outlet_id, active, created_by) VALUES
--   ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000001', true, 'aaaaaaaa-2222-0000-0000-000000000001'),
--   ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000002', true, 'aaaaaaaa-2222-0000-0000-000000000001');

-- Cashier assigned to Bandung only
-- INSERT INTO outlet_assignment (user_id, outlet_id, active, created_by) VALUES
--   ('aaaaaaaa-2222-0000-0000-000000000003', 'aaaaaaaa-1111-0000-0000-000000000001', true, 'aaaaaaaa-2222-0000-0000-000000000001');

-- =============================================================================
-- Test Assertions (to be run with different JWT contexts)
-- These demonstrate the expected behavior of RLS policies.
-- =============================================================================

-- =============================================================================
-- TEST 1: Organization Isolation
-- Owner of Org B should NOT see Org A outlets
-- =============================================================================

-- SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-2222-0000-0000-000000000001","app_metadata":{"organization_id":"bbbbbbbb-0000-0000-0000-000000000001","role":"owner"}}';
-- Expected: SELECT * FROM outlet; → only 'Competitor Outlet' (1 row)

-- =============================================================================
-- TEST 2: Owner sees all outlets in their org
-- =============================================================================

-- SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-2222-0000-0000-000000000001","app_metadata":{"organization_id":"aaaaaaaa-0000-0000-0000-000000000001","role":"owner"}}';
-- Expected: SELECT * FROM outlet; → 3 rows (Bandung, Jakarta, Surabaya)

-- =============================================================================
-- TEST 3: Manager sees only assigned outlets
-- =============================================================================

-- SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-2222-0000-0000-000000000002","app_metadata":{"organization_id":"aaaaaaaa-0000-0000-0000-000000000001","role":"outlet_manager"}}';
-- Expected: SELECT * FROM outlet; → 2 rows (Bandung, Jakarta)
-- Expected: SELECT * FROM outlet WHERE id = 'aaaaaaaa-1111-0000-0000-000000000003'; → 0 rows (Surabaya not assigned)

-- =============================================================================
-- TEST 4: Cashier sees only assigned outlets
-- =============================================================================

-- SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-2222-0000-0000-000000000003","app_metadata":{"organization_id":"aaaaaaaa-0000-0000-0000-000000000001","role":"cashier"}}';
-- Expected: SELECT * FROM outlet; → 1 row (Bandung only)
-- Expected: SELECT * FROM outlet WHERE id = 'aaaaaaaa-1111-0000-0000-000000000002'; → 0 rows (Jakarta not assigned)

-- =============================================================================
-- TEST 5: Audit log visible only to Owner
-- =============================================================================

-- As Owner:
-- SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-2222-0000-0000-000000000001","app_metadata":{"organization_id":"aaaaaaaa-0000-0000-0000-000000000001","role":"owner"}}';
-- Expected: SELECT * FROM audit_log; → returns rows for org A

-- As Manager:
-- SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-2222-0000-0000-000000000002","app_metadata":{"organization_id":"aaaaaaaa-0000-0000-0000-000000000001","role":"outlet_manager"}}';
-- Expected: SELECT * FROM audit_log; → 0 rows

-- As Cashier:
-- SET LOCAL request.jwt.claims = '{"sub":"aaaaaaaa-2222-0000-0000-000000000003","app_metadata":{"organization_id":"aaaaaaaa-0000-0000-0000-000000000001","role":"cashier"}}';
-- Expected: SELECT * FROM audit_log; → 0 rows

-- =============================================================================
-- TEST 6: Audit log INSERT/UPDATE/DELETE blocked for all roles
-- =============================================================================

-- As Owner:
-- Expected: INSERT INTO audit_log (...) VALUES (...); → DENIED by RLS (WITH CHECK false)
-- Expected: UPDATE audit_log SET action_type = 'hacked'; → DENIED (rule + RLS)
-- Expected: DELETE FROM audit_log; → DENIED (rule + RLS)

-- =============================================================================
-- TEST 7: Transaction isolation by outlet
-- =============================================================================

-- Insert test transaction for Bandung outlet
-- INSERT INTO transaction (id, outlet_id, cashier_user_id, subtotal, discount, tax, total, payment_method, amount_paid, change_due, status)
-- VALUES ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-1111-0000-0000-000000000001', 'aaaaaaaa-2222-0000-0000-000000000003', 25000, 0, 0, 25000, 'tunai', 30000, 5000, 'confirmed');

-- Insert test transaction for Surabaya outlet
-- INSERT INTO transaction (id, outlet_id, cashier_user_id, subtotal, discount, tax, total, payment_method, amount_paid, change_due, status)
-- VALUES ('aaaaaaaa-3333-0000-0000-000000000002', 'aaaaaaaa-1111-0000-0000-000000000003', 'aaaaaaaa-2222-0000-0000-000000000001', 15000, 0, 0, 15000, 'qris', 15000, 0, 'confirmed');

-- As Manager (Bandung + Jakarta):
-- Expected: SELECT * FROM transaction; → 1 row (Bandung tx only, not Surabaya)

-- As Cashier (Bandung only):
-- Expected: SELECT * FROM transaction; → 1 row (Bandung tx only)

-- As Owner:
-- Expected: SELECT * FROM transaction; → 2 rows (both Bandung + Surabaya)

-- =============================================================================
-- TEST 8: Cross-org transaction isolation
-- =============================================================================

-- Owner of Org B should NOT see any transactions from Org A
-- SET LOCAL request.jwt.claims = '{"sub":"bbbbbbbb-2222-0000-0000-000000000001","app_metadata":{"organization_id":"bbbbbbbb-0000-0000-0000-000000000001","role":"owner"}}';
-- Expected: SELECT * FROM transaction; → 0 rows

-- =============================================================================
-- TEST 9: Manager cannot INSERT outlet outside assignment
-- =============================================================================

-- As Manager (assigned Bandung + Jakarta):
-- Expected: INSERT INTO outlet (...) VALUES (...); → DENIED (only owner can insert outlets)

-- =============================================================================
-- TEST 10: Cashier cannot access management tables for write
-- =============================================================================

-- As Cashier:
-- Expected: INSERT INTO menu_item (...) VALUES (...); → DENIED
-- Expected: UPDATE raw_material_stock SET quantity = 999; → DENIED (cashier has no update policy)
-- Expected: INSERT INTO stock_receiving (...) VALUES (...); → DENIED

-- =============================================================================
-- Cleanup (for repeatable tests)
-- =============================================================================

-- DELETE FROM transaction WHERE id IN ('aaaaaaaa-3333-0000-0000-000000000001', 'aaaaaaaa-3333-0000-0000-000000000002');
-- DELETE FROM outlet_assignment WHERE user_id IN ('aaaaaaaa-2222-0000-0000-000000000002', 'aaaaaaaa-2222-0000-0000-000000000003');
-- DELETE FROM user_profile WHERE organization_id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
-- DELETE FROM outlet WHERE organization_id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
-- DELETE FROM organization WHERE id IN ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001');
