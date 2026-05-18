-- =============================================================================
-- Migration: 0004_rls.sql
-- Description: Row Level Security policies for all multi-tenant tables.
--              Implements authorization matrix: Owner=org-wide, Manager/Cashier=
--              outlet-scoped via outlet_assignment, audit_log SELECT owner only,
--              UPDATE/DELETE blocked.
-- Requirements: 2.2, 2.3, 2.4, 2.7, 2.8, 14.5, 14.6, 15.2
-- =============================================================================

-- =============================================================================
-- Helper Functions
-- These read from auth.jwt() claims set by Supabase Auth.
-- JWT custom claims expected structure:
--   app_metadata.organization_id: uuid
--   app_metadata.role: 'owner' | 'outlet_manager' | 'cashier'
-- =============================================================================

-- Returns the current user's organization_id from JWT claims
CREATE OR REPLACE FUNCTION current_org()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'organization_id')::uuid,
    '00000000-0000-0000-0000-000000000000'::uuid
  );
$$;

-- Returns the current user's normalized role from JWT claims
-- Normalizes to lowercase for consistent comparison
CREATE OR REPLACE FUNCTION current_role_norm()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT LOWER(COALESCE(
    auth.jwt() -> 'app_metadata' ->> 'role',
    ''
  ));
$$;

-- Returns array of active outlet_ids assigned to the current user
CREATE OR REPLACE FUNCTION current_active_outlet_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    array_agg(oa.outlet_id),
    ARRAY[]::uuid[]
  )
  FROM outlet_assignment oa
  WHERE oa.user_id = auth.uid()
    AND oa.active = true;
$$;

-- =============================================================================
-- Enable RLS on all multi-tenant tables
-- =============================================================================

ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_outlet ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredient ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_hours_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE refund ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_receiving ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_opname ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Policies: organization
-- All authenticated users can see their own organization
-- =============================================================================

CREATE POLICY org_select ON organization
  FOR SELECT
  USING (id = current_org());

-- =============================================================================
-- Policies: outlet
-- Owner: full CRUD within org
-- Manager/Cashier: SELECT only outlets they are assigned to
-- =============================================================================

CREATE POLICY outlet_select_owner ON outlet
  FOR SELECT
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

CREATE POLICY outlet_select_assigned ON outlet
  FOR SELECT
  USING (
    organization_id = current_org()
    AND current_role_norm() IN ('outlet_manager', 'cashier')
    AND id = ANY(current_active_outlet_ids())
  );

CREATE POLICY outlet_insert_owner ON outlet
  FOR INSERT
  WITH CHECK (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

CREATE POLICY outlet_update_owner ON outlet
  FOR UPDATE
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  )
  WITH CHECK (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

CREATE POLICY outlet_delete_owner ON outlet
  FOR DELETE
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

-- =============================================================================
-- Policies: user_profile
-- Owner: full access within org
-- Manager: SELECT users in overlapping outlets
-- Cashier: SELECT own profile only
-- =============================================================================

CREATE POLICY user_profile_select_owner ON user_profile
  FOR SELECT
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

CREATE POLICY user_profile_select_manager ON user_profile
  FOR SELECT
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'outlet_manager'
    AND (
      user_id = auth.uid()
      OR user_id IN (
        SELECT oa.user_id FROM outlet_assignment oa
        WHERE oa.outlet_id = ANY(current_active_outlet_ids())
          AND oa.active = true
      )
    )
  );

CREATE POLICY user_profile_select_cashier ON user_profile
  FOR SELECT
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'cashier'
    AND user_id = auth.uid()
  );

CREATE POLICY user_profile_insert_owner ON user_profile
  FOR INSERT
  WITH CHECK (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

CREATE POLICY user_profile_update_owner ON user_profile
  FOR UPDATE
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  )
  WITH CHECK (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

-- Manager can update cashier profiles in their assigned outlets
CREATE POLICY user_profile_update_manager ON user_profile
  FOR UPDATE
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'outlet_manager'
    AND role = 'cashier'
    AND user_id IN (
      SELECT oa.user_id FROM outlet_assignment oa
      WHERE oa.outlet_id = ANY(current_active_outlet_ids())
        AND oa.active = true
    )
  )
  WITH CHECK (
    organization_id = current_org()
    AND current_role_norm() = 'outlet_manager'
    AND role = 'cashier'
  );

-- =============================================================================
-- Policies: outlet_assignment
-- Owner: full access within org
-- Manager: SELECT/INSERT/UPDATE assignments for their outlets
-- Cashier: SELECT own assignments only
-- =============================================================================

CREATE POLICY outlet_assignment_select_owner ON outlet_assignment
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND user_id IN (
      SELECT up.user_id FROM user_profile up
      WHERE up.organization_id = current_org()
    )
  );

CREATE POLICY outlet_assignment_select_manager ON outlet_assignment
  FOR SELECT
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY outlet_assignment_select_cashier ON outlet_assignment
  FOR SELECT
  USING (
    current_role_norm() = 'cashier'
    AND user_id = auth.uid()
  );

CREATE POLICY outlet_assignment_insert_owner ON outlet_assignment
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY outlet_assignment_insert_manager ON outlet_assignment
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY outlet_assignment_update_owner ON outlet_assignment
  FOR UPDATE
  USING (
    current_role_norm() = 'owner'
    AND user_id IN (
      SELECT up.user_id FROM user_profile up
      WHERE up.organization_id = current_org()
    )
  )
  WITH CHECK (
    current_role_norm() = 'owner'
  );

CREATE POLICY outlet_assignment_update_manager ON outlet_assignment
  FOR UPDATE
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  )
  WITH CHECK (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY outlet_assignment_delete_owner ON outlet_assignment
  FOR DELETE
  USING (
    current_role_norm() = 'owner'
    AND user_id IN (
      SELECT up.user_id FROM user_profile up
      WHERE up.organization_id = current_org()
    )
  );

-- =============================================================================
-- Policies: menu_item
-- Organization-level table: Owner full access, Manager/Cashier SELECT within org
-- Manager can UPDATE menu items (for their outlets via menu_item_outlet overlay)
-- =============================================================================

CREATE POLICY menu_item_select ON menu_item
  FOR SELECT
  USING (organization_id = current_org());

CREATE POLICY menu_item_insert_owner ON menu_item
  FOR INSERT
  WITH CHECK (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

CREATE POLICY menu_item_update_owner ON menu_item
  FOR UPDATE
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  )
  WITH CHECK (organization_id = current_org());

CREATE POLICY menu_item_delete_owner ON menu_item
  FOR DELETE
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

-- =============================================================================
-- Policies: menu_item_outlet (overlay per outlet)
-- Owner: full access
-- Manager: CRUD on outlets they are assigned to
-- Cashier: SELECT on assigned outlets
-- =============================================================================

CREATE POLICY menu_item_outlet_select_owner ON menu_item_outlet
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY menu_item_outlet_select_assigned ON menu_item_outlet
  FOR SELECT
  USING (
    current_role_norm() IN ('outlet_manager', 'cashier')
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY menu_item_outlet_insert_owner ON menu_item_outlet
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY menu_item_outlet_insert_manager ON menu_item_outlet
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY menu_item_outlet_update_owner ON menu_item_outlet
  FOR UPDATE
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  )
  WITH CHECK (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY menu_item_outlet_update_manager ON menu_item_outlet
  FOR UPDATE
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  )
  WITH CHECK (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY menu_item_outlet_delete_owner ON menu_item_outlet
  FOR DELETE
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY menu_item_outlet_delete_manager ON menu_item_outlet
  FOR DELETE
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

-- =============================================================================
-- Policies: menu_price_history
-- Owner: SELECT all within org
-- Manager: SELECT for their assigned outlets (or global where outlet_id IS NULL)
-- Cashier: no access
-- =============================================================================

CREATE POLICY menu_price_history_select_owner ON menu_price_history
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND menu_item_id IN (
      SELECT mi.id FROM menu_item mi WHERE mi.organization_id = current_org()
    )
  );

CREATE POLICY menu_price_history_select_manager ON menu_price_history
  FOR SELECT
  USING (
    current_role_norm() = 'outlet_manager'
    AND menu_item_id IN (
      SELECT mi.id FROM menu_item mi WHERE mi.organization_id = current_org()
    )
    AND (outlet_id IS NULL OR outlet_id = ANY(current_active_outlet_ids()))
  );

-- INSERT via SECURITY DEFINER function (update_menu_price) only
CREATE POLICY menu_price_history_insert_none ON menu_price_history
  FOR INSERT
  WITH CHECK (false);

-- =============================================================================
-- Policies: raw_material
-- Organization-level: Owner full CRUD, Manager/Cashier SELECT within org
-- =============================================================================

CREATE POLICY raw_material_select ON raw_material
  FOR SELECT
  USING (organization_id = current_org());

CREATE POLICY raw_material_insert_owner ON raw_material
  FOR INSERT
  WITH CHECK (
    organization_id = current_org()
    AND current_role_norm() IN ('owner', 'outlet_manager')
  );

CREATE POLICY raw_material_update ON raw_material
  FOR UPDATE
  USING (
    organization_id = current_org()
    AND current_role_norm() IN ('owner', 'outlet_manager')
  )
  WITH CHECK (organization_id = current_org());

CREATE POLICY raw_material_delete_owner ON raw_material
  FOR DELETE
  USING (
    organization_id = current_org()
    AND current_role_norm() = 'owner'
  );

-- =============================================================================
-- Policies: raw_material_stock
-- Owner: full access within org outlets
-- Manager: CRUD on assigned outlets
-- Cashier: SELECT on assigned outlets (for shortfall display)
-- =============================================================================

CREATE POLICY raw_material_stock_select_owner ON raw_material_stock
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY raw_material_stock_select_assigned ON raw_material_stock
  FOR SELECT
  USING (
    current_role_norm() IN ('outlet_manager', 'cashier')
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY raw_material_stock_insert_owner ON raw_material_stock
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY raw_material_stock_insert_manager ON raw_material_stock
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY raw_material_stock_update_owner ON raw_material_stock
  FOR UPDATE
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY raw_material_stock_update_manager ON raw_material_stock
  FOR UPDATE
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  )
  WITH CHECK (
    outlet_id = ANY(current_active_outlet_ids())
  );

-- =============================================================================
-- Policies: recipe_ingredient
-- Organization-level via menu_item: all roles can SELECT within org
-- Owner/Manager can INSERT/UPDATE/DELETE
-- =============================================================================

CREATE POLICY recipe_ingredient_select ON recipe_ingredient
  FOR SELECT
  USING (
    menu_item_id IN (
      SELECT mi.id FROM menu_item mi WHERE mi.organization_id = current_org()
    )
  );

CREATE POLICY recipe_ingredient_insert ON recipe_ingredient
  FOR INSERT
  WITH CHECK (
    current_role_norm() IN ('owner', 'outlet_manager')
    AND menu_item_id IN (
      SELECT mi.id FROM menu_item mi WHERE mi.organization_id = current_org()
    )
  );

CREATE POLICY recipe_ingredient_update ON recipe_ingredient
  FOR UPDATE
  USING (
    current_role_norm() IN ('owner', 'outlet_manager')
    AND menu_item_id IN (
      SELECT mi.id FROM menu_item mi WHERE mi.organization_id = current_org()
    )
  )
  WITH CHECK (
    menu_item_id IN (
      SELECT mi.id FROM menu_item mi WHERE mi.organization_id = current_org()
    )
  );

CREATE POLICY recipe_ingredient_delete ON recipe_ingredient
  FOR DELETE
  USING (
    current_role_norm() IN ('owner', 'outlet_manager')
    AND menu_item_id IN (
      SELECT mi.id FROM menu_item mi WHERE mi.organization_id = current_org()
    )
  );

-- =============================================================================
-- Policies: outlet_hours_history
-- Owner: SELECT all within org
-- Manager: SELECT for assigned outlets
-- =============================================================================

CREATE POLICY outlet_hours_history_select_owner ON outlet_hours_history
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY outlet_hours_history_select_manager ON outlet_hours_history
  FOR SELECT
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

-- INSERT via trigger only (outlet hours change trigger)
CREATE POLICY outlet_hours_history_insert_none ON outlet_hours_history
  FOR INSERT
  WITH CHECK (false);

-- =============================================================================
-- Policies: transaction
-- Owner: SELECT all within org outlets
-- Manager: SELECT/INSERT/UPDATE on assigned outlets
-- Cashier: SELECT/INSERT on assigned outlets
-- =============================================================================

CREATE POLICY transaction_select_owner ON transaction
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY transaction_select_assigned ON transaction
  FOR SELECT
  USING (
    current_role_norm() IN ('outlet_manager', 'cashier')
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY transaction_insert_assigned ON transaction
  FOR INSERT
  WITH CHECK (
    current_role_norm() IN ('owner', 'outlet_manager', 'cashier')
    AND outlet_id = ANY(current_active_outlet_ids())
  );

-- Owner can also insert for any outlet in org
CREATE POLICY transaction_insert_owner ON transaction
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY transaction_update_owner ON transaction
  FOR UPDATE
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY transaction_update_manager ON transaction
  FOR UPDATE
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  )
  WITH CHECK (
    outlet_id = ANY(current_active_outlet_ids())
  );

-- =============================================================================
-- Policies: transaction_line
-- Follows parent transaction visibility
-- =============================================================================

CREATE POLICY transaction_line_select_owner ON transaction_line
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND transaction_id IN (
      SELECT t.id FROM transaction t
      JOIN outlet o ON t.outlet_id = o.id
      WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY transaction_line_select_assigned ON transaction_line
  FOR SELECT
  USING (
    current_role_norm() IN ('outlet_manager', 'cashier')
    AND transaction_id IN (
      SELECT t.id FROM transaction t
      WHERE t.outlet_id = ANY(current_active_outlet_ids())
    )
  );

CREATE POLICY transaction_line_insert ON transaction_line
  FOR INSERT
  WITH CHECK (
    transaction_id IN (
      SELECT t.id FROM transaction t
      WHERE (
        current_role_norm() = 'owner'
        AND t.outlet_id IN (
          SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
        )
      ) OR (
        current_role_norm() IN ('outlet_manager', 'cashier')
        AND t.outlet_id = ANY(current_active_outlet_ids())
      )
    )
  );

-- =============================================================================
-- Policies: refund
-- Owner: full access within org
-- Manager: SELECT/INSERT on assigned outlets (via transaction)
-- Cashier: SELECT only on assigned outlets
-- =============================================================================

CREATE POLICY refund_select_owner ON refund
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND transaction_id IN (
      SELECT t.id FROM transaction t
      JOIN outlet o ON t.outlet_id = o.id
      WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY refund_select_assigned ON refund
  FOR SELECT
  USING (
    current_role_norm() IN ('outlet_manager', 'cashier')
    AND transaction_id IN (
      SELECT t.id FROM transaction t
      WHERE t.outlet_id = ANY(current_active_outlet_ids())
    )
  );

CREATE POLICY refund_insert_owner ON refund
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'owner'
    AND transaction_id IN (
      SELECT t.id FROM transaction t
      JOIN outlet o ON t.outlet_id = o.id
      WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY refund_insert_manager ON refund
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'outlet_manager'
    AND transaction_id IN (
      SELECT t.id FROM transaction t
      WHERE t.outlet_id = ANY(current_active_outlet_ids())
    )
  );

-- =============================================================================
-- Policies: stock_receiving
-- Owner: full access within org
-- Manager: CRUD on assigned outlets
-- =============================================================================

CREATE POLICY stock_receiving_select_owner ON stock_receiving
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY stock_receiving_select_manager ON stock_receiving
  FOR SELECT
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY stock_receiving_insert ON stock_receiving
  FOR INSERT
  WITH CHECK (
    current_role_norm() IN ('owner', 'outlet_manager')
    AND outlet_id = ANY(current_active_outlet_ids())
  );

-- Owner can insert for any outlet in org
CREATE POLICY stock_receiving_insert_owner ON stock_receiving
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

-- =============================================================================
-- Policies: stock_opname
-- Owner: full access within org
-- Manager: CRUD on assigned outlets
-- =============================================================================

CREATE POLICY stock_opname_select_owner ON stock_opname
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

CREATE POLICY stock_opname_select_manager ON stock_opname
  FOR SELECT
  USING (
    current_role_norm() = 'outlet_manager'
    AND outlet_id = ANY(current_active_outlet_ids())
  );

CREATE POLICY stock_opname_insert ON stock_opname
  FOR INSERT
  WITH CHECK (
    current_role_norm() IN ('owner', 'outlet_manager')
    AND outlet_id = ANY(current_active_outlet_ids())
  );

-- Owner can insert for any outlet in org
CREATE POLICY stock_opname_insert_owner ON stock_opname
  FOR INSERT
  WITH CHECK (
    current_role_norm() = 'owner'
    AND outlet_id IN (
      SELECT o.id FROM outlet o WHERE o.organization_id = current_org()
    )
  );

-- =============================================================================
-- Policies: audit_log
-- SELECT: Owner only within org (Req 14.5)
-- INSERT: blocked for all roles (done via SECURITY DEFINER RPC record_audit)
-- UPDATE/DELETE: already blocked by rules in 0003_tx_audit.sql
-- =============================================================================

CREATE POLICY audit_log_select_owner ON audit_log
  FOR SELECT
  USING (
    current_role_norm() = 'owner'
    AND organization_id = current_org()
  );

-- INSERT blocked at RLS level; record_audit() uses SECURITY DEFINER to bypass
CREATE POLICY audit_log_insert_none ON audit_log
  FOR INSERT
  WITH CHECK (false);

-- UPDATE and DELETE are already blocked by PostgreSQL rules in 0003,
-- but add RLS policies as defense-in-depth
CREATE POLICY audit_log_update_none ON audit_log
  FOR UPDATE
  USING (false);

CREATE POLICY audit_log_delete_none ON audit_log
  FOR DELETE
  USING (false);
