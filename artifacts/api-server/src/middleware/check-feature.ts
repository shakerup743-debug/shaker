/**
 * Feature-gating middleware — enforces subscription plan + status on every request.
 *
 * Used as: `checkFeature("inventory")` or `checkFeature("webhooks")`.
 *
 * Rules:
 *  - status `active`  → grant if PLANS[plan].features includes feature
 *  - status `trial`   → grant if Growth-tier features (trial uses growth feature set)
 *                       AND endpoint isn't api_access/webhooks (those are real-money paid)
 *  - status `expired` / `past_due` / `canceled` → READ-ONLY mode:
 *      * GET requests allowed
 *      * POST/PUT/PATCH/DELETE → 402 Payment Required
 */
import type { Request, Response, NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { PLANS, type Feature, type PlanId, planHasFeature } from "@workspace/db";

interface SubRow {
  plan: PlanId;
  status: "trial" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_end: string | null;
}

const TRIAL_GROWTH = new Set<Feature>(PLANS.growth.features);
// Features that NEVER work on trial (real-paid only)
const TRIAL_BLOCKED = new Set<Feature>(["api_access", "webhooks"]);

async function loadSub(tenantId: number): Promise<SubRow | null> {
  const r = await db.execute(sql`
    SELECT plan, status, trial_ends_at, current_period_end
    FROM subscriptions WHERE tenant_id = ${tenantId} LIMIT 1
  `);
  return (r.rows[0] as SubRow | undefined) ?? null;
}

function isReadOnly(method: string): boolean {
  return method === "GET" || method === "HEAD" || method === "OPTIONS";
}

export function checkFeature(feature: Feature) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const tenantId = req.user?.tenantId ?? req.tenantId;
    if (!tenantId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    let sub = await loadSub(tenantId);

    // Auto-create trial subscription if missing (safe net for legacy tenants).
    if (!sub) {
      await db.execute(sql`
        INSERT INTO subscriptions (tenant_id, plan, status, trial_ends_at)
        VALUES (${tenantId}, 'starter', 'trial', NOW() + INTERVAL '14 days')
        ON CONFLICT (tenant_id) DO NOTHING
      `);
      sub = await loadSub(tenantId);
    }

    if (!sub) {
      res.status(500).json({ error: "Subscription not found" });
      return;
    }

    const now = new Date();
    const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;

    // Auto-expire trial that has passed
    if (sub.status === "trial" && trialEnd && trialEnd < now) {
      await db.execute(sql`
        UPDATE subscriptions SET status = 'expired', updated_at = NOW()
        WHERE tenant_id = ${tenantId}
      `);
      sub.status = "expired";
    }

    // ── EXPIRED / PAST DUE / CANCELED → READ-ONLY ─────────────────────────
    if (sub.status === "expired" || sub.status === "past_due" || sub.status === "canceled") {
      if (!isReadOnly(req.method)) {
        res.status(402).json({
          error: "SUBSCRIPTION_EXPIRED",
          message: "انتهى اشتراكك. النظام في وضع القراءة فقط. الرجاء تجديد الاشتراك.",
          plan: sub.plan,
          status: sub.status,
        });
        return;
      }
      // GETs are allowed in read-only mode
      next();
      return;
    }

    // ── TRIAL ─────────────────────────────────────────────────────────────
    if (sub.status === "trial") {
      if (TRIAL_BLOCKED.has(feature)) {
        res.status(402).json({
          error: "FEATURE_NOT_IN_TRIAL",
          message: `الميزة "${feature}" غير متاحة في التجربة المجانية. الرجاء الترقية.`,
          feature,
          requiredPlan: "enterprise",
        });
        return;
      }
      if (TRIAL_GROWTH.has(feature)) {
        next();
        return;
      }
      res.status(402).json({
        error: "FEATURE_NOT_AVAILABLE",
        message: `هذه الميزة غير متاحة في خطتك الحالية.`,
        feature,
      });
      return;
    }

    // ── ACTIVE ────────────────────────────────────────────────────────────
    if (sub.status === "active") {
      if (planHasFeature(sub.plan, feature)) {
        next();
        return;
      }
      res.status(402).json({
        error: "FEATURE_REQUIRES_UPGRADE",
        message: `هذه الميزة تتطلب باقة أعلى.`,
        feature,
        currentPlan: sub.plan,
      });
      return;
    }

    res.status(403).json({ error: "Subscription status unknown" });
  };
}

/**
 * Global read-only guard — apply broadly to block ANY write request from a
 * tenant whose subscription is no longer active.
 *
 * Reads (GET/HEAD/OPTIONS) always pass; writes get 402.
 */
export async function readOnlyGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (isReadOnly(req.method)) { next(); return; }
  // Subscription/billing endpoints must remain writable so users can renew.
  if (req.path.startsWith("/subscription") || req.path.startsWith("/paddle") || req.path.startsWith("/billing")) {
    next(); return;
  }
  const tenantId = req.user?.tenantId ?? req.tenantId;
  if (!tenantId) { next(); return; }

  // DEMO MODE bypass — investor demo, never locked into read-only.
  const demoCheck = await db.execute(sql`SELECT demo_mode FROM tenants WHERE id=${tenantId}`);
  if ((demoCheck.rows[0] as { demo_mode?: boolean } | undefined)?.demo_mode) { next(); return; }

  let sub = await loadSub(tenantId);
  if (!sub) { next(); return; }

  const now = new Date();
  const trialEnd = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  if (sub.status === "trial" && trialEnd && trialEnd < now) {
    await db.execute(sql`
      UPDATE subscriptions SET status='expired', updated_at = NOW() WHERE tenant_id = ${tenantId}
    `);
    sub.status = "expired";
  }

  if (sub.status === "expired" || sub.status === "canceled" || sub.status === "past_due") {
    res.status(402).json({
      error: "SUBSCRIPTION_EXPIRED",
      message: "انتهى اشتراكك. النظام في وضع القراءة فقط.",
      status: sub.status,
    });
    return;
  }
  next();
}

/** Enforce per-plan branch / user limits at the API boundary. */
export async function enforceBranchLimit(tenantId: number): Promise<{ ok: boolean; max?: number; used?: number }> {
  const sub = await loadSub(tenantId);
  if (!sub) return { ok: false };
  const planDef = PLANS[sub.plan];
  if (planDef.limits.maxBranches === -1) return { ok: true };
  const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM branches WHERE tenant_id = ${tenantId}`);
  const used = Number((r.rows[0] as { c: number })?.c ?? 0);
  return { ok: used < planDef.limits.maxBranches, max: planDef.limits.maxBranches, used };
}

export async function enforceUserLimit(tenantId: number): Promise<{ ok: boolean; max?: number; used?: number }> {
  const sub = await loadSub(tenantId);
  if (!sub) return { ok: false };
  const planDef = PLANS[sub.plan];
  // Trial uses Starter limits-but-relaxed-users (3 users per spec)
  let max = planDef.limits.maxUsers;
  if (sub.status === "trial") max = 3;
  if (max === -1) return { ok: true };
  const r = await db.execute(sql`SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = ${tenantId}`);
  const used = Number((r.rows[0] as { c: number })?.c ?? 0);
  return { ok: used < max, max, used };
}
