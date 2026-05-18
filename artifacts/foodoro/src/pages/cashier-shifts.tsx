import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Play, Square, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { format, formatDuration, intervalToDuration, isValid, type Locale } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { useAuth } from "@/lib/clerk-shim";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Shift {
  id: number;
  userId: number;
  userName: string;
  userRole: string;
  startedAt: string;
  endedAt: string | null;
  orderCount: number;
  totalSales: string;
  totalReturns: string;
  totalDiscounts: string;
  totalCancellations: number;
  isClosed: boolean;
  notes: string | null;
}

function safeDate(d: string | null | undefined): Date | null {
  if (!d) return null;
  const date = new Date(d);
  return isValid(date) ? date : null;
}

function fmtTime(d: string | null | undefined, fmt: string, locale: Locale): string {
  const date = safeDate(d);
  return date ? format(date, fmt, { locale }) : "–";
}

function dur(start: string, end?: string | null) {
  const s = safeDate(start);
  const e = end ? safeDate(end) : new Date();
  if (!s || !e) return "–";
  const d = intervalToDuration({ start: s, end: e });
  return formatDuration(d, { format: ["hours", "minutes"] }) || "< 1 min";
}

export default function CashierShiftsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const locale = isAr ? arSA : enUS;
  const { getToken } = useAuth();

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [current, setCurrent] = useState<Shift | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const authHeaders = async () => {
    const token = await getToken();
    return { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` };
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const headers = await authHeaders();
      const [curRes, allRes] = await Promise.all([
        fetch(`${BASE}/api/cashier/shifts/current`, { headers }),
        fetch(`${BASE}/api/cashier/shifts`, { headers }),
      ]);
      const cur = curRes.ok ? (await curRes.json() as Shift | null) : null;
      const all = allRes.ok ? (await allRes.json() as Shift[]) : [];
      setCurrent(cur);
      setShifts(Array.isArray(all) ? all : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchAll(); }, []);

  const startShift = async () => {
    setActing(true); setError("");
    const headers = await authHeaders();
    const res = await fetch(`${BASE}/api/cashier/shifts/start`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    if (res.ok) { await fetchAll(); }
    else { const d = await res.json() as { error?: string }; setError(d.error ?? "Error"); }
    setActing(false);
  };

  const endShift = async () => {
    setActing(true); setError("");
    const headers = await authHeaders();
    const res = await fetch(`${BASE}/api/cashier/shifts/end`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    if (res.ok) { await fetchAll(); }
    else { const d = await res.json() as { error?: string }; setError(d.error ?? "Error"); }
    setActing(false);
  };

  const currency = isAr ? "ر.س" : "SAR";

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-orange-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold">{t("shifts.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("shifts.subtitle")}</p>
        </div>
      </div>

      {/* Active shift banner */}
      {current && !current.isClosed && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 p-5 text-white"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="flex items-start justify-between">
            <div>
              <p className="text-orange-100 text-sm">{t("shifts.activeShift")}</p>
              <p className="text-2xl font-bold mt-1">{dur(current.startedAt)}</p>
              <p className="text-orange-100 text-xs mt-1">
                {t("shifts.startedAt")} {fmtTime(current.startedAt, "HH:mm", locale)}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void endShift()} disabled={acting}
              className="bg-white text-orange-600 hover:bg-orange-50">
              <Square className="w-4 h-4 me-1" />
              {t("shifts.endShift")}
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{current.orderCount}</p>
              <p className="text-xs text-orange-100">{t("shifts.orders")}</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{Number(current.totalSales).toFixed(0)}</p>
              <p className="text-xs text-orange-100">{t("shifts.sales")} ({currency})</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{Number(current.totalDiscounts).toFixed(0)}</p>
              <p className="text-xs text-orange-100">{t("shifts.discounts")} ({currency})</p>
            </div>
            <div className="bg-white/20 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold">{current.totalCancellations}</p>
              <p className="text-xs text-orange-100">{t("shifts.cancellations")}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* No shift — start button */}
      {!current && !loading && (
        <div className="rounded-2xl border-2 border-dashed border-orange-500/30 p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-4">
            <Play className="w-7 h-7 text-orange-500" />
          </div>
          <p className="font-semibold text-lg">{t("shifts.noActive")}</p>
          <p className="text-muted-foreground text-sm mt-1 mb-4">{t("shifts.startPrompt")}</p>
          <Button onClick={() => void startShift()} disabled={acting} className="bg-orange-500 hover:bg-orange-600">
            <Play className="w-4 h-4 me-2" />
            {t("shifts.startShift")}
          </Button>
          {error && <p className="text-red-500 text-sm mt-3">{error}</p>}
        </div>
      )}

      {/* Shifts history */}
      <div>
        <h2 className="font-bold mb-3 text-sm text-muted-foreground uppercase tracking-wide">{t("shifts.history")}</h2>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {shifts.filter((s) => s.isClosed).map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="rounded-xl bg-muted/30 border border-border/50 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-orange-500/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{s.userName}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtTime(s.startedAt, "yyyy/MM/dd HH:mm", locale)}
                        {s.endedAt && ` → ${fmtTime(s.endedAt, "HH:mm", locale)}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className="font-bold text-sm text-orange-500">{Number(s.totalSales).toFixed(2)} {currency}</p>
                    <p className="text-xs text-muted-foreground">{dur(s.startedAt, s.endedAt)}</p>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t("shifts.orders")}</p>
                    <p className="font-semibold text-sm">{s.orderCount}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t("shifts.returns")}</p>
                    <p className="font-semibold text-sm">{Number(s.totalReturns).toFixed(0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t("shifts.discounts")}</p>
                    <p className="font-semibold text-sm">{Number(s.totalDiscounts).toFixed(0)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">{t("shifts.cancellations")}</p>
                    <p className="font-semibold text-sm">{s.totalCancellations}</p>
                  </div>
                </div>
              </motion.div>
            ))}
            {shifts.filter((s) => s.isClosed).length === 0 && (
              <p className="text-center text-muted-foreground text-sm py-8">{t("shifts.noHistory")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
