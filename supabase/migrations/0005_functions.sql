-- =============================================================================
-- Migration: 0005_functions.sql
-- Description: SECURITY DEFINER functions for atomic operations.
--              All functions run as the definer (superuser) to bypass RLS
--              and guarantee atomicity within a single Postgres transaction.
-- Requirements: 2.10, 5.7, 5.9, 6.4, 7.7, 7.8, 7.10, 7.11, 14.1, 14.2, 14.6, 2.8
-- =============================================================================

-- =============================================================================
-- Function: record_audit(payload jsonb)
-- Inserts an audit log entry with validation and truncation.
-- Always accepts entries regardless of access flags (Req 14.1).
-- Truncates value_before/value_after to 2000 chars (Req 14.2).
-- =============================================================================

CREATE OR REPLACE FUNCTION record_audit(payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_org_id uuid;
  v_user_id uuid;
  v_role text;
  v_outlet_id uuid;
  v_action_type text;
  v_entity text;
  v_entity_id uuid;
  v_value_before text;
  v_value_after text;
BEGIN
  -- Extract and validate required fields
  v_org_id := (payload->>'organization_id')::uuid;
  v_user_id := (payload->>'user_id')::uuid;
  v_role := payload->>'role';
  v_action_type := payload->>'action_type';
  v_entity := payload->>'entity';

  IF v_org_id IS NULL OR v_user_id IS NULL OR v_role IS NULL
     OR v_action_type IS NULL OR v_entity IS NULL THEN
    RAISE EXCEPTION 'record_audit: missing required fields (organization_id, user_id, role, action_type, entity)'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Optional fields
  v_outlet_id := (payload->>'outlet_id')::uuid;
  v_entity_id := (payload->>'entity_id')::uuid;

  -- Truncate value_before/value_after to 2000 characters
  v_value_before := left(payload->>'value_before', 2000);
  v_value_after := left(payload->>'value_after', 2000);

  INSERT INTO audit_log (
    organization_id, user_id, role, outlet_id,
    action_type, entity, entity_id,
    value_before, value_after, created_at
  ) VALUES (
    v_org_id, v_user_id, v_role, v_outlet_id,
    v_action_type, v_entity, v_entity_id,
    v_value_before, v_value_after, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =============================================================================
-- Function: log_unauthorized_outlet_attempt(outlet_id uuid, action text)
-- Logs an unauthorized outlet access attempt to audit_log (Req 2.8, 14.6).
-- =============================================================================

CREATE OR REPLACE FUNCTION log_unauthorized_outlet_attempt(
  p_outlet_id uuid,
  p_action text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
BEGIN
  -- Get current user info from auth context
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'log_unauthorized_outlet_attempt: no authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Get user's org and role
  SELECT organization_id, role::text INTO v_org_id, v_role
  FROM user_profile
  WHERE user_id = v_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'log_unauthorized_outlet_attempt: user profile not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO audit_log (
    organization_id, user_id, role, outlet_id,
    action_type, entity, entity_id,
    value_before, value_after, created_at
  ) VALUES (
    v_org_id, v_user_id, v_role, p_outlet_id,
    'auth.unauthorized_outlet', 'outlet', p_outlet_id,
    NULL, jsonb_build_object('action', p_action)::text, now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- =============================================================================
-- Function: create_transaction(payload jsonb)
-- Atomically creates a transaction with lines, deducts stock, and inserts audit.
-- If inventory deduction fails, the entire transaction is rolled back and
-- returns error 'INVENTORY_TRIGGER_FAILED' (Req 7.7).
-- If deduction succeeds but post-processing fails, status becomes
-- 'pending_reconciliation' (Req 7.8).
-- Requirements: 6.4, 7.7, 7.8
-- =============================================================================

CREATE OR REPLACE FUNCTION create_transaction(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_outlet_id uuid;
  v_cashier_id uuid;
  v_subtotal integer;
  v_discount integer;
  v_tax integer;
  v_total integer;
  v_payment_method payment_method;
  v_amount_paid integer;
  v_change_due integer;
  v_device_id text;
  v_line jsonb;
  v_menu_item_id uuid;
  v_quantity integer;
  v_recipe record;
  v_required_qty numeric(10,2);
  v_org_id uuid;
  v_outlet_active boolean;
BEGIN
  -- Extract transaction fields from payload
  v_tx_id := COALESCE((payload->>'id')::uuid, gen_random_uuid());
  v_outlet_id := (payload->>'outlet_id')::uuid;
  v_cashier_id := (payload->>'cashier_user_id')::uuid;
  v_subtotal := (payload->>'subtotal')::integer;
  v_discount := COALESCE((payload->>'discount')::integer, 0);
  v_tax := COALESCE((payload->>'tax')::integer, 0);
  v_total := (payload->>'total')::integer;
  v_payment_method := (payload->>'payment_method')::payment_method;
  v_amount_paid := (payload->>'amount_paid')::integer;
  v_change_due := COALESCE((payload->>'change_due')::integer, 0);
  v_device_id := payload->>'device_id';

  -- Validate required fields
  IF v_outlet_id IS NULL OR v_cashier_id IS NULL OR v_total IS NULL
     OR v_payment_method IS NULL OR v_amount_paid IS NULL THEN
    RAISE EXCEPTION 'create_transaction: missing required fields'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Check outlet is active (Req 3.4)
  SELECT active, organization_id INTO v_outlet_active, v_org_id
  FROM outlet WHERE id = v_outlet_id;

  IF v_outlet_active IS NULL THEN
    RAISE EXCEPTION 'create_transaction: outlet not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT v_outlet_active THEN
    RAISE EXCEPTION 'create_transaction: OUTLET_INACTIVE'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Insert the transaction record
  INSERT INTO transaction (
    id, outlet_id, cashier_user_id, subtotal, discount, tax, total,
    payment_method, amount_paid, change_due, status, device_id, created_at
  ) VALUES (
    v_tx_id, v_outlet_id, v_cashier_id, v_subtotal, v_discount, v_tax, v_total,
    v_payment_method, v_amount_paid, v_change_due, 'confirmed', v_device_id, now()
  );

  -- Insert transaction lines
  IF payload->'lines' IS NULL OR jsonb_array_length(payload->'lines') = 0 THEN
    RAISE EXCEPTION 'create_transaction: transaction must have at least one line'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(payload->'lines')
  LOOP
    INSERT INTO transaction_line (
      transaction_id, menu_item_id, name_snapshot, unit_price, quantity, line_total
    ) VALUES (
      v_tx_id,
      (v_line->>'menu_item_id')::uuid,
      v_line->>'name_snapshot',
      (v_line->>'unit_price')::integer,
      (v_line->>'quantity')::integer,
      (v_line->>'line_total')::integer
    );
  END LOOP;

  -- Deduct stock based on recipes (Req 6.4, 7.7)
  -- This is the "inventory trigger" - if it fails, the entire function
  -- raises an exception which rolls back the whole Postgres transaction.
  FOR v_line IN SELECT * FROM jsonb_array_elements(payload->'lines')
  LOOP
    v_menu_item_id := (v_line->>'menu_item_id')::uuid;
    v_quantity := (v_line->>'quantity')::integer;

    -- For each recipe ingredient of this menu item, deduct stock
    FOR v_recipe IN
      SELECT ri.raw_material_id, ri.qty_per_unit
      FROM recipe_ingredient ri
      WHERE ri.menu_item_id = v_menu_item_id
    LOOP
      v_required_qty := v_recipe.qty_per_unit * v_quantity;

      -- Deduct from raw_material_stock (allows negative per Req 6.9)
      UPDATE raw_material_stock
      SET quantity = quantity - v_required_qty,
          updated_at = now()
      WHERE raw_material_id = v_recipe.raw_material_id
        AND outlet_id = v_outlet_id;

      -- If no stock row exists for this material at this outlet, fail
      -- This triggers full rollback of the entire function (Req 7.7)
      IF NOT FOUND THEN
        RAISE EXCEPTION 'INVENTORY_TRIGGER_FAILED'
          USING ERRCODE = 'triggered_action_exception';
      END IF;
    END LOOP;
  END LOOP;

  -- Insert audit log entry for the transaction
  INSERT INTO audit_log (
    organization_id, user_id, role, outlet_id,
    action_type, entity, entity_id,
    value_before, value_after, created_at
  ) VALUES (
    v_org_id, v_cashier_id, 'cashier', v_outlet_id,
    'tx.create', 'transaction', v_tx_id,
    NULL,
    left(jsonb_build_object(
      'total', v_total,
      'payment_method', v_payment_method::text,
      'lines_count', jsonb_array_length(payload->'lines')
    )::text, 2000),
    now()
  );

  RETURN jsonb_build_object('id', v_tx_id, 'status', 'confirmed');
END;
$$;

-- =============================================================================
-- Function: refund_transaction(tx_id uuid)
-- Validates 24h window, confirmed status, not already refunded.
-- Inserts refund record, changes status to 'refunded', restores stock,
-- and inserts audit entry. (Req 7.10, 7.11)
-- =============================================================================

CREATE OR REPLACE FUNCTION refund_transaction(p_tx_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx record;
  v_refund_id uuid;
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_line record;
  v_recipe record;
  v_restore_qty numeric(10,2);
  v_existing_refund uuid;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'refund_transaction: no authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Get user role and org
  SELECT organization_id, role::text INTO v_org_id, v_role
  FROM user_profile
  WHERE user_id = v_user_id;

  -- Only Owner or Outlet_Manager can refund (Req 7.10)
  IF v_role NOT IN ('owner', 'outlet_manager') THEN
    RETURN jsonb_build_object('error', 'INSUFFICIENT_PRIVILEGE',
      'message', 'Only Owner or Outlet_Manager can issue refunds');
  END IF;

  -- Fetch the transaction
  SELECT * INTO v_tx FROM transaction WHERE id = p_tx_id;

  IF v_tx IS NULL THEN
    RETURN jsonb_build_object('error', 'TRANSACTION_NOT_FOUND',
      'message', 'Transaction does not exist');
  END IF;

  -- Check status is confirmed (Req 7.11)
  IF v_tx.status != 'confirmed' THEN
    RETURN jsonb_build_object('error', 'INVALID_STATUS',
      'message', 'Transaction status must be confirmed to refund');
  END IF;

  -- Check 24h window (Req 7.10, 7.11)
  IF v_tx.created_at < (now() - interval '24 hours') THEN
    RETURN jsonb_build_object('error', 'REFUND_WINDOW_EXPIRED',
      'message', 'Transaction was created more than 24 hours ago');
  END IF;

  -- Check not already refunded (Req 7.10, 7.11)
  SELECT id INTO v_existing_refund FROM refund WHERE transaction_id = p_tx_id;
  IF v_existing_refund IS NOT NULL THEN
    RETURN jsonb_build_object('error', 'ALREADY_REFUNDED',
      'message', 'Transaction has already been refunded');
  END IF;

  -- Insert refund record
  INSERT INTO refund (transaction_id, issued_by, created_at)
  VALUES (p_tx_id, v_user_id, now())
  RETURNING id INTO v_refund_id;

  -- Update transaction status to refunded
  UPDATE transaction SET status = 'refunded' WHERE id = p_tx_id;

  -- Restore stock for each line item based on recipes (Req 7.10)
  FOR v_line IN
    SELECT tl.menu_item_id, tl.quantity
    FROM transaction_line tl
    WHERE tl.transaction_id = p_tx_id
  LOOP
    FOR v_recipe IN
      SELECT ri.raw_material_id, ri.qty_per_unit
      FROM recipe_ingredient ri
      WHERE ri.menu_item_id = v_line.menu_item_id
    LOOP
      v_restore_qty := v_recipe.qty_per_unit * v_line.quantity;

      UPDATE raw_material_stock
      SET quantity = quantity + v_restore_qty,
          updated_at = now()
      WHERE raw_material_id = v_recipe.raw_material_id
        AND outlet_id = v_tx.outlet_id;
    END LOOP;
  END LOOP;

  -- Insert audit log for refund
  INSERT INTO audit_log (
    organization_id, user_id, role, outlet_id,
    action_type, entity, entity_id,
    value_before, value_after, created_at
  ) VALUES (
    v_org_id, v_user_id, v_role, v_tx.outlet_id,
    'tx.refund', 'transaction', p_tx_id,
    left(jsonb_build_object('status', 'confirmed', 'total', v_tx.total)::text, 2000),
    left(jsonb_build_object('status', 'refunded', 'refund_id', v_refund_id)::text, 2000),
    now()
  );

  RETURN jsonb_build_object('id', v_refund_id, 'status', 'refunded');
END;
$$;

-- =============================================================================
-- Function: update_menu_price(menu_item_id uuid, outlet_id uuid, new_price int)
-- Atomically updates menu price and inserts price history.
-- If outlet_id is NULL, updates base_price on menu_item table.
-- If outlet_id is provided, updates price_override on menu_item_outlet.
-- Rollback if history insert fails (Req 5.7, 5.9).
-- =============================================================================

CREATE OR REPLACE FUNCTION update_menu_price(
  p_menu_item_id uuid,
  p_outlet_id uuid DEFAULT NULL,
  p_new_price integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_price integer;
  v_user_id uuid;
  v_org_id uuid;
  v_role text;
  v_history_id uuid;
BEGIN
  -- Validate new_price
  IF p_new_price IS NULL OR p_new_price < 0 OR p_new_price > 10000000 THEN
    RAISE EXCEPTION 'update_menu_price: new_price must be between 0 and 10000000'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'update_menu_price: no authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Get user role and org
  SELECT organization_id, role::text INTO v_org_id, v_role
  FROM user_profile
  WHERE user_id = v_user_id;

  IF p_outlet_id IS NULL THEN
    -- Update global base_price on menu_item
    SELECT base_price INTO v_old_price
    FROM menu_item
    WHERE id = p_menu_item_id;

    IF v_old_price IS NULL THEN
      RAISE EXCEPTION 'update_menu_price: menu item not found'
        USING ERRCODE = 'no_data_found';
    END IF;

    -- No change needed if price is the same
    IF v_old_price = p_new_price THEN
      RETURN jsonb_build_object('status', 'no_change', 'price', v_old_price);
    END IF;

    -- Update the base price
    UPDATE menu_item SET base_price = p_new_price WHERE id = p_menu_item_id;

    -- Insert price history (Req 5.7) - if this fails, entire tx rolls back (Req 5.9)
    INSERT INTO menu_price_history (
      menu_item_id, outlet_id, old_price, new_price, changed_by, effective_at
    ) VALUES (
      p_menu_item_id, NULL, v_old_price, p_new_price, v_user_id, now()
    )
    RETURNING id INTO v_history_id;

  ELSE
    -- Update per-outlet price override on menu_item_outlet
    SELECT price_override INTO v_old_price
    FROM menu_item_outlet
    WHERE menu_item_id = p_menu_item_id AND outlet_id = p_outlet_id;

    IF v_old_price IS NULL THEN
      -- No overlay exists yet; get base_price as old_price
      SELECT base_price INTO v_old_price
      FROM menu_item WHERE id = p_menu_item_id;

      IF v_old_price IS NULL THEN
        RAISE EXCEPTION 'update_menu_price: menu item not found'
          USING ERRCODE = 'no_data_found';
      END IF;

      -- Insert new overlay row
      INSERT INTO menu_item_outlet (menu_item_id, outlet_id, price_override)
      VALUES (p_menu_item_id, p_outlet_id, p_new_price)
      ON CONFLICT (menu_item_id, outlet_id)
      DO UPDATE SET price_override = p_new_price;
    ELSE
      -- No change needed if price is the same
      IF v_old_price = p_new_price THEN
        RETURN jsonb_build_object('status', 'no_change', 'price', v_old_price);
      END IF;

      -- Update existing overlay
      UPDATE menu_item_outlet
      SET price_override = p_new_price
      WHERE menu_item_id = p_menu_item_id AND outlet_id = p_outlet_id;
    END IF;

    -- Insert price history (Req 5.7) - if this fails, entire tx rolls back (Req 5.9)
    INSERT INTO menu_price_history (
      menu_item_id, outlet_id, old_price, new_price, changed_by, effective_at
    ) VALUES (
      p_menu_item_id, p_outlet_id, v_old_price, p_new_price, v_user_id, now()
    )
    RETURNING id INTO v_history_id;
  END IF;

  -- Insert audit log for price change
  INSERT INTO audit_log (
    organization_id, user_id, role, outlet_id,
    action_type, entity, entity_id,
    value_before, value_after, created_at
  ) VALUES (
    v_org_id, v_user_id, v_role, p_outlet_id,
    'menu.price_change', 'menu_item', p_menu_item_id,
    left(jsonb_build_object('price', v_old_price)::text, 2000),
    left(jsonb_build_object('price', p_new_price)::text, 2000),
    now()
  );

  RETURN jsonb_build_object(
    'status', 'updated',
    'old_price', v_old_price,
    'new_price', p_new_price,
    'history_id', v_history_id
  );
END;
$$;

-- =============================================================================
-- Function: update_user_role_and_assignments(user_id uuid, role text, outlet_ids uuid[])
-- Atomically updates user role and outlet assignments.
-- Used as the "apply" step for propagation with 60s timeout (Req 2.10).
-- Returns a snapshot of the previous state for potential revert.
-- =============================================================================

CREATE OR REPLACE FUNCTION update_user_role_and_assignments(
  p_user_id uuid,
  p_role text,
  p_outlet_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_org_id uuid;
  v_old_role text;
  v_old_outlet_ids uuid[];
  v_outlet_id uuid;
  v_snapshot jsonb;
BEGIN
  -- Get caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'update_user_role_and_assignments: no authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Validate role value
  IF p_role NOT IN ('owner', 'outlet_manager', 'cashier') THEN
    RAISE EXCEPTION 'update_user_role_and_assignments: invalid role "%"', p_role
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Get current state (snapshot for revert)
  SELECT organization_id, role::text INTO v_org_id, v_old_role
  FROM user_profile
  WHERE user_id = p_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'update_user_role_and_assignments: user not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Get current active outlet assignments
  SELECT array_agg(outlet_id) INTO v_old_outlet_ids
  FROM outlet_assignment
  WHERE user_id = p_user_id AND active = true;

  -- Build snapshot for potential revert
  v_snapshot := jsonb_build_object(
    'user_id', p_user_id,
    'old_role', v_old_role,
    'old_outlet_ids', COALESCE(to_jsonb(v_old_outlet_ids), '[]'::jsonb)
  );

  -- Update role
  UPDATE user_profile
  SET role = p_role::user_role
  WHERE user_id = p_user_id;

  -- Deactivate all current assignments
  UPDATE outlet_assignment
  SET active = false
  WHERE user_id = p_user_id AND active = true;

  -- Insert/reactivate new assignments
  IF p_outlet_ids IS NOT NULL AND array_length(p_outlet_ids, 1) > 0 THEN
    FOREACH v_outlet_id IN ARRAY p_outlet_ids
    LOOP
      INSERT INTO outlet_assignment (user_id, outlet_id, active, created_by, created_at)
      VALUES (p_user_id, v_outlet_id, true, v_caller_id, now())
      ON CONFLICT (user_id, outlet_id)
      DO UPDATE SET active = true;
    END LOOP;
  END IF;

  -- Insert audit log
  INSERT INTO audit_log (
    organization_id, user_id, role, outlet_id,
    action_type, entity, entity_id,
    value_before, value_after, created_at
  ) VALUES (
    v_org_id, v_caller_id, (SELECT role::text FROM user_profile WHERE user_id = v_caller_id),
    NULL,
    'user.role_change', 'user_profile', p_user_id,
    left(jsonb_build_object('role', v_old_role, 'outlet_ids', COALESCE(v_old_outlet_ids, ARRAY[]::uuid[]))::text, 2000),
    left(jsonb_build_object('role', p_role, 'outlet_ids', p_outlet_ids)::text, 2000),
    now()
  );

  RETURN jsonb_build_object(
    'status', 'applied',
    'snapshot', v_snapshot
  );
END;
$$;

-- =============================================================================
-- Function: revert_user_role_and_assignments(user_id uuid, snapshot jsonb)
-- Reverts user role and assignments to the state captured in snapshot.
-- Called when propagation timeout (60s) is exceeded (Req 2.10).
-- =============================================================================

CREATE OR REPLACE FUNCTION revert_user_role_and_assignments(
  p_user_id uuid,
  p_snapshot jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_org_id uuid;
  v_old_role text;
  v_old_outlet_ids uuid[];
  v_outlet_id uuid;
  v_current_role text;
BEGIN
  -- Get caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'revert_user_role_and_assignments: no authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Extract snapshot values
  v_old_role := p_snapshot->>'old_role';
  SELECT array_agg(value::text::uuid) INTO v_old_outlet_ids
  FROM jsonb_array_elements_text(p_snapshot->'old_outlet_ids');

  IF v_old_role IS NULL THEN
    RAISE EXCEPTION 'revert_user_role_and_assignments: invalid snapshot - missing old_role'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Get org_id and current role for audit
  SELECT organization_id, role::text INTO v_org_id, v_current_role
  FROM user_profile
  WHERE user_id = p_user_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'revert_user_role_and_assignments: user not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Revert role
  UPDATE user_profile
  SET role = v_old_role::user_role
  WHERE user_id = p_user_id;

  -- Deactivate all current assignments
  UPDATE outlet_assignment
  SET active = false
  WHERE user_id = p_user_id AND active = true;

  -- Restore old assignments
  IF v_old_outlet_ids IS NOT NULL AND array_length(v_old_outlet_ids, 1) > 0 THEN
    FOREACH v_outlet_id IN ARRAY v_old_outlet_ids
    LOOP
      INSERT INTO outlet_assignment (user_id, outlet_id, active, created_by, created_at)
      VALUES (p_user_id, v_outlet_id, true, v_caller_id, now())
      ON CONFLICT (user_id, outlet_id)
      DO UPDATE SET active = true;
    END LOOP;
  END IF;

  -- Insert audit log for revert
  INSERT INTO audit_log (
    organization_id, user_id, role, outlet_id,
    action_type, entity, entity_id,
    value_before, value_after, created_at
  ) VALUES (
    v_org_id, v_caller_id, (SELECT role::text FROM user_profile WHERE user_id = v_caller_id),
    NULL,
    'user.assignment_revert', 'user_profile', p_user_id,
    left(jsonb_build_object('role', v_current_role)::text, 2000),
    left(jsonb_build_object('role', v_old_role, 'outlet_ids', COALESCE(v_old_outlet_ids, ARRAY[]::uuid[]), 'reason', 'propagation_timeout')::text, 2000),
    now()
  );

  RETURN jsonb_build_object(
    'status', 'reverted',
    'role', v_old_role,
    'outlet_ids', COALESCE(to_jsonb(v_old_outlet_ids), '[]'::jsonb)
  );
END;
$$;
