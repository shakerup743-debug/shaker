-- Security tables — run once per environment via executeSql or psql
-- Idempotent: uses IF NOT EXISTS throughout

CREATE TABLE IF NOT EXISTS user_sessions (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER,
  user_id          INTEGER NOT NULL,
  user_name        TEXT,
  user_role        TEXT,
  ip_address       TEXT,
  user_agent       TEXT,
  device_fingerprint TEXT,
  is_success       BOOLEAN NOT NULL DEFAULT TRUE,
  session_token_hash TEXT,
  mfa_verified     BOOLEAN NOT NULL DEFAULT FALSE,
  revoked          BOOLEAN NOT NULL DEFAULT FALSE,
  last_active_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_tenant_id ON user_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_ip_created ON user_sessions(ip_address, created_at);

CREATE TABLE IF NOT EXISTS security_events (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER,
  type        TEXT NOT NULL,
  ip_address  TEXT,
  user_id     INTEGER,
  user_name   TEXT,
  metadata    JSONB,
  severity    TEXT NOT NULL DEFAULT 'low',
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant_created ON security_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(type);

-- MFA columns on users table (idempotent)
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret_pending TEXT;
