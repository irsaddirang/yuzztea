-- =============================================================================
-- Migration: 0003_tx_audit.sql
-- Description: Schema for transaction, transaction_line, refund,
--              stock_receiving, stock_opname, and audit_log tables.
-- Requirements: 5.7, 6.6, 6.7, 7.4, 7.10, 14.2
-- =============================================================================

-- =============================================================================
-- Enum Types
-- =============================================================================

CREATE TYPE payment_method AS ENUM ('tunai', 'qris', 'transfer');

CREATE TYPE transaction_status AS ENUM (
  'pending',
  'confirmed',
  'cancelled',
  'refunded',
  'pending_reconciliation',
  'pending_sync',
  'conflict_review'
);

-- =============================================================================
-- Table: transaction
-- Req 7.4: Full transaction record with all required fields
-- Req 11.5: pending_sync and conflict_review statuses for offline support
-- =============================================================================

CREATE TABLE transaction (
  id               uuid               PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id        uuid               NOT NULL REFERENCES outlet(id) ON DELETE RESTRICT,
  cashier_user_id  uuid               NOT NULL REFERENCES user_profile(user_id) ON DELETE RESTRICT,
  subtotal         integer            NOT NULL CHECK (subtotal >= 0),
  discount         integer            NOT NULL DEFAULT 0 CHECK (discount >= 0),
  tax              integer            NOT NULL DEFAULT 0 CHECK (tax >= 0),
  total            integer            NOT NULL CHECK (total >= 0),
  payment_method   payment_method     NOT NULL,
  amount_paid      integer            NOT NULL CHECK (amount_paid >= 0),
  change_due       integer            NOT NULL DEFAULT 0 CHECK (change_due >= 0),
  status           transaction_status NOT NULL DEFAULT 'pending',
  device_id        text,
  created_at       timestamptz        NOT NULL DEFAULT now(),

  -- Req 7.4: subtotal - discount + tax = total
  CONSTRAINT chk_transaction_totals CHECK (subtotal - discount + tax = total)
);

-- =============================================================================
-- Table: transaction_line
-- Snapshot of menu item at time of transaction (Req 11.5: price at creation)
-- =============================================================================

CREATE TABLE transaction_line (
  id              uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid    NOT NULL REFERENCES transaction(id) ON DELETE CASCADE,
  menu_item_id    uuid    NOT NULL REFERENCES menu_item(id) ON DELETE RESTRICT,
  name_snapshot   text    NOT NULL,
  unit_price      integer NOT NULL CHECK (unit_price >= 0),
  quantity        integer NOT NULL CHECK (quantity >= 1),
  line_total      integer NOT NULL CHECK (line_total >= 0)
);

-- =============================================================================
-- Table: refund
-- Req 7.10: One refund per transaction (unique constraint on transaction_id)
-- =============================================================================

CREATE TABLE refund (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id  uuid        NOT NULL REFERENCES transaction(id) ON DELETE RESTRICT,
  issued_by       uuid        NOT NULL REFERENCES user_profile(user_id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Req 7.10: Only one refund allowed per transaction
  CONSTRAINT uq_refund_transaction UNIQUE (transaction_id)
);

-- =============================================================================
-- Table: stock_receiving
-- Req 6.6: Record of stock received with supplier and price info
-- =============================================================================

CREATE TABLE stock_receiving (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       uuid          NOT NULL REFERENCES outlet(id) ON DELETE RESTRICT,
  raw_material_id uuid          NOT NULL REFERENCES raw_material(id) ON DELETE RESTRICT,
  quantity        numeric(10,2) NOT NULL CHECK (quantity >= 0 AND quantity <= 999999.99),
  supplier        text          CHECK (supplier IS NULL OR char_length(supplier) BETWEEN 1 AND 100),
  unit_price      numeric(10,2) CHECK (unit_price IS NULL OR (unit_price >= 0 AND unit_price <= 1000000)),
  received_by     uuid          NOT NULL REFERENCES user_profile(user_id) ON DELETE RESTRICT,
  received_at     timestamptz   NOT NULL DEFAULT now()
);

-- =============================================================================
-- Table: stock_opname
-- Req 6.7: Stock adjustment with computed diff
-- =============================================================================

CREATE TABLE stock_opname (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       uuid          NOT NULL REFERENCES outlet(id) ON DELETE RESTRICT,
  raw_material_id uuid          NOT NULL REFERENCES raw_material(id) ON DELETE RESTRICT,
  qty_before      numeric(10,2) NOT NULL,
  qty_after       numeric(10,2) NOT NULL CHECK (qty_after >= 0 AND qty_after <= 999999.99),
  diff            numeric(10,2) NOT NULL GENERATED ALWAYS AS (qty_after - qty_before) STORED,
  reason          text          NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  user_id         uuid          NOT NULL REFERENCES user_profile(user_id) ON DELETE RESTRICT,
  created_at      timestamptz   NOT NULL DEFAULT now()
);

-- =============================================================================
-- Table: audit_log (insert-only)
-- Req 14.2: Immutable audit trail; no UPDATE or DELETE allowed
-- =============================================================================

CREATE TABLE audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid        NOT NULL REFERENCES organization(id) ON DELETE RESTRICT,
  user_id         uuid        NOT NULL,
  role            text        NOT NULL,
  outlet_id       uuid,
  action_type     text        NOT NULL,
  entity          text        NOT NULL,
  entity_id       uuid,
  value_before    text        CHECK (value_before IS NULL OR char_length(value_before) <= 2000),
  value_after     text        CHECK (value_after IS NULL OR char_length(value_after) <= 2000),
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- Rules: Prevent UPDATE and DELETE on audit_log (insert-only)
-- =============================================================================

CREATE RULE audit_log_no_update AS ON UPDATE TO audit_log DO INSTEAD NOTHING;
CREATE RULE audit_log_no_delete AS ON DELETE TO audit_log DO INSTEAD NOTHING;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Transaction indexes
CREATE INDEX idx_transaction_outlet_id ON transaction(outlet_id);
CREATE INDEX idx_transaction_created_at_desc ON transaction(created_at DESC);
CREATE INDEX idx_transaction_cashier_user_id ON transaction(cashier_user_id);

-- Transaction line index for top-N menu item queries (Req 9.6)
-- Supports aggregation of sales by menu_item_id joined with transaction.created_at
CREATE INDEX idx_transaction_line_menu_item_id ON transaction_line(menu_item_id);
CREATE INDEX idx_transaction_line_transaction_id ON transaction_line(transaction_id);

-- Refund indexes
CREATE INDEX idx_refund_transaction_id ON refund(transaction_id);

-- Stock receiving indexes
CREATE INDEX idx_stock_receiving_outlet_id ON stock_receiving(outlet_id);
CREATE INDEX idx_stock_receiving_raw_material_id ON stock_receiving(raw_material_id);

-- Stock opname indexes
CREATE INDEX idx_stock_opname_outlet_id ON stock_opname(outlet_id);
CREATE INDEX idx_stock_opname_raw_material_id ON stock_opname(raw_material_id);

-- Audit log indexes
CREATE INDEX idx_audit_log_organization_id ON audit_log(organization_id);
CREATE INDEX idx_audit_log_created_at_desc ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_entity ON audit_log(entity, entity_id);
