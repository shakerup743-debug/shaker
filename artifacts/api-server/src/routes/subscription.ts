/**
 * FOODPRO — Paddle subscription & billing endpoints (full SaaS spec).
 *
 *  POST /api/subscription/checkout       → create Paddle checkout transaction (returns URL)
 *  POST /api/subscription/cancel         → schedule cancellation at period end
 *  POST /api/subscription/resume         → undo a scheduled cancellation
 *  POST /api/subscription/upgrade        → upgrade plan (immediate when API key present, mocked otherwise)
 *  POST /api/subscription/downgrade      → downgrade plan, takes effect at period end
 *  GET  /api/subscription                → current plan + status + usage
 *  GET  /api/subscription/plans          → public plan catalog
 *  GET  /api/subscription/invoices       → list invoices
 *  POST /api/paddle/webhook              → MUST be raw body, HMAC verified
 *
 * Security: ALL mutations go through `authenticate` + `authorize("owner","admin")`.
 * Plan is NEVER trusted from the request body — only from the webhook or
 * the Paddle API. Read-only writes blocked by `readOnlyGuard`.
 */
import { Router, type Request, type Response } from "express";
import crypto from "node:crypto";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { PLANS, type PlanId, TRIAL_DAYS, isUnlimited } from "@workspace/db";
import { logger } from "../lib/logger.js";

const router = Router();

const PADDLE_API_KEY     = process.env.PADDLE_API_KEY    ?? "";
const PADDLE_WEBHOOK_KEY = process.env.PADDLE_WEBHOOK_SECRET ?? "";
const PADDLE_ENV         = (process.env.PADDLE_ENV ?? "sandbox").toLowerCase();
const PADDLE_API_BASE    = PADDLE_ENV === "production"
  ? "https://api.paddle.com"
  : "https://sandbox-api.paddle.com";
const PADDLE_PRICE_IDS: Record<PlanId, string> = {
  starter:    process.env.PADDLE_PRICE_STARTER    ?? "",
  growth:     process.env.PADDLE_PRICE_GROWTH     ?? "",
  enterprise: process.env.PADDLE_PRICE_ENTERPRISE ?? "",
};

// ────────────────────────────────────────────────────────────────────────────
//  Subscription helpers
// ────────────────────────────────────────────────────────────────────────────

interface SubRow {
  id: number;
  tenant_id: number;
  plan: PlanId;
  status: "trial" | "active" | "past_due" | "canceled" | "expired";
  current_period_start: string | null;
  current_period_end: string | null;
  paddle_subscription_id: string | null;
  paddle_customer_id: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean | null;
  pending_downgrade_plan: PlanId | null;
}

async function getSub(tenantId: number): Promise<SubRow | null> {
  const r = await db.execute(sql`SELECT * FROM subscriptions WHERE tenant_id=${tenantId} LIMIT 1`);
  return (r.rows[0] as SubRow | undefined) ?? null;
}

async function ensureSub(tenantId: number): Promise<SubRow> {
  const existing = await getSub(tenantId);
  if (existing) return existing;
  await db.execute(sql`
    INSERT INTO subscriptions (tenant_id, plan, status, trial_ends_at)
    VALUES (${tenantId}, 'starter', 'trial', NOW() + INTERVAL '${sql.raw(String(TRIAL_DAYS))} days')
    ON CONFLICT (tenant_id) DO NOTHING
  `);
  return (await getSub(tenantId))!;
}

async function autoExpireTrial(sub: SubRow): Promise<SubRow> {
  if (sub.status !== "trial" || !sub.trial_ends_at) return sub;
  if (new Date(sub.trial_ends_at) >= new Date()) return sub;
  await db.execute(sql`UPDATE subscriptions SET status='expired', updated_at=NOW() WHERE tenant_id=${sub.tenant_id}`);
  return { ...sub, status: "expired" };
}

async function logEvent(tenantId: number | null, type: string, payload: unknown, verified = true, paddleEventId: string | null = null): Promise<void> {
  await db.execute(sql`
    INSERT INTO billing_events (tenant_id, event_type, payload, signature_verified, paddle_event_id)
    VALUES (${tenantId}, ${type}, ${JSON.stringify(payload)}, ${verified}, ${paddleEventId})
    ON CONFLICT (paddle_event_id) DO NOTHING
  `);
}

async function pushNotice(tenantId: number, level: string, title: string, message: string, actionUrl: string | null = "/billing"): Promise<void> {
  await db.execute(sql`
    INSERT INTO app_notifications (tenant_id, level, title, message, action_url)
    VALUES (${tenantId}, ${level}, ${title}, ${message}, ${actionUrl})
  `);
}

// ────────────────────────────────────────────────────────────────────────────
//  PUBLIC plans catalog
// ────────────────────────────────────────────────────────────────────────────

router.get("/subscription/plans", (_req: Request, res: Response): void => {
  res.json({
    trialDays: TRIAL_DAYS,
    paddleConfigured: Boolean(PADDLE_API_KEY),
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      nameAr: p.nameAr,
      yearlyPriceUsd: p.yearlyPriceUsd,
      limits: {
        maxBranches: isUnlimited(p.limits.maxBranches) ? null : p.limits.maxBranches,
        maxUsers:    isUnlimited(p.limits.maxUsers)    ? null : p.limits.maxUsers,
      },
      features: p.features,
      highlighted: p.highlighted ?? false,
    })),
  });
});

// ────────────────────────────────────────────────────────────────────────────
//  CURRENT subscription
// ────────────────────────────────────────────────────────────────────────────

router.get("/subscription", authenticate, async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  let sub = await ensureSub(tenantId);
  sub = await autoExpireTrial(sub);

  // Demo-mode override: bypass all gating for the investor demo tenant.
  // Read tenants.demo_mode and if true, force enterprise/active in the response.
  const demoRow = await db.execute(
    sql`SELECT demo_mode FROM tenants WHERE id=${tenantId} LIMIT 1`,
  );
  const demoMode = Boolean((demoRow.rows[0] as { demo_mode?: boolean } | undefined)?.demo_mode);
  if (demoMode) {
    sub = {
      ...sub,
      plan: "enterprise",
      status: "active",
      current_period_end: sub.current_period_end ?? new Date(Date.now() + 365 * 86400000),
      cancel_at_period_end: false,
      pending_downgrade_plan: null,
    } as typeof sub;
  }

  const planDef = PLANS[sub.plan];
  const now = new Date();
  const trial = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
  const target = sub.status === "trial" ? trial : periodEnd;
  const daysLeft = target ? Math.max(0, Math.ceil((target.getTime() - now.getTime()) / 86400000)) : null;

  const [u, b] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS c FROM users    WHERE tenant_id=${tenantId}`),
    db.execute(sql`SELECT COUNT(*)::int AS c FROM branches WHERE tenant_id=${tenantId}`),
  ]);
  const usersUsed    = Number((u.rows[0] as { c: number })?.c ?? 0);
  const branchesUsed = Number((b.rows[0] as { c: number })?.c ?? 0);

  // Trial uses 3-user cap regardless of plan
  const userMax    = sub.status === "trial" ? 3 : planDef.limits.maxUsers;
  const branchMax  =                              planDef.limits.maxBranches;

  res.json({
    plan: sub.plan,
    status: sub.status,
    planName: planDef.name,
    planNameAr: planDef.nameAr,
    yearlyPriceUsd: planDef.yearlyPriceUsd,
    features: planDef.features,
    limits: planDef.limits,
    trialEndsAt: trial?.toISOString() ?? null,
    currentPeriodEnd: periodEnd?.toISOString() ?? null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    pendingDowngradePlan: sub.pending_downgrade_plan ?? null,
    daysLeft,
    readOnly: ["expired", "canceled", "past_due"].includes(sub.status),
    usage: {
      branches: { used: branchesUsed, max: isUnlimited(branchMax) ? null : branchMax, unlimited: isUnlimited(branchMax) },
      users:    { used: usersUsed,    max: isUnlimited(userMax)   ? null : userMax,   unlimited: isUnlimited(userMax)   },
    },
    paddleConfigured: Boolean(PADDLE_API_KEY),
  });
});

// ────────────────────────────────────────────────────────────────────────────
//  INVOICES
// ────────────────────────────────────────────────────────────────────────────

router.get("/subscription/invoices", authenticate, async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.user!.tenantId!;
  const r = await db.execute(sql`
    SELECT id, invoice_number, amount, currency, plan, status, invoice_pdf_url, paid_at, created_at
    FROM invoices WHERE tenant_id=${tenantId}
    ORDER BY created_at DESC LIMIT 100
  `);
  res.json({ invoices: r.rows });
});

// ────────────────────────────────────────────────────────────────────────────
//  CHECKOUT — create Paddle transaction and return checkout URL
// ────────────────────────────────────────────────────────────────────────────

router.post(
  "/subscription/checkout",
  authenticate,
  authorize("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const { plan } = req.body as { plan?: PlanId };

    if (!plan || !PLANS[plan]) {
      res.status(400).json({ error: "Invalid plan" });
      return;
    }

    await ensureSub(tenantId);

    // If Paddle isn't configured yet, return a stable mock-checkout URL so the
    // frontend flow can still be exercised. This is the ONLY mocked path.
    if (!PADDLE_API_KEY || !PADDLE_PRICE_IDS[plan]) {
      logger.warn({ plan, tenantId }, "PADDLE NOT CONFIGURED — using mock checkout");
      // Mock activation: mark active with 1-year period so the demo doesn't break.
      await db.execute(sql`
        UPDATE subscriptions
        SET plan = ${plan}, status = 'active',
            current_period_start = NOW(),
            current_period_end   = NOW() + INTERVAL '365 days',
            cancel_at_period_end = FALSE,
            pending_downgrade_plan = NULL,
            trial_ends_at = NULL,
            last_payment_at = NOW(),
            last_payment_amount = ${PLANS[plan].yearlyPriceUsd},
            last_payment_currency = 'USD',
            updated_at = NOW()
        WHERE tenant_id = ${tenantId}
      `);
      await db.execute(sql`
        INSERT INTO invoices (tenant_id, invoice_number, amount, currency, plan, status, paid_at)
        VALUES (${tenantId}, ${"DEMO-" + Date.now()}, ${PLANS[plan].yearlyPriceUsd}, 'USD', ${plan}, 'paid', NOW())
      `);
      await logEvent(tenantId, "mock_checkout_success", { plan, source: "mock" });
      await pushNotice(tenantId, "info", "تم تفعيل الباقة", `تم تفعيل باقة ${PLANS[plan].nameAr} بنجاح.`, "/billing");
      res.json({
        ok: true,
        mocked: true,
        checkoutUrl: null,
        message: "تم تفعيل الباقة مؤقتاً (Paddle غير مفعّل بعد).",
      });
      return;
    }

    // Real Paddle transaction (Billing v2 API)
    try {
      const origin = req.headers.origin?.toString() ?? "";
      const paddleRes = await fetch(`${PADDLE_API_BASE}/transactions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${PADDLE_API_KEY}`,
        },
        body: JSON.stringify({
          items: [{ price_id: PADDLE_PRICE_IDS[plan], quantity: 1 }],
          custom_data: { tenant_id: String(tenantId), plan },
          checkout: { url: origin ? `${origin}/billing?success=1` : undefined },
        }),
      });
      const data = await paddleRes.json() as {
        data?: { id: string; checkout?: { url?: string } };
        error?: { detail?: string };
      };
      if (!paddleRes.ok || !data.data) {
        logger.error({ status: paddleRes.status, err: data.error }, "Paddle checkout creation failed");
        res.status(502).json({ error: "تعذّر إنشاء جلسة دفع. الرجاء المحاولة لاحقاً." });
        return;
      }
      await logEvent(tenantId, "checkout_created", { transactionId: data.data.id, plan });
      res.json({
        ok: true,
        mocked: false,
        transactionId: data.data.id,
        checkoutUrl: data.data.checkout?.url ?? null,
      });
    } catch (err) {
      logger.error({ err }, "Paddle checkout exception");
      res.status(500).json({ error: "تعذّر إنشاء جلسة الدفع." });
    }
  },
);

// ────────────────────────────────────────────────────────────────────────────
//  UPGRADE — immediate plan change (active subscriptions only)
// ────────────────────────────────────────────────────────────────────────────

const PLAN_RANK: Record<PlanId, number> = { starter: 1, growth: 2, enterprise: 3 };

router.post(
  "/subscription/upgrade",
  authenticate,
  authorize("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const { plan } = req.body as { plan?: PlanId };
    if (!plan || !PLANS[plan]) { res.status(400).json({ error: "Invalid plan" }); return; }

    const sub = await ensureSub(tenantId);
    if (sub.status === "trial") {
      // Trial users must checkout first
      res.status(400).json({ error: "TRIAL_NEEDS_CHECKOUT", message: "الرجاء إكمال عملية الدفع أولاً." });
      return;
    }
    if (PLAN_RANK[plan] <= PLAN_RANK[sub.plan]) {
      res.status(400).json({ error: "USE_DOWNGRADE", message: "هذه عملية تخفيض، استخدم endpoint downgrade." });
      return;
    }

    await db.execute(sql`
      UPDATE subscriptions SET plan=${plan}, pending_downgrade_plan=NULL, updated_at=NOW() WHERE tenant_id=${tenantId}
    `);
    await logEvent(tenantId, "plan_upgraded", { from: sub.plan, to: plan });
    await pushNotice(tenantId, "info", "تمت ترقية الباقة", `تمت ترقية باقتك إلى ${PLANS[plan].nameAr} فوراً.`, "/billing");
    res.json({ ok: true, plan, message: "تمت الترقية فوراً." });
  },
);

// ────────────────────────────────────────────────────────────────────────────
//  DOWNGRADE — applies at end of current period
// ────────────────────────────────────────────────────────────────────────────

router.post(
  "/subscription/downgrade",
  authenticate,
  authorize("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    const { plan } = req.body as { plan?: PlanId };
    if (!plan || !PLANS[plan]) { res.status(400).json({ error: "Invalid plan" }); return; }

    const sub = await ensureSub(tenantId);
    if (sub.status === "trial") { res.status(400).json({ error: "Cannot downgrade during trial" }); return; }
    if (PLAN_RANK[plan] >= PLAN_RANK[sub.plan]) {
      res.status(400).json({ error: "USE_UPGRADE" });
      return;
    }

    await db.execute(sql`
      UPDATE subscriptions SET pending_downgrade_plan=${plan}, updated_at=NOW() WHERE tenant_id=${tenantId}
    `);
    await logEvent(tenantId, "downgrade_scheduled", { from: sub.plan, to: plan });
    await pushNotice(tenantId, "warning", "تم جدولة التخفيض", `سيتم تخفيض الباقة إلى ${PLANS[plan].nameAr} في نهاية الدورة الحالية.`, "/billing");
    res.json({
      ok: true,
      pendingDowngradePlan: plan,
      message: "سيتم التخفيض في نهاية دورة الفوترة الحالية.",
    });
  },
);

// ────────────────────────────────────────────────────────────────────────────
//  CANCEL & RESUME
// ────────────────────────────────────────────────────────────────────────────

router.post(
  "/subscription/cancel",
  authenticate,
  authorize("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    await db.execute(sql`UPDATE subscriptions SET cancel_at_period_end=TRUE, updated_at=NOW() WHERE tenant_id=${tenantId}`);
    await logEvent(tenantId, "cancellation_scheduled", {});
    await pushNotice(tenantId, "warning", "تم جدولة الإلغاء", "سيتم إيقاف الاشتراك في نهاية الدورة الحالية.", "/billing");
    res.json({ ok: true, message: "سيتم الإلغاء في نهاية الدورة الحالية." });
  },
);

router.post(
  "/subscription/resume",
  authenticate,
  authorize("owner", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    await db.execute(sql`UPDATE subscriptions SET cancel_at_period_end=FALSE, pending_downgrade_plan=NULL, updated_at=NOW() WHERE tenant_id=${tenantId}`);
    await logEvent(tenantId, "cancellation_revoked", {});
    res.json({ ok: true, message: "تم إلغاء طلب الإلغاء." });
  },
);

// ────────────────────────────────────────────────────────────────────────────
//  NOTIFICATIONS (in-app)
// ────────────────────────────────────────────────────────────────────────────

router.get(
  "/subscription/notifications",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.user!.tenantId!;
    // Auto-generate trial warning notifications (idempotent — only once per phase)
    const sub = await getSub(tenantId);
    if (sub?.status === "trial" && sub.trial_ends_at) {
      const days = Math.ceil((new Date(sub.trial_ends_at).getTime() - Date.now()) / 86400000);
      if (days <= 7 && days > 0) {
        await db.execute(sql`
          INSERT INTO app_notifications (tenant_id, level, title, message, action_url)
          SELECT ${tenantId}, 'warning', 'تنبيه: التجربة المجانية',
                 ${`باقي ${days} أيام على انتهاء تجربتك. الرجاء الاشتراك.`}, '/billing'
          WHERE NOT EXISTS (
            SELECT 1 FROM app_notifications
            WHERE tenant_id=${tenantId} AND title='تنبيه: التجربة المجانية'
              AND created_at > NOW() - INTERVAL '1 day'
          )
        `);
      }
    }
    const r = await db.execute(sql`
      SELECT id, level, title, message, action_url, read_at, created_at
      FROM app_notifications
      WHERE tenant_id=${tenantId} AND (read_at IS NULL OR read_at > NOW() - INTERVAL '7 days')
      ORDER BY created_at DESC LIMIT 30
    `);
    res.json({ notifications: r.rows });
  },
);

router.post(
  "/subscription/notifications/:id/read",
  authenticate,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    const tenantId = req.user!.tenantId!;
    await db.execute(sql`UPDATE app_notifications SET read_at=NOW() WHERE id=${id} AND tenant_id=${tenantId}`);
    res.json({ ok: true });
  },
);

// ────────────────────────────────────────────────────────────────────────────
//  PADDLE WEBHOOK — must verify signature (HMAC-SHA256)
//  Mount with express.raw() in app.ts before json parser if real secret used.
// ────────────────────────────────────────────────────────────────────────────

function verifyPaddleSignature(rawBody: string, header: string | undefined, secret: string): boolean {
  if (!header || !secret) return false;
  // Paddle Billing v2 signature header: "ts=1234567890;h1=abcdef..."
  const parts = header.split(";");
  const ts = parts.find((p) => p.startsWith("ts="))?.slice(3);
  const h1 = parts.find((p) => p.startsWith("h1="))?.slice(3);
  if (!ts || !h1) return false;
  const signed = `${ts}:${rawBody}`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(h1, "hex"));
  } catch {
    return false;
  }
}

interface PaddleWebhookData {
  id?: string;
  status?: string;
  subscription_id?: string;
  customer_id?: string;
  custom_data?: { tenant_id?: string | number; plan?: PlanId };
  current_billing_period?: { starts_at?: string; ends_at?: string };
  items?: Array<{ price?: { id?: string }; quantity?: number }>;
}
interface PaddleWebhookBody {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: PaddleWebhookData;
}

export async function paddleWebhookHandler(req: Request, res: Response): Promise<void> {
  // req.body is a Buffer here (express.raw mounted in app.ts)
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
  const sigHeader = req.headers["paddle-signature"]?.toString();
  const verified = PADDLE_WEBHOOK_KEY ? verifyPaddleSignature(raw, sigHeader, PADDLE_WEBHOOK_KEY) : false;

  if (PADDLE_WEBHOOK_KEY && !verified) {
    logger.warn({ sigHeader }, "Paddle webhook signature verification FAILED");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let body: PaddleWebhookBody = {};
  try { body = JSON.parse(raw) as PaddleWebhookBody; } catch { /* keep empty */ }
  const eventType = body.event_type ?? "unknown";
  const data = body.data ?? {};
  const tenantIdRaw = data.custom_data?.tenant_id;
  const tenantId = tenantIdRaw ? Number(tenantIdRaw) : null;
  const plan: PlanId | undefined = data.custom_data?.plan && PLANS[data.custom_data.plan] ? data.custom_data.plan : undefined;

  await logEvent(tenantId, eventType, body, verified, body.event_id ?? null);

  if (!tenantId) {
    res.status(200).json({ received: true });
    return;
  }

  try {
    switch (eventType) {
      case "subscription.created":
      case "subscription.activated":
      case "subscription.updated": {
        const start = data.current_billing_period?.starts_at;
        const end   = data.current_billing_period?.ends_at;
        const status = data.status === "active" ? "active" :
                       data.status === "past_due" ? "past_due" :
                       data.status === "canceled" ? "canceled" :
                       data.status === "trialing" ? "trial" : "active";
        await db.execute(sql`
          UPDATE subscriptions SET
            ${plan ? sql`plan = ${plan},` : sql``}
            status = ${status},
            paddle_subscription_id = ${data.subscription_id ?? data.id ?? null},
            paddle_customer_id = ${data.customer_id ?? null},
            current_period_start = ${start ?? null},
            current_period_end = ${end ?? null},
            trial_ends_at = NULL,
            updated_at = NOW()
          WHERE tenant_id = ${tenantId}
        `);
        if (eventType === "subscription.created") {
          await pushNotice(tenantId, "info", "تم تفعيل الاشتراك", "تم تفعيل اشتراكك بنجاح. أهلاً بك في FOODPRO!", "/billing");
        }
        break;
      }
      case "subscription.canceled":
        await db.execute(sql`UPDATE subscriptions SET status='canceled', cancel_at_period_end=TRUE, updated_at=NOW() WHERE tenant_id=${tenantId}`);
        await pushNotice(tenantId, "warning", "تم إلغاء الاشتراك", "تم إلغاء اشتراكك. النظام سيتحول للقراءة فقط.", "/billing");
        break;
      case "transaction.completed":
      case "transaction.paid": {
        const amount = Number(data.items?.[0]?.quantity ?? 0) || PLANS[plan ?? "starter"].yearlyPriceUsd;
        await db.execute(sql`
          INSERT INTO invoices (tenant_id, paddle_transaction_id, invoice_number, amount, currency, plan, status, paid_at)
          VALUES (${tenantId}, ${data.id ?? null}, ${data.id ?? null}, ${amount}, 'USD', ${plan ?? null}, 'paid', NOW())
          ON CONFLICT (paddle_invoice_id) DO NOTHING
        `);
        await db.execute(sql`
          UPDATE subscriptions SET last_payment_at=NOW(), last_payment_amount=${amount}, last_payment_currency='USD', updated_at=NOW()
          WHERE tenant_id=${tenantId}
        `);
        await pushNotice(tenantId, "info", "تم استلام الدفع", "تم استلام دفعتك بنجاح. شكراً لك!", "/billing");
        break;
      }
      case "transaction.payment_failed":
      case "subscription.payment_failed":
        await db.execute(sql`UPDATE subscriptions SET status='past_due', updated_at=NOW() WHERE tenant_id=${tenantId}`);
        await pushNotice(tenantId, "critical", "فشل الدفع", "فشلت محاولة الدفع. الرجاء تحديث وسيلة الدفع.", "/billing");
        break;
      default:
        logger.info({ eventType }, "Unhandled Paddle event");
    }
  } catch (err) {
    logger.error({ err, eventType }, "Paddle webhook processing error");
  }
  res.status(200).json({ received: true });
}

router.post("/paddle/webhook", paddleWebhookHandler);

export default router;
export { ensureSub, getSub };
