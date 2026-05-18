import Stripe from "stripe";

export type SubscriptionPlan = "starter" | "pro" | "enterprise";

export interface PlanConfig {
  label: string;
  maxBranches: number;
  maxUsers: number;
  priceUsd: number;
  priceData: {
    currency: string;
    unit_amount: number;
    product_data: { name: string; metadata: { plan: string } };
    recurring: { interval: "month" };
  };
}

export const PLAN_CONFIGS: Record<SubscriptionPlan, PlanConfig> = {
  starter: {
    label: "Starter",
    maxBranches: 1,
    maxUsers: 5,
    priceUsd: 49,
    priceData: {
      currency: "usd",
      unit_amount: 4900,
      product_data: { name: "FOODORO Starter Plan", metadata: { plan: "starter" } },
      recurring: { interval: "month" },
    },
  },
  pro: {
    label: "Pro",
    maxBranches: 5,
    maxUsers: 20,
    priceUsd: 149,
    priceData: {
      currency: "usd",
      unit_amount: 14900,
      product_data: { name: "FOODORO Pro Plan", metadata: { plan: "pro" } },
      recurring: { interval: "month" },
    },
  },
  enterprise: {
    label: "Enterprise",
    maxBranches: Infinity,
    maxUsers: Infinity,
    priceUsd: 499,
    priceData: {
      currency: "usd",
      unit_amount: 49900,
      product_data: { name: "FOODORO Enterprise Plan", metadata: { plan: "enterprise" } },
      recurring: { interval: "month" },
    },
  },
};

export const PLAN_TIER: Record<SubscriptionPlan, number> = {
  starter: 1,
  pro: 2,
  enterprise: 3,
};

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    _stripe = new Stripe(key);
  }
  return _stripe;
}

export function isValidPlan(plan: string): plan is SubscriptionPlan {
  return plan === "starter" || plan === "pro" || plan === "enterprise";
}
