-- ============================================================
-- Create limited-privilege application role: foodoro_app
--
-- This role is subject to RLS policies (unlike the postgres
-- superuser).  requireTenant middleware does SET ROLE foodoro_app
-- after acquiring the pg.PoolClient so that every route query
-- runs under this role and is filtered by RLS.
--
-- Run once per environment:
--   psql "$DATABASE_URL" -f lib/db/src/migrations/create-app-role.sql
-- ============================================================

-- 1. Create the role (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'foodoro_app') THEN
    CREATE ROLE foodoro_app NOINHERIT NOLOGIN;
  END IF;
END
$$;

-- 2. Grant full DML on all existing tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO foodoro_app;

-- 3. Grant sequence usage (needed for SERIAL PKs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO foodoro_app;

-- 4. Future tables/sequences created by postgres will also be accessible
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO foodoro_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO foodoro_app;

-- 5. Allow postgres to SET ROLE foodoro_app
GRANT foodoro_app TO postgres;

-- Verify
SELECT rolname, rolinherit, rolcanlogin
FROM pg_roles
WHERE rolname = 'foodoro_app';
