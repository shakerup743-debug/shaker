/**
 * Sticky subscription status banner shown across the authenticated layout.
 * Surfaces:
 *  - Trial countdown when ≤ 7 days remain
 *  - Read-only mode when subscription expired
 *  - Scheduled cancellation reminder
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AlertTriangle, Sparkles, XCircle, ArrowRight } from "lucide-react";

interface SubData {
  status: "trial" | "active" | "past_due" | "canceled" | "expired";
  daysLeft: number | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  readOnly: boolean;
}

const TOKEN_KEY = "foodoro-token";
const DISMISS_KEY = "foodoro-sub-banner-dismissed";

export function SubscriptionBanner() {
  const [, setLocation] = useLocation();
  const [sub, setSub] = useState<SubData | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => sessionStorage.getItem(DISMISS_KEY));

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return;
    fetch("/api/subscription", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() as Promise<SubData> : null))
      .then((d) => d && setSub(d))
      .catch(() => undefined);
  }, []);

  if (!sub) return null;

  // Expired / canceled → critical red banner (never dismissible)
  if (sub.readOnly) {
    return (
      <div className="bg-rose-500 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-sm" data-testid="sub-banner-expired">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="font-semibold">انتهى اشتراكك — النظام في وضع القراءة فقط.</span>
        </div>
        <button onClick={() => setLocation("/billing")}
          className="bg-white text-rose-700 text-xs font-bold rounded-md px-3 py-1.5 inline-flex items-center gap-1.5"
          data-testid="sub-banner-renew-btn">
          جدّد الاشتراك <ArrowRight className="w-3 h-3 rtl:rotate-180" />
        </button>
      </div>
    );
  }

  // Trial ≤ 7 days
  if (sub.status === "trial" && sub.daysLeft !== null && sub.daysLeft <= 7) {
    const key = `trial-${sub.daysLeft}`;
    if (dismissed === key) return null;
    return (
      <div className="bg-amber-500/95 text-amber-950 px-4 py-2.5 flex items-center justify-between gap-3 text-sm" data-testid="sub-banner-trial">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 shrink-0" />
          <span className="font-semibold">
            باقي {sub.daysLeft} {sub.daysLeft === 1 ? "يوم" : "أيام"} على انتهاء التجربة المجانية. اشترك الآن قبل أن يتوقف نظامك.
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setLocation("/billing")}
            className="bg-amber-950 text-white text-xs font-bold rounded-md px-3 py-1.5"
            data-testid="sub-banner-trial-cta">
            اشترك الآن
          </button>
          <button onClick={() => { sessionStorage.setItem(DISMISS_KEY, key); setDismissed(key); }}
            className="opacity-60 hover:opacity-100" aria-label="dismiss" data-testid="sub-banner-dismiss">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Cancellation scheduled
  if (sub.cancelAtPeriodEnd && sub.daysLeft !== null) {
    const key = `cancel-${sub.daysLeft}`;
    if (dismissed === key) return null;
    return (
      <div className="bg-orange-500/95 text-orange-950 px-4 py-2.5 flex items-center justify-between gap-3 text-sm" data-testid="sub-banner-canceling">
        <div className="flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span className="font-semibold">سيتم إلغاء اشتراكك بعد {sub.daysLeft} يوم. يمكنك استئنافه من صفحة الفواتير.</span>
        </div>
        <button onClick={() => { sessionStorage.setItem(DISMISS_KEY, key); setDismissed(key); }}
          className="opacity-60 hover:opacity-100" aria-label="dismiss">
          <XCircle className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return null;
}
