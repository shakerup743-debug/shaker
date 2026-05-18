import { type Request, type Response, type NextFunction } from "express";
import { db, tenantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { PLAN_TIER, type SubscriptionPlan } from "../lib/stripe.js";

/**
 * Gate a route behind a minimum subscription plan.
 *
 * Usage:
 *   router.get("/advanced-analytics", requirePlan("pro"), handler);
 *
 * Plan tiers: starter (1) < pro (2) < enterprise (3)
 * Returns 403 if the tenant's current plan is below the required tier.
 */
export function requirePlan(minPlan: SubscriptionPlan) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const tenantId = req.tenantId;
    if (!tenantId) {
      res.status(403).json({ error: "No tenant context" });
      return;
    }

    const [tenant] = await db
      .select({ subscriptionPlan: tenantsTable.subscriptionPlan })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    const plan = (tenant?.subscriptionPlan ?? "starter") as SubscriptionPlan;
    const currentTier = PLAN_TIER[plan] ?? 1;
    const requiredTier = PLAN_TIER[minPlan];

    if (currentTier < requiredTier) {
      res.status(403).json({
        error: `This feature requires the ${minPlan} plan or higher.`,
        currentPlan: plan,
        requiredPlan: minPlan,
      });
      return;
    }

    next();
  };
}
