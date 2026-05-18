-- ============================================================
-- Master Password System + Permission Gates
-- Idempotent — safe to run multiple times
-- ============================================================

-- Master Passwords (one per tenant)
CREATE TABLE IF NOT EXISTS master_passwords (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      INTEGER NOT NULL,
  last_changed_at TIMESTAMPTZ,
  changed_by      INTEGER,
  last_used_at    TIMESTAMPTZ,
  usage_count     INTEGER NOT NULL DEFAULT 0,
  backup_codes    JSONB,
  backup_codes_used JSONB
);

CREATE INDEX IF NOT EXISTS idx_master_passwords_tenant ON master_passwords(tenant_id);

-- Protected Operations catalog (global, not tenant-scoped)
CREATE TABLE IF NOT EXISTS protected_operations (
  id                 SERIAL PRIMARY KEY,
  operation_key      TEXT NOT NULL UNIQUE,
  operation_name_en  TEXT NOT NULL,
  operation_name_ar  TEXT NOT NULL,
  description        TEXT,
  requires_password  BOOLEAN NOT NULL DEFAULT TRUE,
  is_enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  risk_level         TEXT NOT NULL DEFAULT 'high',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Per-tenant operation logs
CREATE TABLE IF NOT EXISTS protected_operation_logs (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL,
  operation_key     TEXT NOT NULL,
  user_id           INTEGER NOT NULL,
  password_verified BOOLEAN,
  ip_address        TEXT,
  action_details    TEXT,
  result            TEXT NOT NULL,
  error_message     TEXT,
  timestamp         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protected_op_logs_tenant
  ON protected_operation_logs(tenant_id, timestamp DESC);

-- ── Seed default protected operations (idempotent) ──────────
INSERT INTO protected_operations
  (operation_key, operation_name_en, operation_name_ar, risk_level, requires_password)
VALUES
  ('delete_order',        'Delete Order',          'حذف طلب',              'critical', TRUE),
  ('edit_product_price',  'Edit Product Price',    'تعديل سعر منتج',       'critical', TRUE),
  ('delete_product',      'Delete Product',        'حذف منتج',             'high',     TRUE),
  ('delete_staff',        'Delete Staff',          'حذف موظف',             'critical', TRUE),
  ('edit_staff_role',     'Edit Staff Role',       'تعديل دور موظف',       'high',     TRUE),
  ('reset_staff_pin',     'Reset Staff PIN',       'إعادة تعيين PIN موظف', 'high',     TRUE),
  ('apply_discount',      'Apply Discount',        'تطبيق خصم',            'medium',   FALSE),
  ('export_reports',      'Export Reports',        'تصدير التقارير',       'high',     TRUE),
  ('edit_settings',       'Edit Settings',         'تعديل الإعدادات',      'critical', TRUE),
  ('delete_category',     'Delete Category',       'حذف فئة',              'medium',   FALSE),
  ('adjust_inventory',    'Adjust Inventory',      'تعديل المخزون',        'medium',   FALSE),
  ('void_transaction',    'Void Transaction',      'إلغاء معاملة',         'critical', TRUE)
ON CONFLICT (operation_key) DO NOTHING;
