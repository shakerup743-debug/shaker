#!/usr/bin/env bash
# FOODPRO Bootstrap — idempotent: safe to run on every container boot.
#
# Ensures the following are installed & running:
#   1. PostgreSQL 15 with data dir at /app/pgdata (survives container restarts)
#   2. pnpm 9.15.5 globally
#   3. foodoro role + foodoro_db database + foodoro_app role + RLS policies
#   4. backend + frontend (via supervisor)
#
# Run from supervisor with priority=1 BEFORE other services.

set -e
LOG=/var/log/bootstrap.log
exec >>"$LOG" 2>&1
echo ""
echo "==== FOODPRO bootstrap @ $(date -Is) ===="

PG_VERSION=15
PG_BIN=/usr/lib/postgresql/$PG_VERSION/bin
PG_DATA=/app/pgdata
PG_LOG=/app/pgdata/postgresql.log
PG_PORT=5432

# ── 1. Install PostgreSQL if missing ───────────────────────────────────────
if [ ! -x "$PG_BIN/postgres" ]; then
  echo "[bootstrap] Installing PostgreSQL $PG_VERSION..."
  DEBIAN_FRONTEND=noninteractive apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-$PG_VERSION postgresql-client-$PG_VERSION
fi

# ── 2. Initialize data dir on /app (persistent) if empty ───────────────────
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
  echo "[bootstrap] Initializing data dir at $PG_DATA..."
  mkdir -p "$PG_DATA"
  chown -R postgres:postgres "$PG_DATA"
  chmod 700 "$PG_DATA"
  sudo -u postgres "$PG_BIN/initdb" -D "$PG_DATA" --auth-local=trust --auth-host=md5 -E UTF8 --locale=C.UTF-8
  # listen on localhost only
  echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA/postgresql.conf"
  echo "port = $PG_PORT"                >> "$PG_DATA/postgresql.conf"
  echo "unix_socket_directories = '/var/run/postgresql'" >> "$PG_DATA/postgresql.conf"
fi

# ── 3. Start PostgreSQL ────────────────────────────────────────────────────
mkdir -p /var/run/postgresql && chown postgres:postgres /var/run/postgresql
chown -R postgres:postgres "$PG_DATA"

if ! sudo -u postgres "$PG_BIN/pg_ctl" -D "$PG_DATA" status >/dev/null 2>&1; then
  echo "[bootstrap] Starting PostgreSQL..."
  sudo -u postgres "$PG_BIN/pg_ctl" -D "$PG_DATA" -l "$PG_LOG" -w start
fi

# Wait for it to accept connections
for i in 1 2 3 4 5 6 7 8 9 10; do
  if sudo -u postgres psql -tAc "SELECT 1" >/dev/null 2>&1; then break; fi
  sleep 1
done

# ── 4. Ensure foodoro user + DB ────────────────────────────────────────────
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='foodoro'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE foodoro LOGIN SUPERUSER PASSWORD 'foodoro123';"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='foodoro_db'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE foodoro_db OWNER foodoro;"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='foodoro_app'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE foodoro_app NOLOGIN;"

sudo -u postgres psql -d foodoro_db <<EOF
GRANT USAGE ON SCHEMA public TO foodoro_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO foodoro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO foodoro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO foodoro_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO foodoro_app;
EOF

# ── 5. Ensure pnpm ─────────────────────────────────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[bootstrap] Installing pnpm..."
  npm install -g pnpm@9.15.5
fi

# ── 6. Ensure psql is on PATH (symlink to /usr/local/bin) ──────────────────
ln -sf "$PG_BIN/psql" /usr/local/bin/psql

# ── 7. Apply migrations + RLS (idempotent) ─────────────────────────────────
cd /app/lib/db
DATABASE_URL="postgresql://foodoro:foodoro123@localhost:5432/foodoro_db" pnpm run push-force 2>&1 | tail -3 || true
DATABASE_URL="postgresql://foodoro:foodoro123@localhost:5432/foodoro_db" pnpm run apply-rls 2>&1 | tail -3 || true

# Apply any extra tables that aren't in the drizzle schema yet
PGPASSWORD=foodoro123 psql -U foodoro -h localhost -d foodoro_db <<'SQL'
CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'starter',
  status TEXT NOT NULL DEFAULT 'trial',
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  paddle_subscription_id TEXT,
  paddle_customer_id TEXT,
  trial_ends_at TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  pending_downgrade_plan TEXT,
  last_payment_at TIMESTAMPTZ,
  last_payment_amount NUMERIC(10,2),
  last_payment_currency TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS subs_tenant_uniq ON subscriptions(tenant_id);

CREATE TABLE IF NOT EXISTS billing_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  paddle_event_id TEXT UNIQUE,
  signature_verified BOOLEAN DEFAULT FALSE,
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  paddle_invoice_id TEXT UNIQUE,
  paddle_transaction_id TEXT,
  invoice_number TEXT,
  amount NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  plan TEXT,
  status TEXT NOT NULL DEFAULT 'paid',
  invoice_pdf_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS app_notifications (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_url TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  restaurant_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  branches_count INTEGER NOT NULL DEFAULT 1,
  plan_interested TEXT,
  source TEXT DEFAULT 'landing',
  status TEXT NOT NULL DEFAULT 'new',
  notes TEXT,
  user_agent TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS security_events (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  ip_address TEXT,
  user_id INTEGER,
  email TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  base_currency CHAR(3) NOT NULL,
  target_currency CHAR(3) NOT NULL,
  rate NUMERIC(15,6) NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (base_currency, target_currency)
);
CREATE TABLE IF NOT EXISTS discount_settings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  max_discount_percent NUMERIC(5,2) DEFAULT 100,
  max_discount_amount NUMERIC(10,2),
  max_daily_uses INTEGER DEFAULT 999,
  requires_reason BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, role)
);
CREATE TABLE IF NOT EXISTS discount_logs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id INTEGER,
  cashier_id INTEGER,
  reason TEXT NOT NULL,
  coupon_id INTEGER,
  customer_name TEXT,
  customer_phone TEXT,
  discount_type TEXT NOT NULL,
  discount_value NUMERIC(10,2) NOT NULL,
  rejected BOOLEAN DEFAULT FALSE,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS discount_logs_tenant_idx ON discount_logs(tenant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS invoice_settings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id INTEGER,
  logo_url TEXT,
  restaurant_name TEXT,
  paper_size TEXT NOT NULL DEFAULT '80mm',
  invoice_type TEXT NOT NULL DEFAULT 'sales',
  welcome_message TEXT,
  show_tax BOOLEAN DEFAULT TRUE,
  show_logo BOOLEAN DEFAULT TRUE,
  footer_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, branch_id)
);
ALTER TABLE products  ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS kitchen_ready_at TIMESTAMPTZ;
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS customer_name TEXT;
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS customer_phone TEXT;
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS general_note TEXT;
ALTER TABLE orders    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pos';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_note TEXT;
ALTER TABLE tenants    ADD COLUMN IF NOT EXISTS discounts_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE tenants    ADD COLUMN IF NOT EXISTS discount_max_percent NUMERIC(5,2) NOT NULL DEFAULT 15;
ALTER TABLE discount_logs ADD COLUMN IF NOT EXISTS discount_kind     TEXT;
ALTER TABLE discount_logs ADD COLUMN IF NOT EXISTS coupon_code       TEXT;
ALTER TABLE discount_logs ADD COLUMN IF NOT EXISTS order_subtotal    NUMERIC(10,2);
ALTER TABLE discount_logs ADD COLUMN IF NOT EXISTS order_total_after NUMERIC(10,2);
ALTER TABLE discount_logs ADD COLUMN IF NOT EXISTS cashier_name      TEXT;
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS session_started_at TIMESTAMPTZ;
ALTER TABLE qr_tokens ADD COLUMN IF NOT EXISTS session_expires_at TIMESTAMPTZ;
ALTER TABLE tenants   ADD COLUMN IF NOT EXISTS business_type TEXT;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO foodoro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO foodoro_app;
SQL

# ── 8. Ensure demo user with enterprise plan exists ────────────────────────
DEMO_COUNT=$(PGPASSWORD=foodoro123 psql -tAc "SELECT COUNT(*) FROM users WHERE email='demo@foodpro.com'" -U foodoro -h localhost -d foodoro_db 2>/dev/null || echo 0)
if [ "$DEMO_COUNT" = "0" ]; then
  echo "[bootstrap] Seeding demo user..."
  # Use a known bcrypt hash of Demo2026! (cost 10)
  # Generated via: python3 -c "import bcrypt;print(bcrypt.hashpw(b'Demo2026!', bcrypt.gensalt(10)).decode())"
  HASH='$2b$10$IXExGYfoLakSW1XNBQbQJuCiFGdrAK3TY3mqLoak8rzZGi1oSXDSG'
  PGPASSWORD=foodoro123 psql -U foodoro -h localhost -d foodoro_db <<SQL
INSERT INTO tenants (slug, name, primary_color, currency, tax_rate, country, timezone, business_type, subscription_plan, subscription_status, is_active)
VALUES ('foodpro-demo','FoodPro Demo','#E67E22','SAR','15','SA','Asia/Riyadh','مطعم تقليدي','enterprise','active', TRUE)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (email, password, name, role, tenant_id)
SELECT 'demo@foodpro.com','$HASH','Demo Owner','owner',(SELECT id FROM tenants WHERE slug='foodpro-demo')
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email='demo@foodpro.com');

INSERT INTO subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
SELECT id, 'enterprise','active', NOW(), NOW() + INTERVAL '365 days' FROM tenants WHERE slug='foodpro-demo'
ON CONFLICT (tenant_id) DO NOTHING;
SQL
fi

# Open Enterprise + demo_mode for ALL tenants (current and future).
# Investor-demo policy: every account starts on full enterprise + bypass plan gating.
PGPASSWORD=foodoro123 psql -U foodoro -h localhost -d foodoro_db <<'SQL' >/dev/null 2>&1 || true
UPDATE tenants SET subscription_plan='enterprise', subscription_status='active', demo_mode=TRUE;
INSERT INTO subscriptions (tenant_id, plan, status, current_period_start, current_period_end)
SELECT id, 'enterprise', 'active', NOW(), NOW() + INTERVAL '10 years' FROM tenants
ON CONFLICT (tenant_id) DO UPDATE SET plan='enterprise', status='active',
  current_period_end=NOW() + INTERVAL '10 years', cancel_at_period_end=FALSE, pending_downgrade_plan=NULL;
SQL

# Seed default discount caps for 10 roles (idempotent)
PGPASSWORD=foodoro123 psql -U foodoro -h localhost -d foodoro_db <<'SQL' >/dev/null 2>&1 || true
INSERT INTO discount_settings (tenant_id, role, max_discount_percent, max_discount_amount, max_daily_uses, requires_reason)
SELECT t.id, role_name, max_pct, max_amt, daily, TRUE
FROM tenants t,
(VALUES
  ('owner', 100, NULL, 9999),
  ('manager', 50, 500, 50),
  ('cashier', 10, 50, 20),
  ('waiter', 5, 20, 10),
  ('accountant', 30, 200, 30),
  ('kitchen', 0, 0, 0),
  ('bar', 0, 0, 0),
  ('inventory', 0, 0, 0),
  ('viewer', 0, 0, 0),
  ('super_admin', 100, NULL, 9999)
) AS roles(role_name, max_pct, max_amt, daily)
WHERE t.slug='foodpro-demo'
ON CONFLICT (tenant_id, role) DO NOTHING;
SQL

echo "[bootstrap] DONE @ $(date -Is)"
# Signal supervisor that bootstrap is complete — backend/frontend wait for this
touch /tmp/foodpro-bootstrap.done
exit 0
