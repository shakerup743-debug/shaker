-- Add nullable customer_id FK to orders.
-- Idempotent: safe to run multiple times.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id integer REFERENCES customers(id) ON DELETE SET NULL;
