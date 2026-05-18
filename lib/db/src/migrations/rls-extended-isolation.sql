-- ============================================================
-- Extended Multi-Tenant Row Level Security (RLS) — Phase 2
-- Covers: audit_logs, branches, cashier_shifts, master_passwords,
--         order_amendments, product_availability_log,
--         protected_operation_logs, user_sessions, waste_logs,
--         webhooks
--
-- Deliberately EXCLUDED (require cross-tenant lookup in middleware):
--   users              — authenticate.ts resolves users by clerk_id
--                        before tenant context exists
--   security_events    — brute-force detection queries by IP across tenants
--   api_keys           — verified by key value before tenant context
--   qr_tokens          — verified cross-tenant for table QR scanning
--
-- Run once:
--   psql "$DATABASE_URL" -f lib/db/src/migrations/rls-extended-isolation.sql
-- ============================================================

-- ── Helper is already created in rls-tenant-isolation.sql ────
-- Recreate it idempotently in case this file is run independently
CREATE OR REPLACE FUNCTION app_current_tenant_id()
  RETURNS integer
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
AS $$
  SELECT NULLIF(
    current_setting('app.current_tenant_id', true),
    ''
  )::integer
$$;

-- ── audit_logs ────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── branches ──────────────────────────────────────────────────
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS branches_tenant_isolation ON branches;
CREATE POLICY branches_tenant_isolation ON branches
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── cashier_shifts ────────────────────────────────────────────
ALTER TABLE cashier_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cashier_shifts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cashier_shifts_tenant_isolation ON cashier_shifts;
CREATE POLICY cashier_shifts_tenant_isolation ON cashier_shifts
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── master_passwords ──────────────────────────────────────────
ALTER TABLE master_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_passwords FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS master_passwords_tenant_isolation ON master_passwords;
CREATE POLICY master_passwords_tenant_isolation ON master_passwords
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── order_amendments ─────────────────────────────────────────
ALTER TABLE order_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_amendments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS order_amendments_tenant_isolation ON order_amendments;
CREATE POLICY order_amendments_tenant_isolation ON order_amendments
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── product_availability_log ──────────────────────────────────
ALTER TABLE product_availability_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_availability_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS product_availability_log_tenant_isolation ON product_availability_log;
CREATE POLICY product_availability_log_tenant_isolation ON product_availability_log
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── protected_operation_logs ──────────────────────────────────
ALTER TABLE protected_operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE protected_operation_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS protected_operation_logs_tenant_isolation ON protected_operation_logs;
CREATE POLICY protected_operation_logs_tenant_isolation ON protected_operation_logs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── user_sessions ─────────────────────────────────────────────
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_sessions_tenant_isolation ON user_sessions;
CREATE POLICY user_sessions_tenant_isolation ON user_sessions
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── waste_logs ────────────────────────────────────────────────
ALTER TABLE waste_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE waste_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS waste_logs_tenant_isolation ON waste_logs;
CREATE POLICY waste_logs_tenant_isolation ON waste_logs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── webhooks ──────────────────────────────────────────────────
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS webhooks_tenant_isolation ON webhooks;
CREATE POLICY webhooks_tenant_isolation ON webhooks
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- ── Verify ───────────────────────────────────────────────────
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'audit_logs','branches','cashier_shifts','master_passwords',
    'order_amendments','product_availability_log',
    'protected_operation_logs','user_sessions','waste_logs','webhooks'
  )
ORDER BY tablename;
