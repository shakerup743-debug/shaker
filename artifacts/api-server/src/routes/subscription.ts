import { Router, type Request, type Response } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { PLANS, TRIAL_DAYS, type PlanId, planHasFeature, isUnlimited } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

interface SubscriptionRow {
  id: number;
  tenant_id: number;
  plan: PlanId;
  status: "trial" | "active" | "past_due" | "canceled" | "expired";
  current_period_start: Date | null;
  current_period_end: Date | null;
  paddle_subscription_id: string | null;
  trial_ends_at: Date | null;
  cancel_at_period_end: boolean;
}

async function getSubscription(tenantId: number): Promise<SubscriptionRow | null> {
  const result = await db.execute(sql`
    SELECT * FROM subscriptions WHERE tenant_id = ${tenantId} LIMIT 1
  `);
  const row = (result.rows as unknown as SubscriptionRow[])[0];
  return row ?? null;
}

async function ensureSubscription(tenantId: number): Promise<SubscriptionRow> {
  const existing = await getSubscription(tenantId);
  if (existing) return existing;
  await db.execute(sql`
    INSERT INTO subscriptions (tenant_id, plan, status, trial_ends_at)
    VALUES (${tenantId}, 'starter', 'trial', NOW() + INTERVAL '${sql.raw(String(TRIAL_DAYS))} days')
  `);
  const created = await getSubscription(tenantId);
  return created!;
}

async function countUsersAndBranches(tenantId: number): Promise<{ users: number; branches: number }> {
  const u = await db.execute(sql`SELECT COUNT(*)::int AS c FROM users WHERE tenant_id = ${tenantId}`);
  const b = await db.execute(sql`SELECT COUNT(*)::int AS c FROM branches WHERE tenant_id = ${tenantId}`);
  return {
    users:    Number((u.rows[0] as { c: number })?.c ?? 0),
    branches: Number((b.rows[0] as { c: number })?.c ?? 0),
  };
}

/** GET /api/subscription — Returns current plan, status, days left, usage. */
router.get("/subscription", authenticate, async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ error: "No tenant" });
    return;
  }
  const sub = await ensureSubscription(tenantId);
  const usage = await countUsersAndBranches(tenantId);
  const planDef = PLANS[sub.plan];

  const now = new Date();
  const trialEndsAt = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const periodEnd   = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const daysLeft = (() => {
    const target = sub.status === "trial" ? trialEndsAt : periodEnd;
    if (!target) return null;
    const ms = target.getTime() - now.getTime();
    return Math.max(0, Math.ceil(ms / 86400000));
  })();

  // Auto-expire trial
  if (sub.status === "trial" && trialEndsAt && trialEndsAt < now) {
    await db.execute(sql`
      UPDATE subscriptions SET status = 'expired', updated_at = NOW() WHERE tenant_id = ${tenantId}
    `);
    sub.status = "expired";
  }

  res.json({
    plan: sub.plan,
    status: sub.status,
    planName: planDef.name,
    planNameAr: planDef.nameAr,
    yearlyPriceUsd: planDef.yearlyPriceUsd,
    features: planDef.features,
    limits: planDef.limits,
    trialEndsAt: trialEndsAt?.toISOString() ?? null,
    currentPeriodEnd: periodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    daysLeft,
    usage: {
      branches: { used: usage.branches, max: planDef.limits.maxBranches, unlimited: isUnlimited(planDef.limits.maxBranches) },
      users:    { used: usage.users,    max: planDef.limits.maxUsers,    unlimited: isUnlimited(planDef.limits.maxUsers) },
    },
    paddleSubscriptionId: sub.paddle_subscription_id,
  });
});

/** GET /api/subscription/plans — Public list of available plans. */
router.get("/subscription/plans", async (_req: Request, res: Response): Promise<void> => {
  res.json({
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr,
      yearlyPriceUsd: p.yearlyPriceUsd,
      limits: p.limits,
      features: p.features,
      highlighted: p.highlighted ?? false,
    })),
  });
});

/**
 * POST /api/subscription/upgrade
 * Initiates an upgrade. When Paddle keys are wired up this returns a real
 * checkout URL; right now it immediately activates the plan (Mock checkout —
 * marked clearly so it's easy to find later).
 *
 * MOCKED PADDLE: replace with real Paddle.Checkout.open() flow once keys arrive.
 */
router.post("/subscription/upgrade", authenticate, authorize("owner", "admin"), async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ error: "No tenant" });
    return;
  }
  const { plan } = req.body as { plan?: PlanId };
  if (!plan || !PLANS[plan]) {
    res.status(400).json({ error: "Invalid plan" });
    return;
  }

  await ensureSubscription(tenantId);

  // MOCKED PADDLE: instant activation, 1-year period
  await db.execute(sql`
    UPDATE subscriptions
    SET plan = ${plan},
        status = 'active',
        current_period_start = NOW(),
        current_period_end = NOW() + INTERVAL '365 days',
        cancel_at_period_end = FALSE,
        updated_at = NOW()
    WHERE tenant_id = ${tenantId}
  `);

  await db.execute(sql`
    INSERT INTO billing_events (tenant_id, event_type, payload)
    VALUES (${tenantId}, 'mock_upgrade', ${JSON.stringify({ plan, source: "mock-paddle" })})
  `);

  res.json({
    ok: true,
    mocked: true,
    message: "MOCKED: Paddle keys not configured. Plan activated immediately for demo purposes.",
    plan,
  });
});

/** POST /api/subscription/cancel — schedules cancellation at period end. */
router.post("/subscription/cancel", authenticate, authorize("owner", "admin"), async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ error: "No tenant" });
    return;
  }
  await db.execute(sql`
    UPDATE subscriptions SET cancel_at_period_end = TRUE, updated_at = NOW()
    WHERE tenant_id = ${tenantId}
  `);
  await db.execute(sql`
    INSERT INTO billing_events (tenant_id, event_type, payload)
    VALUES (${tenantId}, 'cancellation_scheduled', '{}'::jsonb)
  `);
  res.json({ ok: true, message: "Will cancel at the end of the current period." });
});

/** POST /api/subscription/webhooks/paddle — Paddle webhook receiver (stub). */
router.post("/subscription/webhooks/paddle", async (req: Request, res: Response): Promise<void> => {
  // TODO: verify Paddle signature once keys arrive
  const payload = req.body as { event_type?: string; data?: { custom_data?: { tenant_id?: string } } };
  const eventType = payload.event_type ?? "unknown";
  const tenantId = Number(payload.data?.custom_data?.tenant_id ?? 0) || null;

  try {
    await db.execute(sql`
      INSERT INTO billing_events (tenant_id, event_type, payload)
      VALUES (${tenantId}, ${eventType}, ${JSON.stringify(payload)})
    `);
    logger.info({ eventType, tenantId }, "Paddle webhook received");
  } catch (err) {
    logger.error({ err }, "Failed to record Paddle webhook");
  }
  res.status(200).json({ received: true });
});

/** GET /api/subscription/events — recent billing events (admin only). */
router.get("/subscription/events", authenticate, authorize("owner", "admin"), async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(400).json({ error: "No tenant" });
    return;
  }
  const result = await db.execute(sql`
    SELECT id, event_type, payload, created_at
    FROM billing_events
    WHERE tenant_id = ${tenantId}
    ORDER BY created_at DESC
    LIMIT 50
  `);
  res.json({ events: result.rows });
});

export default router;

// ── Helper exports used by feature-gate middleware ──────────────────────────
export { getSubscription, ensureSubscription, planHasFeature };
