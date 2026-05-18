-- ============================================================
-- Migration: Add tenant_id to core tables
-- ============================================================
-- Idempotent: safe to re-run.  Each step is guarded by
-- IF NOT EXISTS / IF EXISTS checks.
--
-- Tables: categories, products, orders, order_items,
--         kitchen_tickets, inventory
--
-- Usage:
--   psql "$DATABASE_URL" -f lib/db/src/migrations/add-tenant-id-to-core-tables.sql
-- ============================================================

-- ── categories ───────────────────────────────────────────────
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS tenant_id integer;

-- Backfill: assign existing rows to tenant 1 (the bootstrap tenant)
UPDATE categories
   SET tenant_id = 1
 WHERE tenant_id IS NULL;

ALTER TABLE categories
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE categories
  DROP CONSTRAINT IF EXISTS categories_tenant_id_fk;

ALTER TABLE categories
  ADD CONSTRAINT categories_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ── products ─────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS tenant_id integer;

UPDATE products
   SET tenant_id = 1
 WHERE tenant_id IS NULL;

ALTER TABLE products
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_tenant_id_fk;

ALTER TABLE products
  ADD CONSTRAINT products_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ── orders ───────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tenant_id integer;

UPDATE orders
   SET tenant_id = 1
 WHERE tenant_id IS NULL;

ALTER TABLE orders
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_tenant_id_fk;

ALTER TABLE orders
  ADD CONSTRAINT orders_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ── order_items ──────────────────────────────────────────────
-- order_items isolation is guaranteed by joining through orders.
-- A direct tenant_id column on order_items would be redundant denormalisation
-- at this stage; RLS on orders covers access to their items via FK.
-- Add it here if stricter future requirements emerge.

-- ── kitchen_tickets ──────────────────────────────────────────
ALTER TABLE kitchen_tickets
  ADD COLUMN IF NOT EXISTS tenant_id integer;

UPDATE kitchen_tickets
   SET tenant_id = 1
 WHERE tenant_id IS NULL;

ALTER TABLE kitchen_tickets
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE kitchen_tickets
  DROP CONSTRAINT IF EXISTS kitchen_tickets_tenant_id_fk;

ALTER TABLE kitchen_tickets
  ADD CONSTRAINT kitchen_tickets_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ── inventory ────────────────────────────────────────────────
ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS tenant_id integer;

UPDATE inventory
   SET tenant_id = 1
 WHERE tenant_id IS NULL;

ALTER TABLE inventory
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE inventory
  DROP CONSTRAINT IF EXISTS inventory_tenant_id_fk;

ALTER TABLE inventory
  ADD CONSTRAINT inventory_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- ============================================================
-- Apply after running this migration:
--   psql "$DATABASE_URL" -f lib/db/src/migrations/rls-tenant-isolation.sql
-- ============================================================
