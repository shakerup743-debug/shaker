/**
 * FOODPRO Subscription Plans — single source of truth.
 * Used by both backend (feature gating, limits enforcement) and frontend (pricing page).
 */
export type PlanId = "starter" | "growth" | "enterprise";

export type Feature =
  | "pos"
  | "orders"
  | "products"
  | "categories"
  | "qr_menu"
  | "reports_basic"
  | "kds"
  | "inventory"
  | "waste"
  | "loyalty"
  | "coupons"
  | "customers"
  | "reports_advanced"
  | "sse"
  | "ai_insights"
  | "ai_chat"
  | "rbac"
  | "api_access"
  | "webhooks"
  | "audit_logs"
  | "security_center"
  | "priority_support";

export interface PlanLimits {
  maxBranches: number;       // -1 = unlimited
  maxUsers: number;          // -1 = unlimited
}

export interface PlanDefinition {
  id: PlanId;
  name: string;
  nameAr: string;
  yearlyPriceUsd: number;
  limits: PlanLimits;
  features: Feature[];
  highlighted?: boolean;
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  starter: {
    id: "starter",
    name: "Starter",
    nameAr: "البداية",
    yearlyPriceUsd: 149,
    limits: { maxBranches: 1, maxUsers: 2 },
    features: ["pos", "orders", "products", "categories", "qr_menu", "reports_basic"],
  },
  growth: {
    id: "growth",
    name: "Growth",
    nameAr: "النمو",
    yearlyPriceUsd: 349,
    limits: { maxBranches: 3, maxUsers: 10 },
    highlighted: true,
    features: [
      "pos", "orders", "products", "categories", "qr_menu", "reports_basic",
      "kds", "inventory", "waste", "loyalty", "coupons", "customers",
      "reports_advanced", "sse", "ai_insights", "ai_chat", "rbac",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    nameAr: "المؤسسات",
    yearlyPriceUsd: 999,
    limits: { maxBranches: -1, maxUsers: -1 },
    features: [
      "pos", "orders", "products", "categories", "qr_menu", "reports_basic",
      "kds", "inventory", "waste", "loyalty", "coupons", "customers",
      "reports_advanced", "sse", "ai_insights", "ai_chat", "rbac",
      "api_access", "webhooks", "audit_logs", "security_center", "priority_support",
    ],
  },
};

/** Trial gives Starter-level features for 14 days with very small limits. */
export const TRIAL_PLAN: Pick<PlanDefinition, "features" | "limits"> = {
  features: PLANS.growth.features, // try the good stuff during trial
  limits: { maxBranches: 1, maxUsers: 3 },
};

export const TRIAL_DAYS = 14;

export function planHasFeature(plan: PlanId, feature: Feature): boolean {
  return PLANS[plan].features.includes(feature);
}

export function isUnlimited(value: number): boolean {
  return value === -1;
}
