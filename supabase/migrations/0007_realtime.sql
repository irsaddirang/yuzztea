-- =============================================================================
-- Migration: 0007_realtime.sql
-- Description: Add tables to supabase_realtime publication for realtime sync.
--              Enables live updates for transactions, stock, and menu changes.
-- Requirements: 10.1, 10.2
-- =============================================================================

-- Add tables to the supabase_realtime publication so that Supabase Realtime
-- can broadcast INSERT/UPDATE/DELETE events to subscribed clients.
-- Tables included:
--   - transaction: new sales appear on dashboards (Req 10.1)
--   - transaction_line: line-item details for transaction updates
--   - raw_material_stock: stock quantity changes (Req 10.2)
--   - menu_item_outlet: per-outlet price/availability overrides
--   - menu_item: global menu changes

ALTER PUBLICATION supabase_realtime ADD TABLE transaction;
ALTER PUBLICATION supabase_realtime ADD TABLE transaction_line;
ALTER PUBLICATION supabase_realtime ADD TABLE raw_material_stock;
ALTER PUBLICATION supabase_realtime ADD TABLE menu_item_outlet;
ALTER PUBLICATION supabase_realtime ADD TABLE menu_item;

-- =============================================================================
-- Note on RLS and Realtime
-- =============================================================================
-- Supabase Realtime respects Row Level Security (RLS) policies when delivering
-- events to clients. Each client only receives change events for rows they are
-- authorized to access based on their JWT claims and the RLS policies defined
-- in migration 0004 (RLS policies).
--
-- On Postgres 15+, publications support row filters. However, since Supabase
-- Realtime already enforces RLS at the subscription level (filtering events
-- server-side before delivery), explicit publication row filters are not
-- required for security. The RLS policies on each table (filtering by
-- organization_id and outlet_id based on user assignments) ensure that:
--   - Owner sees events for all outlets in the organization
--   - Outlet_Manager sees events only for assigned outlets
--   - Cashier sees events only for their assigned outlet
-- =============================================================================
