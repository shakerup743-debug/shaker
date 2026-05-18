-- Idempotent: add completion_token column for QR-order self-service auth
ALTER TABLE orders ADD COLUMN IF NOT EXISTS completion_token text;
