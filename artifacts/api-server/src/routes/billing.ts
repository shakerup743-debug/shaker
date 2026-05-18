import { Router, type Request, type Response } from "express";
import type Stripe from "stripe";
import { db, tenantsTable, branchesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { count } from "drizzle-orm";
import { getStripe, PLAN_CONFIGS, PLAN_TIER, isValidPlan, type SubscriptionPlan } from "../lib/stripe.js";

const router = Router();

/* ── GET /api/billing/status ─────────────────────────────────────────── */

router.get("/billing/status", async (req, res) => {
  const tenantId = req.tenantId!;

  const [tenant] = await db
    .select({
      subscriptionPlan: tenantsTable.subscriptionPlan,
      subscriptionStatus: tenantsTable.subscriptionStatus,
      subscriptionExpiresAt: tenantsTable.subscriptionExpiresAt,
      stripeCustomerId: tenantsTable.stripeCustomerId,
      stripeSubscriptionId: tenantsTable.stripeSubscriptionId,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [branchRow] = await db
    .select({ total: count() })
    .from(branchesTable)
    .where(eq(branchesTable.tenantId, tenantId));

  const [userRow] = await db
    .select({ total: count() })
    .from(usersTable)
    .where(eq(usersTable.tenantId, tenantId));

  const plan = (tenant.subscriptionPlan ?? "starter") as SubscriptionPlan;
  const cfg = PLAN_CONFIGS[plan] ?? PLAN_CONFIGS.starter;

  res.json({
    plan,
    status: tenant.subscriptionStatus ?? "active",
    expiresAt: tenant.subscriptionExpiresAt ?? null,
    stripeCustomerId: tenant.stripeCustomerId ?? null,
    stripeSubscriptionId: tenant.stripeSubscriptionId ?? null,
    usage: {
      branches: {
        used: branchRow?.total ?? 0,
        max: cfg.maxBranches === Infinity ? null : cfg.maxBranches,
      },
      users: {
        used: userRow?.total ?? 0,
        max: cfg.maxUsers === Infinity ? null : cfg.maxUsers,
      },
    },
  });
});

/* ── POST /api/billing/checkout ──────────────────────────────────────── */

router.post("/billing/checkout", async (req, res) => {
  const tenantId = req.tenantId!;
  const { plan } = req.body as { plan?: string };

  if (!plan || !isValidPlan(plan)) {
    res.status(400).json({ error: "Invalid plan. Must be starter, pro, or enterprise." });
    return;
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    res.status(503).json({ error: "Stripe is not configured. Please set STRIPE_SECRET_KEY." });
    return;
  }

  const [tenant] = await db
    .select({
      name: tenantsTable.name,
      stripeCustomerId: tenantsTable.stripeCustomerId,
      stripeSubscriptionId: tenantsTable.stripeSubscriptionId,
      subscriptionPlan: tenantsTable.subscriptionPlan,
      subscriptionStatus: tenantsTable.subscriptionStatus,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const origin =
    (req.headers.origin as string) ||
    `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost"}`;

  // If tenant already has an active subscription, route upgrades/downgrades
  // through the Billing Portal to avoid duplicate subscriptions and double billing.
  if (tenant.stripeSubscriptionId && tenant.subscriptionStatus === "active") {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripeCustomerId!,
      return_url: `${origin}/billing`,
    });
    res.json({ url: portalSession.url });
    return;
  }

  let customerId = tenant.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: tenant.name,
      metadata: { tenantId: String(tenantId) },
    });
    customerId = customer.id;
    await db
      .update(tenantsTable)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(tenantsTable.id, tenantId));
  }

  const cfg = PLAN_CONFIGS[plan];
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    client_reference_id: String(tenantId),
    mode: "subscription",
    line_items: [{ price_data: cfg.priceData, quantity: 1 }],
    success_url: `${origin}/billing?success=1`,
    cancel_url: `${origin}/billing`,
    metadata: { tenantId: String(tenantId), plan },
    subscription_data: { metadata: { tenantId: String(tenantId), plan } },
  });

  res.json({ url: session.url });
});

/* ── POST /api/billing/portal ────────────────────────────────────────── */

router.post("/billing/portal", async (req, res) => {
  const tenantId = req.tenantId!;

  const [tenant] = await db
    .select({ stripeCustomerId: tenantsTable.stripeCustomerId })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  if (!tenant?.stripeCustomerId) {
    res.status(400).json({
      error: "No Stripe subscription found. Please subscribe first.",
    });
    return;
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    res.status(503).json({ error: "Stripe is not configured. Please set STRIPE_SECRET_KEY." });
    return;
  }

  const origin =
    (req.headers.origin as string) ||
    `https://${process.env.REPLIT_DOMAINS?.split(",")[0] ?? "localhost"}`;

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.stripeCustomerId,
    return_url: `${origin}/billing`,
  });

  res.json({ url: session.url });
});

export default router;

/* ── Stripe Webhook Handler (mounted in app.ts with express.raw()) ───── */
// Exported separately because it must use express.raw() body parsing,
// which must be registered BEFORE express.json() in app.ts.

export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const sig = req.headers["stripe-signature"] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    req.log?.warn("STRIPE_WEBHOOK_SECRET is not configured — rejecting webhook");
    res.status(500).json({ error: "Webhook secret not configured" });
    return;
  }

  let stripe;
  try {
    stripe = getStripe();
  } catch {
    res.status(503).json({ error: "Stripe is not configured" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
  } catch {
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  req.log?.info({ type: event.type }, "stripe webhook received");

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.client_reference_id
          ? parseInt(session.client_reference_id, 10)
          : null;
        const plan = session.metadata?.plan;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;
        const customerId =
          typeof session.customer === "string" ? session.customer : null;

        if (tenantId && plan && isValidPlan(plan)) {
          await db
            .update(tenantsTable)
            .set({
              subscriptionPlan: plan,
              subscriptionStatus: "active",
              stripeSubscriptionId: subscriptionId,
              stripeCustomerId: customerId ?? undefined,
              updatedAt: new Date(),
            })
            .where(eq(tenantsTable.id, tenantId));
        }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;

        if (!customerId) break;

        const [tenant] = await db
          .select({ id: tenantsTable.id, subscriptionPlan: tenantsTable.subscriptionPlan })
          .from(tenantsTable)
          .where(eq(tenantsTable.stripeCustomerId, customerId));

        if (!tenant) break;

        // Resolve plan authoritatively from the subscription item's product metadata.
        // This covers portal-driven upgrades/downgrades where sub.metadata.plan
        // may be stale. Falls back to sub.metadata.plan, then keeps existing plan.
        let resolvedPlan: SubscriptionPlan = tenant.subscriptionPlan as SubscriptionPlan;
        const firstItem = sub.items.data[0];
        if (firstItem) {
          const priceObj = firstItem.price;
          // product may already be expanded (object) or just an ID (string)
          let productPlan: string | undefined;
          if (typeof priceObj.product === "object" && priceObj.product !== null) {
            productPlan = (priceObj.product as { metadata?: { plan?: string } }).metadata?.plan;
          } else if (typeof priceObj.product === "string") {
            // fetch product to get its metadata
            try {
              const product = await stripe.products.retrieve(priceObj.product);
              productPlan = product.metadata?.plan;
            } catch {
              // non-fatal: fall through to metadata fallback
            }
          }
          const planFromMetadata = sub.metadata?.plan;
          const candidate = productPlan ?? planFromMetadata;
          if (candidate && isValidPlan(candidate)) {
            resolvedPlan = candidate;
          }
        } else {
          // No items: use sub-level metadata if available
          const planFromMetadata = sub.metadata?.plan;
          if (planFromMetadata && isValidPlan(planFromMetadata)) {
            resolvedPlan = planFromMetadata;
          }
        }

        const status: string =
          sub.status === "active"
            ? "active"
            : sub.status === "trialing"
              ? "trial"
              : "suspended";

        // current_period_end lives on each SubscriptionItem in Stripe v22+
        const periodEndTs = firstItem?.current_period_end;
        const expiresAt = periodEndTs ? new Date(periodEndTs * 1000) : null;

        await db
          .update(tenantsTable)
          .set({
            subscriptionPlan: resolvedPlan,
            subscriptionStatus: status,
            ...(expiresAt ? { subscriptionExpiresAt: expiresAt } : {}),
            updatedAt: new Date(),
          })
          .where(eq(tenantsTable.id, tenant.id));

        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId =
          typeof sub.customer === "string" ? sub.customer : null;

        if (!customerId) break;

        const [tenant] = await db
          .select({ id: tenantsTable.id })
          .from(tenantsTable)
          .where(eq(tenantsTable.stripeCustomerId, customerId));

        if (tenant) {
          await db
            .update(tenantsTable)
            .set({
              subscriptionPlan: "starter",
              subscriptionStatus: "expired",
              stripeSubscriptionId: null,
              updatedAt: new Date(),
            })
            .where(eq(tenantsTable.id, tenant.id));
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    req.log?.error(err, "stripe webhook processing error");
    res.status(500).json({ error: "Webhook processing failed" });
    return;
  }

  res.json({ received: true });
}

export { PLAN_CONFIGS, PLAN_TIER };
