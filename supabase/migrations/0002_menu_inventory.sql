-- =============================================================================
-- Migration: 0002_menu_inventory.sql
-- Description: Schema for menu_item, menu_item_outlet (overlay), 
--              menu_price_history, raw_material, raw_material_stock,
--              recipe_ingredient, and outlet_hours_history tables.
-- Requirements: 3.5, 5.1, 5.7, 6.1, 6.2, 6.3
-- =============================================================================

-- =============================================================================
-- Enum Types
-- =============================================================================

CREATE TYPE material_unit AS ENUM ('gram', 'ml', 'pcs', 'liter', 'kg');

-- =============================================================================
-- Table: menu_item
-- Organization-level menu item (Req 5.1)
-- Constraints:
--   - name: 1-100 characters
--   - category: 1-50 characters
--   - description: 0-500 characters (nullable)
--   - base_price: integer 0..10,000,000
--   - image_url: nullable text
--   - active: boolean (global default)
-- =============================================================================

CREATE TABLE menu_item (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  category        text        NOT NULL CHECK (char_length(category) BETWEEN 1 AND 50),
  description     text        CHECK (description IS NULL OR char_length(description) <= 500),
  base_price      integer     NOT NULL CHECK (base_price >= 0 AND base_price <= 10000000),
  unit            text        NOT NULL,
  active          boolean     NOT NULL DEFAULT true,
  image_url       text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Trigger: auto-update updated_at on menu_item
CREATE TRIGGER trg_menu_item_updated_at
  BEFORE UPDATE ON menu_item
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Indexes for menu_item
CREATE INDEX idx_menu_item_organization_id ON menu_item(organization_id);
CREATE INDEX idx_menu_item_category ON menu_item(organization_id, category);
CREATE INDEX idx_menu_item_active ON menu_item(organization_id, active);

-- =============================================================================
-- Table: menu_item_outlet
-- Per-outlet overlay for price and active status (Req 5.3, 5.4)
-- PK composite: (menu_item_id, outlet_id)
-- Constraints:
--   - price_override: nullable integer 0..10,000,000
--   - active_override: nullable boolean
-- =============================================================================

CREATE TABLE menu_item_outlet (
  menu_item_id    uuid    NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  outlet_id       uuid    NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  price_override  integer CHECK (price_override IS NULL OR (price_override >= 0 AND price_override <= 10000000)),
  active_override boolean,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (menu_item_id, outlet_id)
);

-- Trigger: auto-update updated_at on menu_item_outlet
CREATE TRIGGER trg_menu_item_outlet_updated_at
  BEFORE UPDATE ON menu_item_outlet
  FOR EACH ROW
  EXECUTE FUNCTION trigger_set_updated_at();

-- Index for querying overlays by outlet
CREATE INDEX idx_menu_item_outlet_outlet_id ON menu_item_outlet(outlet_id);

-- =============================================================================
-- Table: menu_price_history
-- Records price changes for audit trail (Req 5.7)
-- outlet_id nullable: null means global base_price change
-- Retention: 24 months minimum
-- =============================================================================

CREATE TABLE menu_price_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid        NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  outlet_id    uuid        REFERENCES outlet(id) ON DELETE SET NULL,
  old_price    integer     NOT NULL,
  new_price    integer     NOT NULL,
  changed_by   uuid        NOT NULL REFERENCES user_profile(user_id),
  effective_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for menu_price_history
CREATE INDEX idx_menu_price_history_menu_item_id ON menu_price_history(menu_item_id);
CREATE INDEX idx_menu_price_history_effective_at ON menu_price_history(effective_at DESC);

-- =============================================================================
-- Table: raw_material
-- Organization-level raw material definition (Req 6.1)
-- Constraints:
--   - name: 1-100 characters
--   - unit: enum material_unit (gram, ml, pcs, liter, kg)
-- =============================================================================

CREATE TABLE raw_material (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid          NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name            text          NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  unit            material_unit NOT NULL,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- Index for raw_material
CREATE INDEX idx_raw_material_organization_id ON raw_material(organization_id);

-- =============================================================================
-- Table: raw_material_stock
-- Per-outlet stock tracking (Req 6.1)
-- PK composite: (raw_material_id, outlet_id)
-- Constraints:
--   - quantity: numeric(10,2) — can go negative per Req 6.9 (stok minus)
--   - min_quantity: numeric(10,2) >= 0, <= 999,999.99
-- =============================================================================

CREATE TABLE raw_material_stock (
  raw_material_id uuid        NOT NULL REFERENCES raw_material(id) ON DELETE CASCADE,
  outlet_id       uuid        NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  quantity        numeric(10,2) NOT NULL DEFAULT 0,
  min_quantity    numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0 AND min_quantity <= 999999.99),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (raw_material_id, outlet_id)
);

-- Index for querying stock by outlet
CREATE INDEX idx_raw_material_stock_outlet_id ON raw_material_stock(outlet_id);

-- =============================================================================
-- Table: recipe_ingredient
-- Maps menu_item to raw_material with quantity per unit (Req 6.2)
-- PK composite: (menu_item_id, raw_material_id)
-- Constraints:
--   - qty_per_unit: numeric(10,2) > 0 AND <= 999,999.99
--   - Maximum 50 ingredients per menu_item (enforced via trigger)
-- =============================================================================

CREATE TABLE recipe_ingredient (
  menu_item_id    uuid          NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  raw_material_id uuid          NOT NULL REFERENCES raw_material(id) ON DELETE CASCADE,
  qty_per_unit    numeric(10,2) NOT NULL CHECK (qty_per_unit > 0 AND qty_per_unit <= 999999.99),

  PRIMARY KEY (menu_item_id, raw_material_id)
);

-- Index for querying recipes by raw_material
CREATE INDEX idx_recipe_ingredient_raw_material_id ON recipe_ingredient(raw_material_id);

-- =============================================================================
-- Trigger: enforce maximum 50 ingredients per menu_item (Req 6.2)
-- =============================================================================

CREATE OR REPLACE FUNCTION check_recipe_ingredient_limit()
RETURNS TRIGGER AS $$
DECLARE
  ingredient_count integer;
BEGIN
  SELECT COUNT(*) INTO ingredient_count
  FROM recipe_ingredient
  WHERE menu_item_id = NEW.menu_item_id;

  -- On INSERT, the new row is not yet counted, so check >= 50
  IF ingredient_count >= 50 THEN
    RAISE EXCEPTION 'A menu item cannot have more than 50 recipe ingredients'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_recipe_ingredient_limit
  BEFORE INSERT ON recipe_ingredient
  FOR EACH ROW
  EXECUTE FUNCTION check_recipe_ingredient_limit();

-- =============================================================================
-- Table: outlet_hours_history
-- Records changes to outlet operating hours (Req 3.5)
-- Retention: 365 days minimum
-- =============================================================================

CREATE TABLE outlet_hours_history (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id      uuid        NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  old_open_time  time        NOT NULL,
  old_close_time time        NOT NULL,
  new_open_time  time        NOT NULL,
  new_close_time time        NOT NULL,
  changed_by     uuid        NOT NULL REFERENCES user_profile(user_id),
  changed_at     timestamptz NOT NULL DEFAULT now()
);

-- Index for querying hours history by outlet
CREATE INDEX idx_outlet_hours_history_outlet_id ON outlet_hours_history(outlet_id);
CREATE INDEX idx_outlet_hours_history_changed_at ON outlet_hours_history(changed_at DESC);
