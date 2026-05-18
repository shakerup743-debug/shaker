-- ============================================================
-- Migration: Add tenant_id to customers, restaurant_tables, coupons
-- ============================================================
-- Idempotent: safe to re-run. Each step is guarded by
-- IF NOT EXISTS / IF EXISTS checks.
--
-- Usage:
--   psql "$DATABASE_URL" -f lib/db/src/migrations/add-tenant-id-to-shared-tables.sql
-- ============================================================

-- ── customers ────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS tenant_id integer;

UPDATE customers
   SET tenant_id = 1
 WHERE tenant_id IS NULL;

ALTER TABLE customers
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_tenant_id_fk;

ALTER TABLE customers
  ADD CONSTRAINT customers_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Drop old global unique on phone (now we need per-tenant uniqueness)
ALTER TABLE customers
  DROP CONSTRAINT IF EXISTS customers_phone_unique;

-- Add composite unique: (tenant_id, phone)
DROP INDEX IF EXISTS customers_tenant_phone_idx;
CREATE UNIQUE INDEX customers_tenant_phone_idx
  ON customers (tenant_id, phone);

-- General tenant index for fast filtering
DROP INDEX IF EXISTS customers_tenant_idx;
CREATE INDEX customers_tenant_idx ON customers (tenant_id);

-- ── restaurant_tables ────────────────────────────────────────
ALTER TABLE restaurant_tables
  ADD COLUMN IF NOT EXISTS tenant_id integer;

UPDATE restaurant_tables
   SET tenant_id = 1
 WHERE tenant_id IS NULL;

ALTER TABLE restaurant_tables
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_tenant_id_fk;

ALTER TABLE restaurant_tables
  ADD CONSTRAINT restaurant_tables_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Drop old global unique on number
ALTER TABLE restaurant_tables
  DROP CONSTRAINT IF EXISTS restaurant_tables_number_unique;

-- Add composite unique: (tenant_id, number)
DROP INDEX IF EXISTS restaurant_tables_tenant_number_idx;
CREATE UNIQUE INDEX restaurant_tables_tenant_number_idx
  ON restaurant_tables (tenant_id, number);

DROP INDEX IF EXISTS restaurant_tables_tenant_idx;
CREATE INDEX restaurant_tables_tenant_idx ON restaurant_tables (tenant_id);

-- ── coupons ──────────────────────────────────────────────────
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS tenant_id integer;

UPDATE coupons
   SET tenant_id = 1
 WHERE tenant_id IS NULL;

ALTER TABLE coupons
  ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE coupons
  DROP CONSTRAINT IF EXISTS coupons_tenant_id_fk;

ALTER TABLE coupons
  ADD CONSTRAINT coupons_tenant_id_fk
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- Drop old global unique on code
ALTER TABLE coupons
  DROP CONSTRAINT IF EXISTS coupons_code_unique;

-- Add composite unique: (tenant_id, code)
DROP INDEX IF EXISTS coupons_tenant_code_idx;
CREATE UNIQUE INDEX coupons_tenant_code_idx
  ON coupons (tenant_id, code);

DROP INDEX IF EXISTS coupons_tenant_idx;
CREATE INDEX coupons_tenant_idx ON coupons (tenant_id);

-- ============================================================
-- Apply RLS after this migration:
--   psql "$DATABASE_URL" -f lib/db/src/migrations/rls-tenant-isolation.sql
-- ============================================================
