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

-- Closed set of units for raw materials (Req 6.1)
CREATE TYPE raw_material_unit AS ENUM ('gram', 'ml', 'pcs', 'liter', 'kg');

-- =============================================================================
-- Table: menu_item
-- Central menu item definition at organization level (Req 5.1)
-- Constraints:
--   - base_price: integer 0..10_000_000
--   - name: 1-100 chars
--   - category: 1-50 chars
--   - description: 0-500 chars
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

-- Indexes on menu_item
CREATE INDEX idx_menu_item_organization_id ON menu_item(organization_id);
CREATE INDEX idx_menu_item_category ON menu_item(category);
CREATE INDEX idx_menu_item_active ON menu_item(active);

-- =============================================================================
-- Table: menu_item_outlet (overlay per outlet)
-- Allows per-outlet price override and active status override (Req 5.3, 5.4)
-- Primary key is composite (menu_item_id, outlet_id)
-- =============================================================================

CREATE TABLE menu_item_outlet (
  menu_item_id    uuid    NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  outlet_id       uuid    NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  price_override  integer CHECK (price_override IS NULL OR (price_override >= 0 AND price_override <= 10000000)),
  active_override boolean,

  PRIMARY KEY (menu_item_id, outlet_id)
);

-- Index for outlet-based lookups
CREATE INDEX idx_menu_item_outlet_outlet_id ON menu_item_outlet(outlet_id);

-- =============================================================================
-- Table: menu_price_history
-- Records price changes for audit trail (Req 5.7)
-- Retention: minimum 24 months
-- outlet_id NULL means global (base_price) change
-- =============================================================================

CREATE TABLE menu_price_history (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_item_id uuid        NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  outlet_id    uuid        REFERENCES outlet(id) ON DELETE SET NULL,
  old_price    integer     NOT NULL,
  new_price    integer     NOT NULL,
  changed_by   uuid        NOT NULL,
  effective_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for querying price history
CREATE INDEX idx_menu_price_history_menu_item_id ON menu_price_history(menu_item_id);
CREATE INDEX idx_menu_price_history_effective_at ON menu_price_history(effective_at DESC);

-- =============================================================================
-- Table: raw_material
-- Organization-level raw material definition (Req 6.1)
-- =============================================================================

CREATE TABLE raw_material (
  id              uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid              NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  name            text              NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  unit            raw_material_unit NOT NULL,
  created_at      timestamptz       NOT NULL DEFAULT now()
);

-- Index on organization
CREATE INDEX idx_raw_material_organization_id ON raw_material(organization_id);

-- =============================================================================
-- Table: raw_material_stock
-- Per-outlet stock tracking (Req 6.1)
-- Primary key is composite (raw_material_id, outlet_id)
-- Constraints:
--   - quantity: numeric(10,2), can go negative per Req 6.9 (stok minus)
--   - min_quantity: numeric(10,2), 0..999_999.99
-- =============================================================================

CREATE TABLE raw_material_stock (
  raw_material_id uuid        NOT NULL REFERENCES raw_material(id) ON DELETE CASCADE,
  outlet_id       uuid        NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  quantity        numeric(10,2) NOT NULL DEFAULT 0,
  min_quantity    numeric(10,2) NOT NULL DEFAULT 0 CHECK (min_quantity >= 0 AND min_quantity <= 999999.99),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  PRIMARY KEY (raw_material_id, outlet_id)
);

-- Index for outlet-based stock lookups
CREATE INDEX idx_raw_material_stock_outlet_id ON raw_material_stock(outlet_id);

-- =============================================================================
-- Table: recipe_ingredient
-- Maps menu items to raw materials with quantity per unit (Req 6.2)
-- Primary key is composite (menu_item_id, raw_material_id)
-- Constraints:
--   - qty_per_unit: > 0 and <= 999_999.99
--   - Maximum 50 ingredients per menu_item (enforced via trigger)
-- =============================================================================

CREATE TABLE recipe_ingredient (
  menu_item_id    uuid          NOT NULL REFERENCES menu_item(id) ON DELETE CASCADE,
  raw_material_id uuid          NOT NULL REFERENCES raw_material(id) ON DELETE CASCADE,
  qty_per_unit    numeric(10,2) NOT NULL CHECK (qty_per_unit > 0 AND qty_per_unit <= 999999.99),

  PRIMARY KEY (menu_item_id, raw_material_id)
);

-- Index for raw_material lookups
CREATE INDEX idx_recipe_ingredient_raw_material_id ON recipe_ingredient(raw_material_id);

-- =============================================================================
-- Trigger: Enforce maximum 50 ingredients per menu_item (Req 6.2)
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
-- Retention: minimum 365 days
-- =============================================================================

CREATE TABLE outlet_hours_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     uuid        NOT NULL REFERENCES outlet(id) ON DELETE CASCADE,
  old_open_time time,
  old_close_time time,
  new_open_time time,
  new_close_time time,
  changed_by    uuid        NOT NULL,
  changed_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for outlet-based history lookups
CREATE INDEX idx_outlet_hours_history_outlet_id ON outlet_hours_history(outlet_id);
CREATE INDEX idx_outlet_hours_history_changed_at ON outlet_hours_history(changed_at DESC);
