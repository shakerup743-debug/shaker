-- ============================================================
-- Migration: Add Stripe billing columns to tenants table
-- ============================================================
-- Idempotent: safe to re-run. Each step is guarded by IF NOT EXISTS.
--
-- Column mapping (schema name → DB column → purpose):
--   stripeCustomerId        → stripe_customer_id        → Stripe customer object ID
--   stripeSubscriptionId    → stripe_subscription_id    → Stripe subscription object ID
--   subscriptionPlan        → subscription_plan         → plan tier: starter|pro|enterprise
--   subscriptionStatus      → subscription_status       → active|trial|expired|suspended
--   subscriptionExpiresAt   → subscription_expires_at   → current billing period end (plan_expires_at)
--
-- NOTE: subscription_plan, subscription_status, and subscription_expires_at already
-- exist from the initial schema migration. Only the two Stripe-specific columns need
-- to be added here.
--
-- Usage:
--   psql "$DATABASE_URL" -f lib/db/src/migrations/add-stripe-columns-to-tenants.sql
-- ============================================================

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
