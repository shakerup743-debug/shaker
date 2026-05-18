-- Cashier Session & PIN System — idempotent DDL
-- Run once per environment: psql "$DATABASE_URL" -f lib/db/src/migrations/cashier-system.sql

-- 1. PIN column on users (hashed 6-digit PIN for cashier quick login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin TEXT;

-- 2. Cashier shifts table
CREATE TABLE IF NOT EXISTS cashier_shifts (
  id                  SERIAL PRIMARY KEY,
  tenant_id           INTEGER NOT NULL,
  user_id             INTEGER NOT NULL,
  user_name           TEXT NOT NULL,
  user_role           TEXT NOT NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at            TIMESTAMPTZ,
  order_count         INTEGER NOT NULL DEFAULT 0,
  total_sales         NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_returns       NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_discounts     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_cancellations INTEGER NOT NULL DEFAULT 0,
  is_closed           BOOLEAN NOT NULL DEFAULT FALSE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cashier_shifts_tenant  ON cashier_shifts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_user    ON cashier_shifts(user_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_active  ON cashier_shifts(tenant_id, is_closed) WHERE is_closed = FALSE;
