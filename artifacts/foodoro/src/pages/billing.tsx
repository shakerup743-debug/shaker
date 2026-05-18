import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard,
  CheckCircle2,
  Zap,
  Building2,
  Users,
  Star,
  AlertCircle,
  Loader2,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const TOKEN_KEY = "foodoro-token";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

// Stripe publishable key — used to initialize Stripe.js if needed in future
// (currently billing redirects to Stripe-hosted Checkout, so only backend key is needed)
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

interface BillingStatus {
  plan: "starter" | "pro" | "enterprise";
  status: "active" | "trial" | "expired" | "suspended";
  expiresAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  usage: {
    branches: { used: number; max: number | null };
    users: { used: number; max: number | null };
  };
}

async function fetchBillingStatus(): Promise<BillingStatus | null> {
  const res = await fetch(`${BASE}/api/billing/status`, {
    headers: authHeaders(),
    credentials: "include",
  });
  if (res.status === 403 || res.status === 402) {
    // Plan-gated endpoint; show fallback UI
    return null;
  }
  if (!res.ok) throw new Error("Failed to fetch billing status");
  const data = (await res.json()) as Partial<BillingStatus> & { error?: string };
  if (data.error) return null;
  return data as BillingStatus;
}

async function startCheckout(plan: string): Promise<{ url: string }> {
  const res = await fetch(`${BASE}/api/billing/checkout`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
    body: JSON.stringify({ plan }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Checkout failed");
  }
  return res.json() as Promise<{ url: string }>;
}

async function openPortal(): Promise<{ url: string }> {
  const res = await fetch(`${BASE}/api/billing/portal`, {
    method: "POST",
    headers: authHeaders(),
    credentials: "include",
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Portal failed");
  }
  return res.json() as Promise<{ url: string }>;
}

const PLAN_ORDER = ["starter", "pro", "enterprise"] as const;

const PLAN_META = {
  starter: {
    icon: Star,
    price: "$49",
    branches: "1",
    users: "5",
    color: "text-gray-400",
    badgeClass: "bg-gray-700 text-gray-200",
    borderClass: "border-border",
    highlightClass: "",
    gradient: "",
  },
  pro: {
    icon: Zap,
    price: "$149",
    branches: "5",
    users: "20",
    color: "text-blue-400",
    badgeClass: "bg-blue-600 text-white",
    borderClass: "border-blue-500/60",
    highlightClass: "ring-2 ring-blue-500/40",
    gradient: "bg-gradient-to-b from-blue-950/30 to-transparent",
  },
  enterprise: {
    icon: Building2,
    price: "$499",
    branches: "∞",
    users: "∞",
    color: "text-amber-400",
    badgeClass: "bg-amber-500 text-black",
    borderClass: "border-amber-500/60",
    highlightClass: "ring-2 ring-amber-500/30",
    gradient: "bg-gradient-to-b from-amber-950/20 to-transparent",
  },
} as const;

function UsageBar({
  label,
  used,
  max,
  unlimited,
}: {
  label: string;
  used: number;
  max: number | null;
  unlimited: string;
}) {
  const pct = max ? Math.min(100, (used / max) * 100) : 0;
  const isHigh = max ? pct >= 80 : false;
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={isHigh ? "text-destructive font-medium" : "text-foreground"}>
          {used} / {max === null ? unlimited : max}
        </span>
      </div>
      {max !== null && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isHigh ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: BillingStatus["status"] }) {
  const { t } = useTranslation();
  const map: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    trial: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    expired: "bg-destructive/20 text-destructive border-destructive/30",
    suspended: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border font-medium ${map[status] ?? map.active}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {t(`billing.status.${status}` as never)}
    </span>
  );
}

export default function BillingPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);

  const { data, isLoading, refetch } = useQuery<BillingStatus | null>({
    queryKey: ["billing-status"],
    queryFn: fetchBillingStatus,
    staleTime: 30_000,
  });

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("success") === "1") {
      toast({
        title: t("billing.toast.successTitle"),
        description: t("billing.toast.successDesc"),
      });
      void refetch();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleCheckout = async (plan: string) => {
    setCheckingOut(plan);
    try {
      const { url } = await startCheckout(plan);
      if (url) window.location.href = url;
    } catch (err) {
      toast({
        title: t("billing.toast.checkoutError"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setCheckingOut(null);
    }
  };

  const handlePortal = async () => {
    setOpeningPortal(true);
    try {
      const { url } = await openPortal();
      if (url) window.location.href = url;
    } catch (err) {
      toast({
        title: t("billing.toast.portalError"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setOpeningPortal(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const currentPlan = data?.plan ?? "starter";
  const status = data?.status ?? "active";

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">

        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-primary" />
              {t("billing.title")}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">{t("billing.subtitle")}</p>
          </div>
          {data?.stripeSubscriptionId && (
            <button
              onClick={() => void handlePortal()}
              disabled={openingPortal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-card text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
            >
              {openingPortal ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4" />
              )}
              {t("billing.manage")}
            </button>
          )}
        </div>

        {/* Current plan card */}
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
                {t("billing.currentPlan")}
              </p>
              <div className="flex items-center gap-3">
                <span
                  className={`px-3 py-1 rounded-full text-sm font-bold ${PLAN_META[currentPlan].badgeClass}`}
                >
                  {t(`billing.plans.${currentPlan}` as never)}
                </span>
                <StatusBadge status={status} />
              </div>
            </div>
            {data?.expiresAt && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{t("billing.expiresAt")}</p>
                <p className="text-sm font-medium text-foreground">
                  {new Date(data.expiresAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          {/* Usage */}
          {data?.usage && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {t("billing.usage")}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <UsageBar
                  label={t("billing.compare.features.branches")}
                  used={data.usage.branches.used}
                  max={data.usage.branches.max}
                  unlimited={t("billing.unlimited")}
                />
                <UsageBar
                  label={t("billing.compare.features.users")}
                  used={data.usage.users.used}
                  max={data.usage.users.max}
                  unlimited={t("billing.unlimited")}
                />
              </div>
            </div>
          )}
        </div>

        {/* Plan comparison */}
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-4">
            {t("billing.compare.title")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {PLAN_ORDER.map((plan) => {
              const meta = PLAN_META[plan];
              const Icon = meta.icon;
              const isCurrent = plan === currentPlan;

              return (
                <div
                  key={plan}
                  className={`relative rounded-2xl border bg-card p-6 space-y-5 transition-all ${meta.borderClass} ${meta.highlightClass} ${meta.gradient}`}
                >
                  {isCurrent && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary text-white shadow-lg shadow-primary/30">
                        {t("billing.compare.current")}
                      </span>
                    </div>
                  )}

                  <div className="flex items-start justify-between">
                    <div>
                      <Icon className={`w-6 h-6 mb-2 ${meta.color}`} />
                      <h3 className="font-bold text-lg text-foreground">
                        {t(`billing.plans.${plan}` as never)}
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className={`text-2xl font-black ${meta.color}`}>
                        {meta.price}
                      </span>
                      <span className="text-xs text-muted-foreground block">
                        {t("billing.compare.perMonth")}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground">
                        {meta.branches}{" "}
                        {t("billing.compare.features.branches")}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground">
                        {meta.users}{" "}
                        {t("billing.compare.features.users")}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground">
                        {t(`billing.compare.analyticsLevels.${plan}` as never)}{" "}
                        {t("billing.compare.features.analytics")}
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-foreground">
                        {t(`billing.compare.supportLevels.${plan}` as never)}{" "}
                        {t("billing.compare.features.support")}
                      </span>
                    </li>
                    {(plan === "pro" || plan === "enterprise") && (
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-foreground">
                          {t("billing.compare.features.api")}
                        </span>
                      </li>
                    )}
                  </ul>

                  {isCurrent ? (
                    <div className="pt-2">
                      <div className="w-full py-2.5 rounded-xl bg-primary/10 border border-primary/20 text-center text-sm font-medium text-primary">
                        {t("billing.compare.current")}
                      </div>
                    </div>
                  ) : plan === "enterprise" ? (
                    <button
                      onClick={() => void handleCheckout(plan)}
                      disabled={checkingOut === plan}
                      className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all border ${meta.borderClass} text-amber-400 hover:bg-amber-500/10 disabled:opacity-50`}
                    >
                      {checkingOut === plan ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t("common.loading")}
                        </span>
                      ) : (
                        t("billing.contactSales")
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleCheckout(plan)}
                      disabled={!!checkingOut}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold bg-primary hover:bg-primary/90 text-white transition-all disabled:opacity-50"
                    >
                      {checkingOut === plan ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {t("common.loading")}
                        </span>
                      ) : (
                        t("billing.upgradeNow")
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* No Stripe warning */}
        {!data?.stripeCustomerId && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-400">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{t("billing.noStripe")}</span>
          </div>
        )}
      </div>
    </div>
  );
}
