-- =============================================================================
-- Migration: 0006_triggers.sql
-- Description: BEFORE UPDATE triggers for menu price history and outlet hours
--              history. These triggers serve as safety nets — the primary
--              mechanism for price changes is the RPC `update_menu_price`
--              (task 2.5) which wraps UPDATE + INSERT in a single transaction.
-- Requirements: 3.5, 5.7, 5.9
-- =============================================================================

-- =============================================================================
-- Trigger function: Track base_price changes on menu_item
-- Inserts into menu_price_history when base_price changes.
-- outlet_id is NULL to indicate a global (base) price change.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_fn_menu_item_price_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.base_price IS DISTINCT FROM NEW.base_price THEN
    INSERT INTO menu_price_history (
      menu_item_id,
      outlet_id,
      old_price,
      new_price,
      changed_by,
      effective_at
    ) VALUES (
      NEW.id,
      NULL,  -- NULL = global base_price change
      OLD.base_price,
      NEW.base_price,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_menu_item_price_history
  BEFORE UPDATE ON menu_item
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_menu_item_price_history();

-- =============================================================================
-- Trigger function: Track price_override changes on menu_item_outlet
-- Inserts into menu_price_history when price_override changes.
-- Records the outlet_id to distinguish per-outlet price changes.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_fn_menu_item_outlet_price_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.price_override IS DISTINCT FROM NEW.price_override THEN
    INSERT INTO menu_price_history (
      menu_item_id,
      outlet_id,
      old_price,
      new_price,
      changed_by,
      effective_at
    ) VALUES (
      NEW.menu_item_id,
      NEW.outlet_id,
      COALESCE(OLD.price_override, 0),
      COALESCE(NEW.price_override, 0),
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_menu_item_outlet_price_history
  BEFORE UPDATE ON menu_item_outlet
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_menu_item_outlet_price_history();

-- =============================================================================
-- Trigger function: Track operating hours changes on outlet
-- Inserts into outlet_hours_history when open_time or close_time changes.
-- Req 3.5: retention minimum 365 days.
-- =============================================================================

CREATE OR REPLACE FUNCTION trg_fn_outlet_hours_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.open_time IS DISTINCT FROM NEW.open_time
     OR OLD.close_time IS DISTINCT FROM NEW.close_time THEN
    INSERT INTO outlet_hours_history (
      outlet_id,
      old_open_time,
      old_close_time,
      new_open_time,
      new_close_time,
      changed_by,
      changed_at
    ) VALUES (
      NEW.id,
      OLD.open_time,
      OLD.close_time,
      NEW.open_time,
      NEW.close_time,
      COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
      now()
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_outlet_hours_history
  BEFORE UPDATE ON outlet
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_outlet_hours_history();

-- =============================================================================
-- Retention cleanup functions
-- These can be called via pg_cron or a scheduled job to purge old records.
-- =============================================================================

-- Purge menu_price_history older than 24 months (Req 5.7)
CREATE OR REPLACE FUNCTION cleanup_menu_price_history()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM menu_price_history
  WHERE effective_at < now() - interval '24 months';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Purge outlet_hours_history older than 365 days (Req 3.5)
CREATE OR REPLACE FUNCTION cleanup_outlet_hours_history()
RETURNS integer AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM outlet_hours_history
  WHERE changed_at < now() - interval '365 days';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Optional: Views for querying only retained data
-- These provide a convenient way to query within retention windows without
-- relying solely on cleanup jobs.
-- =============================================================================

CREATE OR REPLACE VIEW menu_price_history_retained AS
SELECT *
FROM menu_price_history
WHERE effective_at >= now() - interval '24 months';

CREATE OR REPLACE VIEW outlet_hours_history_retained AS
SELECT *
FROM outlet_hours_history
WHERE changed_at >= now() - interval '365 days';
