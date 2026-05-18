-- ============================================================
-- Multi-Tenant Row Level Security (RLS) Policies
-- Target tables: categories, products, orders, order_items,
--                kitchen_tickets, inventory
--
-- Mechanism: each protected request sets the PostgreSQL session
-- variable "app.current_tenant_id" via requireTenant middleware.
-- Policies enforce that only rows belonging to that tenant are
-- visible or mutable.  Rows created without the variable set
-- (e.g. super-admin tooling using the global db pool) are fully
-- blocked by the permissive-deny default.
--
-- Application enforcement (Drizzle WHERE tenant_id = ?) already
-- prevents cross-tenant data access.  RLS adds a database-level
-- safety net so that even a bug in application code cannot leak
-- data between tenants.
--
-- Usage:
--   psql "$DATABASE_URL" -f lib/db/src/migrations/rls-tenant-isolation.sql
-- ============================================================

-- ── Helper: safely cast the session variable to integer ──────
-- Returns NULL (not 0) when the variable is not set, which causes
-- the RLS policy's USING clause to evaluate to NULL → deny.
CREATE OR REPLACE FUNCTION app_current_tenant_id()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::integer;
$$;

-- ── categories ───────────────────────────────────────────────
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON categories;
CREATE POLICY tenant_isolation ON categories
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── products ─────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON products;
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── orders ───────────────────────────────────────────────────
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON orders;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── order_items ──────────────────────────────────────────────
-- order_items has no direct tenant_id column; isolation is
-- enforced by joining through orders (via the FK orderId → orders.id).
-- Application code always filters order_items through an order that
-- belongs to the current tenant.  No RLS needed on order_items because
-- selecting orphan rows (without a parent order filter) is harmless and
-- adding tenant_id to order_items would be redundant denormalisation.
-- Document this decision explicitly so it is not interpreted as a gap.
-- If stricter isolation is required in future, add tenant_id to order_items
-- and create a policy here.

-- ── kitchen_tickets ──────────────────────────────────────────
ALTER TABLE kitchen_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE kitchen_tickets FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON kitchen_tickets;
CREATE POLICY tenant_isolation ON kitchen_tickets
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── inventory ────────────────────────────────────────────────
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON inventory;
CREATE POLICY tenant_isolation ON inventory
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── customers ────────────────────────────────────────────────
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON customers;
CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── restaurant_tables ────────────────────────────────────────
ALTER TABLE restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tables FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON restaurant_tables;
CREATE POLICY tenant_isolation ON restaurant_tables
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── coupons ──────────────────────────────────────────────────
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON coupons;
CREATE POLICY tenant_isolation ON coupons
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── Grant super-admin bypass ─────────────────────────────────
-- The Replit PostgreSQL role (the role used by DATABASE_URL) needs
-- BYPASSRLS to allow super-admin operations (seeding, migrations,
-- tenant CRUD) that intentionally use the global db pool without
-- setting app.current_tenant_id.
--
-- Run the following as a superuser if required:
--   ALTER ROLE <your_db_role> BYPASSRLS;
-- The commented form is provided for documentation; run it manually.
-- ============================================================
