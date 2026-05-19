/**
 * /billing — full subscription dashboard.
 * Calls the new SaaS subscription API (/api/subscription/*).
 *
 *  - Shows current plan + status + days remaining
 *  - Lists usage (users/branches)
 *  - Lets owner upgrade / downgrade / cancel / resume
 *  - Lists invoices
 *  - Triggers Paddle checkout (or mock checkout when keys are not configured)
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CreditCard, CheckCircle2, Star, Building2, Users, Loader2,
  AlertTriangle, Calendar, Receipt, ArrowUpCircle, ArrowDownCircle,
  XCircle, RotateCcw, Sparkles,
} from "lucide-react";

const TOKEN_KEY = "foodoro-token";
const BASE = "";

type PlanId = "starter" | "growth" | "enterprise";
type SubStatus = "trial" | "active" | "past_due" | "canceled" | "expired";

interface SubData {
  plan: PlanId;
  status: SubStatus;
  planName: string;
  planNameAr: string;
  yearlyPriceUsd: number;
  features: string[];
  limits: { maxBranches: number; maxUsers: number };
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  pendingDowngradePlan: PlanId | null;
  daysLeft: number | null;
  readOnly: boolean;
  usage: {
    branches: { used: number; max: number | null; unlimited: boolean };
    users:    { used: number; max: number | null; unlimited: boolean };
  };
  paddleConfigured: boolean;
}

interface PlanCatalogItem {
  id: PlanId;
  name: string;
  nameAr: string;
  yearlyPriceUsd: number;
  limits: { maxBranches: number | null; maxUsers: number | null };
  features: string[];
  highlighted: boolean;
}

interface Invoice {
  id: number;
  invoice_number: string | null;
  amount: string;
  currency: string;
  plan: string | null;
  status: string;
  invoice_pdf_url: string | null;
  paid_at: string | null;
  created_at: string;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers ?? {}) } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string; message?: string };
    throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const PLAN_RANK: Record<PlanId, number> = { starter: 1, growth: 2, enterprise: 3 };
const STATUS_META: Record<SubStatus, { label: string; color: string }> = {
  trial:    { label: "تجربة مجانية", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  active:   { label: "نشط",          color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  past_due: { label: "متأخر السداد",  color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  canceled: { label: "ملغى",         color: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  expired:  { label: "منتهي",        color: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
};

const FEATURE_LABELS_AR: Record<string, string> = {
  pos:               "نقطة البيع POS",
  orders:            "إدارة الطلبات",
  products:          "إدارة المنتجات",
  categories:        "الأقسام والفئات",
  qr_menu:           "قائمة QR للطلبات الذاتية",
  reports_basic:     "تقارير أساسية",
  kds:               "شاشة المطبخ KDS",
  inventory:         "إدارة المخزون",
  waste:             "تتبع الهدر",
  loyalty:           "برنامج الولاء",
  coupons:           "كوبونات الخصم",
  customers:         "إدارة العملاء",
  reports_advanced:  "تقارير متقدمة",
  sse:               "تحديثات لحظية",
  ai_insights:       "تحليلات AI",
  ai_chat:           "مساعد محادثة AI",
  rbac:              "صلاحيات متقدمة",
  api_access:        "وصول API كامل",
  webhooks:          "Webhooks",
  audit_logs:        "سجلات التدقيق",
  security_center:   "مركز الأمان",
  priority_support:  "دعم أولوية",
};

function labelFeature(f: string): string { return FEATURE_LABELS_AR[f] ?? f; }

export default function BillingPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  const sub      = useQuery<SubData>({ queryKey: ["subscription"],          queryFn: () => api<SubData>("/api/subscription") });
  const plans    = useQuery<{ plans: PlanCatalogItem[]; trialDays: number; paddleConfigured: boolean }>({
    queryKey: ["subscription-plans"],
    queryFn:  () => api("/api/subscription/plans"),
  });
  const invoices = useQuery<{ invoices: Invoice[] }>({ queryKey: ["subscription-invoices"], queryFn: () => api("/api/subscription/invoices") });

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ["subscription"] });
    void qc.invalidateQueries({ queryKey: ["subscription-invoices"] });
  };

  const checkout = useMutation({
    mutationFn: (plan: PlanId) => api<{ ok: boolean; mocked: boolean; checkoutUrl: string | null; message: string }>(
      "/api/subscription/checkout", { method: "POST", body: JSON.stringify({ plan }) }),
    onSuccess: (data, plan) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      toast({ title: data.mocked ? "وضع تجريبي" : "نجاح", description: data.message });
      refreshAll();
      setBusy(null);
      void plan;
    },
    onError: (e: Error) => { toast({ title: "خطأ", description: e.message, variant: "destructive" }); setBusy(null); },
  });

  const upgrade = useMutation({
    mutationFn: (plan: PlanId) => api("/api/subscription/upgrade", { method: "POST", body: JSON.stringify({ plan }) }),
    onSuccess: () => { toast({ title: "تمت الترقية" }); refreshAll(); setBusy(null); },
    onError: (e: Error) => { toast({ title: "خطأ", description: e.message, variant: "destructive" }); setBusy(null); },
  });

  const downgrade = useMutation({
    mutationFn: (plan: PlanId) => api("/api/subscription/downgrade", { method: "POST", body: JSON.stringify({ plan }) }),
    onSuccess: () => { toast({ title: "تم جدولة التخفيض" }); refreshAll(); setBusy(null); },
    onError: (e: Error) => { toast({ title: "خطأ", description: e.message, variant: "destructive" }); setBusy(null); },
  });

  const cancel = useMutation({
    mutationFn: () => api("/api/subscription/cancel", { method: "POST" }),
    onSuccess: () => { toast({ title: "تم جدولة الإلغاء" }); refreshAll(); setBusy(null); },
    onError: (e: Error) => { toast({ title: "خطأ", description: e.message, variant: "destructive" }); setBusy(null); },
  });

  const resume = useMutation({
    mutationFn: () => api("/api/subscription/resume", { method: "POST" }),
    onSuccess: () => { toast({ title: "تم استئناف الاشتراك" }); refreshAll(); setBusy(null); },
    onError: (e: Error) => { toast({ title: "خطأ", description: e.message, variant: "destructive" }); setBusy(null); },
  });

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("success") === "1") {
      toast({ title: "نجاح الدفع", description: "تم تفعيل اشتراكك. شكراً لك!" });
      refreshAll();
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (sub.isLoading || plans.isLoading) {
    return <div className="h-full grid place-items-center"><Loader2 className="w-7 h-7 text-primary animate-spin" /></div>;
  }
  if (!sub.data || !plans.data) {
    return <div className="p-8 text-destructive">تعذّر تحميل بيانات الاشتراك. حدّث الصفحة.</div>;
  }

  const s = sub.data;
  const handleSelect = (plan: PlanId) => {
    setBusy(plan);
    if (s.status === "trial" || s.status === "expired" || s.status === "canceled" || s.status === "past_due") {
      checkout.mutate(plan);
      return;
    }
    if (PLAN_RANK[plan] > PLAN_RANK[s.plan]) {
      upgrade.mutate(plan);
    } else if (PLAN_RANK[plan] < PLAN_RANK[s.plan]) {
      downgrade.mutate(plan);
    } else {
      // same plan — re-checkout (renew)
      checkout.mutate(plan);
    }
  };

  const expireDate = s.status === "trial" ? s.trialEndsAt : s.currentPeriodEnd;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-7" data-testid="billing-page">

        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="w-6 h-6 text-primary" />
              {t("billing.title", { defaultValue: "الفواتير والاشتراك" })}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              إدارة باقتك، الفواتير، ووسيلة الدفع.
            </p>
          </div>
          {!s.paddleConfigured && (
            <span className="text-xs px-3 py-1 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3" /> Paddle تجريبي
            </span>
          )}
        </header>

        {/* Trial / status banners */}
        {s.status === "trial" && s.daysLeft !== null && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-5 flex items-start gap-3" data-testid="banner-trial">
            <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold">تجربة مجانية نشطة</p>
              <p className="text-sm text-muted-foreground">
                باقي <span className="font-bold text-foreground">{s.daysLeft}</span> يوم على انتهاء التجربة. اشترك الآن لمواصلة العمل بدون انقطاع.
              </p>
            </div>
            <button onClick={() => handleSelect("growth")}
              className="text-sm font-bold text-white bg-primary rounded-xl px-4 py-2.5 hover:opacity-90 disabled:opacity-50"
              disabled={!!busy}
            >
              اشترك الآن
            </button>
          </div>
        )}

        {s.readOnly && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5 flex items-start gap-3" data-testid="banner-expired">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-semibold text-rose-300">انتهى الاشتراك — النظام للقراءة فقط</p>
              <p className="text-sm text-rose-300/80">جدد الاشتراك لاستعادة إنشاء الطلبات وإدارة النظام بالكامل.</p>
            </div>
            <button onClick={() => handleSelect(s.plan)}
              className="text-sm font-bold text-white bg-primary rounded-xl px-4 py-2.5 hover:opacity-90 disabled:opacity-50"
              disabled={!!busy}>
              جدّد الآن
            </button>
          </div>
        )}

        {s.cancelAtPeriodEnd && (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 flex items-start justify-between gap-3" data-testid="banner-canceling">
            <div className="flex items-start gap-3">
              <XCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">جدولة إلغاء الاشتراك</p>
                <p className="text-sm text-muted-foreground">سيتم إلغاء الاشتراك في {expireDate ? new Date(expireDate).toLocaleDateString("ar-EG") : "نهاية الدورة"}.</p>
              </div>
            </div>
            <button onClick={() => { setBusy("resume"); resume.mutate(); }}
              className="text-xs font-bold text-amber-400 border border-amber-500/40 rounded-lg px-3 py-2 hover:bg-amber-500/10 inline-flex items-center gap-1.5"
              disabled={busy === "resume"}>
              <RotateCcw className="w-3.5 h-3.5" /> استئناف
            </button>
          </div>
        )}

        {s.pendingDowngradePlan && (
          <div className="rounded-2xl border border-blue-500/30 bg-blue-500/5 p-4 text-sm flex items-center gap-3" data-testid="banner-pending-downgrade">
            <ArrowDownCircle className="w-4 h-4 text-blue-400" />
            تم جدولة تخفيض الباقة إلى <b className="mx-1 text-blue-300">{s.pendingDowngradePlan}</b> في نهاية الدورة الحالية.
          </div>
        )}

        {/* Current plan summary */}
        <div className="rounded-2xl border border-border bg-card p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">الباقة الحالية</p>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-3 py-1 rounded-full text-sm font-bold bg-primary/15 text-primary">{s.planNameAr}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs border font-semibold inline-flex items-center gap-1 ${STATUS_META[s.status].color}`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                {STATUS_META[s.status].label}
              </span>
            </div>
            <p className="text-2xl font-black mt-3">${s.yearlyPriceUsd}<span className="text-xs text-muted-foreground font-normal"> / سنوياً</span></p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> الانتهاء</p>
            <p className="text-sm font-semibold">{expireDate ? new Date(expireDate).toLocaleDateString("ar-EG") : "—"}</p>
            {s.daysLeft !== null && s.daysLeft >= 0 && (
              <p className="text-xs text-muted-foreground mt-0.5">باقي {s.daysLeft} يوم</p>
            )}
          </div>
          <div className="space-y-2">
            <UsageBar icon={Building2} label="فروع" used={s.usage.branches.used} max={s.usage.branches.max} unlimited={s.usage.branches.unlimited} />
            <UsageBar icon={Users}     label="مستخدمين" used={s.usage.users.used}    max={s.usage.users.max}    unlimited={s.usage.users.unlimited} />
          </div>
        </div>

        {/* Plans grid */}
        <div>
          <h2 className="text-lg font-bold mb-4">اختر باقتك</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {plans.data.plans.map((p) => {
              const isCurrent = p.id === s.plan && (s.status === "active" || s.status === "trial");
              const isUpgrade  = PLAN_RANK[p.id] > PLAN_RANK[s.plan];
              const isDowngrade = PLAN_RANK[p.id] < PLAN_RANK[s.plan];
              const isBusy = busy === p.id;
              return (
                <div key={p.id}
                  data-testid={`plan-card-${p.id}`}
                  className={`relative rounded-2xl bg-card p-6 border transition-all flex flex-col ${
                    p.highlighted ? "border-primary shadow-lg shadow-primary/10 md:scale-[1.02]" : "border-border"
                  }`}>
                  {p.highlighted && (
                    <span className="absolute -top-2.5 start-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-[10px] font-bold text-white bg-primary px-2.5 py-0.5 rounded-full">
                      <Star className="w-3 h-3" /> الأشهر
                    </span>
                  )}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-bold text-lg">{p.nameAr}</p>
                      <p className="text-xs text-muted-foreground">{p.name}</p>
                    </div>
                    {isCurrent && (
                      <span className="text-[10px] font-bold text-primary border border-primary/40 bg-primary/10 px-2 py-0.5 rounded-full">الحالية</span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black">${p.yearlyPriceUsd}</span>
                    <span className="text-xs text-muted-foreground">/ سنة</span>
                  </div>
                  <ul className="mt-5 space-y-2 text-sm flex-1">
                    <li className="flex items-center gap-2"><Building2 className="w-4 h-4 text-muted-foreground" />
                      {p.limits.maxBranches === null ? "فروع غير محدودة" : `حتى ${p.limits.maxBranches} فرع`}</li>
                    <li className="flex items-center gap-2"><Users className="w-4 h-4 text-muted-foreground" />
                      {p.limits.maxUsers === null ? "مستخدمون غير محدودين" : `حتى ${p.limits.maxUsers} مستخدم`}</li>
                    {p.features.slice(0, 6).map((f) => (
                      <li key={f} className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-primary" />{labelFeature(f)}</li>
                    ))}
                    {p.features.length > 6 && (
                      <li className="text-xs text-muted-foreground">+ {p.features.length - 6} ميزة إضافية</li>
                    )}
                  </ul>
                  <button
                    onClick={() => handleSelect(p.id)}
                    disabled={isCurrent || isBusy}
                    data-testid={`plan-select-${p.id}`}
                    className={`mt-5 w-full py-3 rounded-xl text-sm font-bold transition disabled:cursor-not-allowed ${
                      isCurrent
                        ? "bg-muted text-muted-foreground"
                        : p.highlighted
                          ? "bg-primary text-white hover:opacity-90 shadow-lg shadow-primary/30"
                          : "bg-foreground/90 text-background hover:opacity-90"
                    }`}
                  >
                    {isBusy ? (
                      <span className="inline-flex items-center gap-2 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> جاري المعالجة</span>
                    ) : isCurrent ? "باقتك الحالية"
                      : isUpgrade  ? (<span className="inline-flex items-center gap-1.5 justify-center"><ArrowUpCircle className="w-4 h-4" /> ترقية فورية</span>)
                      : isDowngrade ? (<span className="inline-flex items-center gap-1.5 justify-center"><ArrowDownCircle className="w-4 h-4" /> تخفيض (نهاية الدورة)</span>)
                      : "اختيار"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cancel subscription */}
        {(s.status === "active") && !s.cancelAtPeriodEnd && (
          <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between">
            <div className="text-sm">
              <p className="font-semibold mb-0.5">إلغاء الاشتراك</p>
              <p className="text-xs text-muted-foreground">سيستمر النظام للعمل حتى نهاية الدورة الحالية ثم يتحول للقراءة فقط.</p>
            </div>
            <button
              onClick={() => { if (window.confirm("هل أنت متأكد من إلغاء الاشتراك؟")) { setBusy("cancel"); cancel.mutate(); } }}
              className="text-sm font-bold text-rose-400 border border-rose-500/40 rounded-xl px-4 py-2 hover:bg-rose-500/10 inline-flex items-center gap-1.5"
              disabled={busy === "cancel"}
              data-testid="billing-cancel-btn"
            >
              <XCircle className="w-4 h-4" /> إلغاء الاشتراك
            </button>
          </div>
        )}

        {/* Invoices */}
        <div>
          <h2 className="text-lg font-bold mb-3 flex items-center gap-2"><Receipt className="w-5 h-5 text-primary" /> الفواتير</h2>
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            {invoices.data && invoices.data.invoices.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="text-start px-4 py-3">التاريخ</th>
                    <th className="text-start px-4 py-3">الباقة</th>
                    <th className="text-start px-4 py-3">المبلغ</th>
                    <th className="text-start px-4 py-3">الحالة</th>
                    <th className="text-start px-4 py-3">رقم</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.invoices.map((inv) => (
                    <tr key={inv.id} className="border-t border-border" data-testid={`invoice-row-${inv.id}`}>
                      <td className="px-4 py-3">{new Date(inv.created_at).toLocaleDateString("ar-EG")}</td>
                      <td className="px-4 py-3">{inv.plan ?? "—"}</td>
                      <td className="px-4 py-3 font-semibold">${inv.amount} <span className="text-xs text-muted-foreground">{inv.currency}</span></td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${inv.status === "paid" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                          {inv.status === "paid" ? "مدفوعة" : inv.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{inv.invoice_number ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">لا توجد فواتير بعد.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function UsageBar({ icon: Icon, label, used, max, unlimited }: {
  icon: typeof Building2; label: string; used: number; max: number | null; unlimited: boolean;
}) {
  const pct = max && max > 0 ? Math.min(100, (used / max) * 100) : 0;
  const high = max ? pct >= 80 : false;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground inline-flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</span>
        <span className={high ? "text-destructive font-medium" : "font-medium"}>
          {used} / {unlimited ? "∞" : max}
        </span>
      </div>
      {!unlimited && max && (
        <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${high ? "bg-destructive" : "bg-primary"} transition-all duration-500`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
