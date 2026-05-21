import { useState, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  LineChart, Line, CartesianGrid,
} from "recharts";
import {
  BarChart3, TrendingUp, ShoppingCart, AlertTriangle,
  DollarSign, Printer, Calendar, ReceiptText, Percent, Tag,
  Package, FileSpreadsheet, ArrowUpRight, ArrowDownRight,
  CreditCard, Banknote, Lock, Trash2, Boxes, FileEdit,
  Ban, RotateCcw, Search, Filter,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import {
  useGetDashboardStats,
  useGetDailyReport,
  useGetTopProducts,
  useGetHourlySales,
  useGetMonthlyReport,
  useGetYearlyReport,
  useGetKpiReport,
  useGetSalesByCategory,
  useGetSalesByWeekday,
  useListOrders,
  useGetWasteAnalytics,
  useListInventory,
} from "@workspace/api-client-react";
import { InvoiceModal, type InvoiceData } from "@/components/invoice-modal";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════ */
const SAR = "ر.س";
function fmt(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(n: number) { return n.toFixed(1) + "%"; }

function todayStr() { return new Date().toISOString().split("T")[0]; }

function presetRange(preset: string): { from: string; to: string } {
  const now = new Date();
  const today = todayStr();
  if (preset === "today") return { from: today, to: today };
  if (preset === "yesterday") {
    const y = new Date(now); y.setDate(y.getDate() - 1);
    const s = y.toISOString().split("T")[0];
    return { from: s, to: s };
  }
  if (preset === "thisWeek") {
    const day = now.getDay();
    const start = new Date(now); start.setDate(now.getDate() - day);
    return { from: start.toISOString().split("T")[0], to: today };
  }
  if (preset === "thisMonth") {
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
    return { from: start.toISOString().split("T")[0], to: today };
  }
  if (preset === "last3Months") {
    const start = new Date(now); start.setMonth(start.getMonth() - 3);
    return { from: start.toISOString().split("T")[0], to: today };
  }
  if (preset === "thisYear") {
    const start = new Date(Date.UTC(now.getFullYear(), 0, 1));
    return { from: start.toISOString().split("T")[0], to: today };
  }
  return { from: today, to: today };
}

/* ═══════════════════════════════════════════════════════
   SHARED MINI COMPONENTS
═══════════════════════════════════════════════════════ */
function TrendBadge({ pct }: { pct: number | null | undefined }) {
  if (pct === null || pct === undefined) return null;
  const positive = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-1.5 py-0.5 ${
        positive ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"
      }`}
    >
      {positive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
      {Math.abs(pct)}%
    </span>
  );
}

function KpiCard({
  label, value, sub, icon: Icon, color, trend, trendLabel,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType;
  color: string; trend?: number | null; trendLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-3 p-5 rounded-2xl bg-card border border-border print:border-gray-300 print:bg-white">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground print:text-gray-500">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color} print:hidden`}>
          <Icon size={15} className="text-white" />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground print:text-black">{value}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {sub && <p className="text-xs text-muted-foreground print:text-gray-500">{sub}</p>}
          {trend !== undefined && (
            <div className="flex items-center gap-1">
              <TrendBadge pct={trend} />
              {trendLabel && <span className="text-xs text-muted-foreground">{trendLabel}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0 print:border-gray-200">
      <span className="text-xs text-muted-foreground print:text-gray-500">{label}</span>
      <span className={`text-sm font-semibold ${accent ?? "text-foreground print:text-black"}`}>{value}</span>
    </div>
  );
}

function SectionCard({ title, children, className = "" }: {
  title?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`p-5 rounded-2xl bg-card border border-border print:border-gray-300 print:bg-white ${className}`}>
      {title && <h3 className="text-sm font-semibold text-foreground mb-4 print:text-black">{title}</h3>}
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ALERT STRIP
═══════════════════════════════════════════════════════ */
function AlertStrip({
  stats,
}: {
  stats: { revenueTrend?: number | null; lowStockCount?: number; pendingKitchenTickets?: number } | undefined;
}) {
  const { t } = useTranslation();
  if (!stats) return null;
  const alerts: { msg: string; sev: "warn" | "error" }[] = [];
  if (stats.revenueTrend !== null && stats.revenueTrend !== undefined && stats.revenueTrend <= -20)
    alerts.push({ msg: t("reports.alerts.revenueDown", { pct: Math.abs(stats.revenueTrend) }), sev: "warn" });
  if ((stats.lowStockCount ?? 0) > 0)
    alerts.push({ msg: t("reports.alerts.lowStock", { count: stats.lowStockCount }), sev: "error" });
  if ((stats.pendingKitchenTickets ?? 0) > 10)
    alerts.push({ msg: t("reports.alerts.pendingOrders", { count: stats.pendingKitchenTickets }), sev: "warn" });
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 print:hidden">
      {alerts.map((a, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
            a.sev === "error"
              ? "bg-red-950/60 text-red-300 border border-red-800/60"
              : "bg-amber-950/60 text-amber-300 border border-amber-800/60"
          }`}
        >
          <AlertTriangle size={15} />
          {a.msg}
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DATE RANGE PRESETS
═══════════════════════════════════════════════════════ */
const PRESETS = ["today", "yesterday", "thisWeek", "thisMonth", "last3Months", "thisYear"] as const;

function DateRangeBar({
  from, to, onFromChange, onToChange, activePreset, onPreset,
}: {
  from: string; to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  activePreset: string | null;
  onPreset: (p: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {PRESETS.map((p) => (
        <button
          key={p}
          onClick={() => onPreset(p)}
          className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
            activePreset === p
              ? "bg-primary text-white"
              : "bg-card border border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
          }`}
        >
          {t(`reports.periods.${p}`)}
        </button>
      ))}
      <div className="flex items-center gap-1.5 ms-2">
        <Calendar size={13} className="text-muted-foreground" />
        <input
          type="date"
          value={from}
          onChange={(e) => { onFromChange(e.target.value); onPreset(""); }}
          className="text-xs bg-card border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-primary"
        />
        <span className="text-muted-foreground text-xs">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => { onToChange(e.target.value); onPreset(""); }}
          className="text-xs bg-card border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-primary"
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EXPORT HELPERS
═══════════════════════════════════════════════════════ */
function exportToExcel(rows: Record<string, unknown>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  XLSX.writeFile(wb, filename + ".xlsx");
}

/* ═══════════════════════════════════════════════════════
   CHART COLORS
═══════════════════════════════════════════════════════ */
const CHART_COLORS = ["#E67E22", "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4", "#EC4899"];
const PRIMARY = "#E67E22";
const GREEN = "#10B981";
const MUTED_COLOR = "#6B7280";

/* ═══════════════════════════════════════════════════════
   KPI TAB — comprehensive metrics + charts
═══════════════════════════════════════════════════════ */
function PlanGateCard({ plan = "pro" }: { plan?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Lock size={24} className="text-primary" />
      </div>
      <div>
        <p className="text-foreground font-semibold text-lg">{t("reports.planGate.title", { plan })}</p>
        <p className="text-muted-foreground text-sm mt-1">{t("reports.planGate.desc", { plan })}</p>
      </div>
    </div>
  );
}

function KpiTab({ from, to }: { from: string; to: string }) {
  const { t } = useTranslation();
  const { data: kpi, isLoading: kpiLoading, isError: kpiError, error: kpiErr } = useGetKpiReport({ from, to });
  const { data: byCategory, isLoading: catLoading } = useGetSalesByCategory({ from, to });
  const { data: byWeekday, isLoading: wkLoading } = useGetSalesByWeekday({ from, to });

  const weekdayNames: Record<string, string> = {
    Sunday: t("reports.weekday.Sun"),
    Monday: t("reports.weekday.Mon"),
    Tuesday: t("reports.weekday.Tue"),
    Wednesday: t("reports.weekday.Wed"),
    Thursday: t("reports.weekday.Thu"),
    Friday: t("reports.weekday.Fri"),
    Saturday: t("reports.weekday.Sat"),
  };

  if (kpiLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    );
  }

  // Pro/Enterprise gating intentionally disabled — all reports unlocked.

  return (
    <div className="flex flex-col gap-6">
      {/* Export actions */}
      <div className="flex items-center gap-2 print:hidden flex-wrap">
        <button
          onClick={() => {
            if (!kpi) return;
            exportToExcel([{
              "Total Revenue": kpi.totalRevenue,
              "Prev Revenue": kpi.prevRevenue,
              "Revenue Trend %": kpi.revenueTrend,
              "Tax": kpi.taxCollected,
              "Discounts": kpi.discountsGiven,
              "Cash Revenue": kpi.cashRevenue,
              "Card Revenue": kpi.cardRevenue,
              "Orders": kpi.orderCount,
              "Completed": kpi.completedOrders,
              "Cancelled": kpi.cancelledOrders,
              "Cancellation Rate %": kpi.cancellationRate,
              "Avg Order Value": kpi.averageOrderValue,
              "Dine In": kpi.dineInOrders,
              "Takeaway": kpi.takeawayOrders,
              "Delivery": kpi.deliveryOrders,
              "Low Stock": kpi.lowStockCount,
            }], `kpi_${from}_${to}`);
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
        >
          <FileSpreadsheet size={13} /> {t("reports.exportExcel")} (KPIs)
        </button>
        <button
          onClick={() => {
            if (!byCategory) return;
            exportToExcel(
              byCategory.map((c) => ({ Category: c.categoryName, Revenue: c.revenue, "Items Sold": c.itemsSold, Orders: c.orderCount })),
              `by_category_${from}_${to}`
            );
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-medium transition-colors"
        >
          <FileSpreadsheet size={13} /> {t("reports.exportExcel")} ({t("reports.category.title")})
        </button>
        <button
          onClick={() => {
            if (!byWeekday) return;
            exportToExcel(
              byWeekday.map((w) => ({ Day: w.dayName, Revenue: w.revenue, Orders: w.orderCount })),
              `by_weekday_${from}_${to}`
            );
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white text-xs font-medium transition-colors"
        >
          <FileSpreadsheet size={13} /> {t("reports.exportExcel")} ({t("reports.weekday.title")})
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card border border-border text-foreground text-xs font-medium hover:border-primary/50 transition-colors ms-auto"
        >
          <Printer size={13} /> {t("reports.print")}
        </button>
      </div>

      {/* Financial KPIs */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t("reports.kpi.financial")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <KpiCard
            label={t("reports.kpi.totalRevenue")}
            value={`${SAR} ${fmt(kpi?.totalRevenue ?? 0)}`}
            sub={`${t("reports.kpi.prevRevenue")}: ${SAR} ${fmt(kpi?.prevRevenue ?? 0)}`}
            icon={DollarSign} color="bg-primary"
            trend={kpi?.revenueTrend} trendLabel={t("reports.vsPrevPeriod")}
          />
          <KpiCard
            label={t("reports.kpi.averageOrderValue")}
            value={`${SAR} ${fmt(kpi?.averageOrderValue ?? 0)}`}
            sub={`${t("reports.kpi.prevRevenue")}: ${SAR} ${fmt(kpi?.prevAverageOrderValue ?? 0)}`}
            icon={ReceiptText} color="bg-indigo-600"
            trend={kpi?.aovTrend} trendLabel={t("reports.vsPrevPeriod")}
          />
          <KpiCard
            label={t("reports.kpi.cashRevenue")}
            value={`${SAR} ${fmt(kpi?.cashRevenue ?? 0)}`}
            icon={Banknote} color="bg-emerald-600"
          />
          <KpiCard
            label={t("reports.kpi.cardRevenue")}
            value={`${SAR} ${fmt(kpi?.cardRevenue ?? 0)}`}
            icon={CreditCard} color="bg-blue-600"
          />
          <KpiCard
            label={t("reports.kpi.taxCollected")}
            value={`${SAR} ${fmt(kpi?.taxCollected ?? 0)}`}
            icon={Percent} color="bg-amber-500"
          />
          <KpiCard
            label={t("reports.kpi.discountsGiven")}
            value={`${SAR} ${fmt(kpi?.discountsGiven ?? 0)}`}
            icon={Tag} color="bg-pink-600"
          />
        </div>
      </div>

      {/* Sales KPIs */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          {t("reports.kpi.sales")}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label={t("reports.kpi.orderCount")}
            value={String(kpi?.orderCount ?? 0)}
            sub={`${t("reports.kpi.prevRevenue")}: ${kpi?.prevOrderCount ?? 0}`}
            icon={ShoppingCart} color="bg-blue-600"
            trend={kpi?.ordersTrend} trendLabel={t("reports.vsPrevPeriod")}
          />
          <KpiCard
            label={t("reports.kpi.completedOrders")}
            value={String(kpi?.completedOrders ?? 0)}
            icon={Package} color="bg-emerald-600"
          />
          <KpiCard
            label={t("reports.kpi.cancelledOrders")}
            value={String(kpi?.cancelledOrders ?? 0)}
            icon={AlertTriangle} color="bg-destructive"
          />
          <KpiCard
            label={t("reports.kpi.cancellationRate")}
            value={fmtPct(kpi?.cancellationRate ?? 0)}
            sub={`${t("reports.kpi.prevRevenue")}: ${fmtPct(kpi?.prevCancellationRate ?? 0)}`}
            icon={Percent} color="bg-amber-500"
          />
        </div>
      </div>

      {/* Operations + Low Stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SectionCard title={t("reports.kpi.operations")}>
          <StatRow label={t("reports.kpi.dineIn")} value={String(kpi?.dineInOrders ?? 0)} />
          <StatRow label={t("reports.kpi.takeaway")} value={String(kpi?.takeawayOrders ?? 0)} />
          <StatRow label={t("reports.kpi.delivery")} value={String(kpi?.deliveryOrders ?? 0)} />
        </SectionCard>

        <SectionCard title={`${t("reports.kpi.inventory")} — ${t("reports.kpi.lowStockList")}`}>
          {(kpi?.lowStockItems?.length ?? 0) === 0 ? (
            <p className="text-xs text-muted-foreground">{t("reports.noData")}</p>
          ) : (
            kpi?.lowStockItems?.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="text-xs text-foreground">{item.name}</span>
                <span className="text-xs text-red-400 font-semibold">
                  {item.quantity} / {item.threshold} {item.unit}
                </span>
              </div>
            ))
          )}
        </SectionCard>
      </div>

      {/* By Category */}
      <SectionCard title={t("reports.category.title")}>
        {catLoading ? (
          <Skeleton className="h-48" />
        ) : !byCategory || byCategory.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("reports.noData")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={byCategory} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="categoryName" tick={{ fill: MUTED_COLOR, fontSize: 11 }} />
                <YAxis tick={{ fill: MUTED_COLOR, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#F9FAFB" }}
                  formatter={(v: number) => [`${SAR} ${fmt(v)}`, t("reports.category.revenue")]}
                />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-0.5">
              {byCategory.map((c, i) => (
                <div key={c.categoryId} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-xs text-foreground">{c.categoryName}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground">{c.itemsSold} {t("reports.category.itemsSold")}</span>
                    <span className="text-sm font-semibold text-foreground">{SAR} {fmt(c.revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* By Weekday */}
      <SectionCard title={t("reports.weekday.title")}>
        {wkLoading ? (
          <Skeleton className="h-48" />
        ) : !byWeekday || byWeekday.every((w) => w.revenue === 0) ? (
          <p className="text-xs text-muted-foreground">{t("reports.noData")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={byWeekday.map((w) => ({ ...w, dayName: weekdayNames[w.dayName] ?? w.dayName }))}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="dayName" tick={{ fill: MUTED_COLOR, fontSize: 11 }} />
              <YAxis tick={{ fill: MUTED_COLOR, fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#F9FAFB" }}
                formatter={(v: number) => [`${SAR} ${fmt(v)}`, t("reports.category.revenue")]}
              />
              <Bar dataKey="revenue" fill={GREEN} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   DAILY TAB
═══════════════════════════════════════════════════════ */
function DailyTab() {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayStr());

  const { data: report, isLoading } = useGetDailyReport({ date });
  const { data: topProducts, isLoading: tpLoading } = useGetTopProducts({ date, limit: 10 });
  const { data: hourly, isLoading: hourlyLoading } = useGetHourlySales({ date });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <Calendar size={15} className="text-muted-foreground" />
        <input
          type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="text-sm bg-card border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary"
        />
        <button
          onClick={() => {
            if (!report) return;
            exportToExcel([{
              Date: date,
              "Total Revenue": report.totalRevenue,
              Orders: report.orderCount,
              "Avg Order Value": report.averageOrderValue,
              "Cash Revenue": report.cashRevenue,
              "Card Revenue": report.cardRevenue,
              Completed: report.completedOrders,
              Cancelled: report.cancelledOrders,
              Tax: report.taxCollected,
              Discounts: report.discountsGiven,
              "Dine In": report.dineInOrders,
              Takeaway: report.takeawayOrders,
              Delivery: report.deliveryOrders,
            }], `daily_${date}`);
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors ms-auto"
        >
          <FileSpreadsheet size={13} /> {t("reports.exportExcel")}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-medium hover:border-primary/50 transition-colors"
        >
          <Printer size={13} /> {t("reports.print")}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard label={t("reports.daily.totalRevenue")} value={`${SAR} ${fmt(report?.totalRevenue ?? 0)}`} icon={DollarSign} color="bg-primary" />
            <KpiCard label={t("reports.daily.orders")} value={String(report?.orderCount ?? 0)} icon={ShoppingCart} color="bg-blue-600" />
            <KpiCard label={t("reports.daily.avgOrder")} value={`${SAR} ${fmt(report?.averageOrderValue ?? 0)}`} icon={ReceiptText} color="bg-indigo-600" />
            <KpiCard label={t("reports.daily.completed")} value={String(report?.completedOrders ?? 0)} icon={Package} color="bg-emerald-600" />
            <KpiCard label={t("reports.daily.cancelled")} value={String(report?.cancelledOrders ?? 0)} icon={AlertTriangle} color="bg-destructive" />
            <KpiCard label={t("reports.daily.tax")} value={`${SAR} ${fmt(report?.taxCollected ?? 0)}`} icon={Percent} color="bg-amber-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SectionCard title={t("reports.daily.paymentSplit")}>
              <StatRow label={t("reports.daily.cash")} value={`${SAR} ${fmt(report?.cashRevenue ?? 0)}`} accent="text-emerald-400" />
              <StatRow label={t("reports.daily.card")} value={`${SAR} ${fmt(report?.cardRevenue ?? 0)}`} accent="text-blue-400" />
              <StatRow label={t("reports.daily.discount")} value={`${SAR} ${fmt(report?.discountsGiven ?? 0)}`} accent="text-amber-400" />
            </SectionCard>

            <SectionCard title={t("reports.daily.orderTypes")}>
              <StatRow label={t("reports.daily.dineIn")} value={String(report?.dineInOrders ?? 0)} />
              <StatRow label={t("reports.daily.takeaway")} value={String(report?.takeawayOrders ?? 0)} />
              <StatRow label={t("reports.daily.delivery")} value={String(report?.deliveryOrders ?? 0)} />
            </SectionCard>

            <SectionCard title={t("reports.topProducts")}>
              {tpLoading ? <Skeleton className="h-32" /> : (topProducts ?? []).slice(0, 5).map((p, i) => (
                <StatRow key={p.productId} label={`${i + 1}. ${p.productName}`} value={`×${p.totalSold}`} />
              ))}
            </SectionCard>
          </div>
        </>
      )}

      <SectionCard title={t("reports.hourlySales")}>
        {hourlyLoading ? <Skeleton className="h-48" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hourly ?? []} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} tick={{ fill: MUTED_COLOR, fontSize: 10 }} />
              <YAxis tick={{ fill: MUTED_COLOR, fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                labelStyle={{ color: "#F9FAFB" }}
                labelFormatter={(h) => `${h}:00`}
                formatter={(v: number) => [`${SAR} ${fmt(v)}`, t("reports.daily.totalRevenue")]}
              />
              <Bar dataKey="revenue" fill={PRIMARY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </SectionCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MONTHLY TAB
═══════════════════════════════════════════════════════ */
function MonthlyTab() {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const { data: report, isLoading, isError, error } = useGetMonthlyReport({ year, month });

  // Pro/Enterprise gating intentionally disabled.

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        <select
          value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="text-sm bg-card border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary"
        >
          {[2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select
          value={month} onChange={(e) => setMonth(Number(e.target.value))}
          className="text-sm bg-card border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {new Date(2000, i).toLocaleString("en-US", { month: "long" })}
            </option>
          ))}
        </select>
        <button
          onClick={() => {
            if (!report?.dailyBreakdown) return;
            exportToExcel(
              report.dailyBreakdown.map((d) => ({
                Date: d.date,
                Revenue: d.totalRevenue,
                Orders: d.orderCount,
                Completed: d.completedOrders,
                Cancelled: d.cancelledOrders,
              })),
              `monthly_${year}_${String(month).padStart(2, "0")}`
            );
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors ms-auto"
        >
          <FileSpreadsheet size={13} /> {t("reports.exportExcel")}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-medium hover:border-primary/50 transition-colors"
        >
          <Printer size={13} /> {t("reports.print")}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label={t("reports.daily.totalRevenue")} value={`${SAR} ${fmt(report?.totalRevenue ?? 0)}`} icon={DollarSign} color="bg-primary" />
            <KpiCard label={t("reports.daily.orders")} value={String(report?.orderCount ?? 0)} icon={ShoppingCart} color="bg-blue-600" />
            <KpiCard label={t("reports.daily.avgOrder")} value={`${SAR} ${fmt(report?.averageOrderValue ?? 0)}`} icon={ReceiptText} color="bg-indigo-600" />
            <KpiCard label={t("reports.daily.cancelled")} value={String(report?.cancelledOrders ?? 0)} icon={AlertTriangle} color="bg-destructive" />
          </div>

          <SectionCard title={t("reports.monthly.dailyRevenue")}>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={report?.dailyBreakdown ?? []} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tickFormatter={(d) => d.split("-")[2]} tick={{ fill: MUTED_COLOR, fontSize: 10 }} />
                <YAxis tick={{ fill: MUTED_COLOR, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#F9FAFB" }}
                  formatter={(v: number) => [`${SAR} ${fmt(v)}`, t("reports.daily.totalRevenue")]}
                />
                <Line type="monotone" dataKey="totalRevenue" stroke={PRIMARY} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard title={t("reports.topProducts")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {(report?.topProducts ?? []).map((p, i) => (
                <StatRow
                  key={p.productId}
                  label={`${i + 1}. ${p.productName}`}
                  value={`×${p.totalSold} · ${SAR} ${fmt(p.totalRevenue)}`}
                />
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   YEARLY TAB
═══════════════════════════════════════════════════════ */
function YearlyTab() {
  const { t } = useTranslation();
  const [year, setYear] = useState(new Date().getFullYear());

  const { data: report, isLoading, isError, error } = useGetYearlyReport({ year });
  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Pro/Enterprise gating intentionally disabled.

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3 print:hidden">
        <select
          value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="text-sm bg-card border border-border rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary"
        >
          {[2023, 2024, 2025, 2026].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={() => {
            if (!report?.monthlyBreakdown) return;
            exportToExcel(
              report.monthlyBreakdown.map((m) => ({
                Month: MONTH_NAMES[m.month - 1],
                Revenue: m.totalRevenue,
                Orders: m.orderCount,
                Completed: m.completedOrders,
                Cancelled: m.cancelledOrders,
              })),
              `yearly_${year}`
            );
          }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors ms-auto"
        >
          <FileSpreadsheet size={13} /> {t("reports.exportExcel")}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-foreground text-xs font-medium hover:border-primary/50 transition-colors"
        >
          <Printer size={13} /> {t("reports.print")}
        </button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard label={t("reports.daily.totalRevenue")} value={`${SAR} ${fmt(report?.totalRevenue ?? 0)}`} icon={DollarSign} color="bg-primary" />
            <KpiCard label={t("reports.daily.orders")} value={String(report?.orderCount ?? 0)} icon={ShoppingCart} color="bg-blue-600" />
            <KpiCard label={t("reports.daily.avgOrder")} value={`${SAR} ${fmt(report?.averageOrderValue ?? 0)}`} icon={ReceiptText} color="bg-indigo-600" />
            <KpiCard label={t("reports.daily.cancelled")} value={String(report?.cancelledOrders ?? 0)} icon={AlertTriangle} color="bg-destructive" />
          </div>

          <SectionCard title={t("reports.yearly.monthlyRevenue")}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={(report?.monthlyBreakdown ?? []).map((m) => ({
                  ...m,
                  name: MONTH_NAMES[m.month - 1],
                }))}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill: MUTED_COLOR, fontSize: 11 }} />
                <YAxis tick={{ fill: MUTED_COLOR, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                  labelStyle={{ color: "#F9FAFB" }}
                  formatter={(v: number) => [`${SAR} ${fmt(v)}`, t("reports.daily.totalRevenue")]}
                />
                <Bar dataKey="totalRevenue" fill={PRIMARY} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </SectionCard>

          <SectionCard title={t("reports.topProducts")}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
              {(report?.topProducts ?? []).map((p, i) => (
                <StatRow
                  key={p.productId}
                  label={`${i + 1}. ${p.productName}`}
                  value={`×${p.totalSold} · ${SAR} ${fmt(p.totalRevenue)}`}
                />
              ))}
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   INVOICES TAB
═══════════════════════════════════════════════════════ */
const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  preparing: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  ready: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  completed: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  cancelled: "bg-red-500/20 text-red-300 border-red-500/30",
};
const ORDER_TYPE_ICON: Record<string, string> = { dine_in: "🍽", takeaway: "🛍", delivery: "🚚" };

function InvoicesTab() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDate, setFilterDate] = useState("");
  const [viewInvoice, setViewInvoice] = useState<InvoiceData | null>(null);

  const { data: orders, isLoading } = useListOrders(filterDate ? { date: filterDate } : {});

  const filtered = (orders ?? []).filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (filterType && o.type !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!o.orderNumber.toLowerCase().includes(q) && !String(o.id).includes(q)) return false;
    }
    return true;
  });

  const totalRevenue = filtered.reduce((s, o) => s + (o.total ?? 0), 0);
  const totalTax = filtered.reduce((s, o) => s + (o.tax ?? 0), 0);

  const openInvoice = (order: (typeof filtered)[number]) => {
    setViewInvoice({
      orderId: order.id,
      orderType: order.type as "dine_in" | "takeaway" | "delivery",
      tableNumber: order.tableNumber != null ? Number(order.tableNumber) : null,
      items: (order.items ?? []).map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      subtotal: order.subtotal ?? 0,
      discount: order.discount ?? 0,
      tax: order.tax ?? 0,
      total: order.total ?? 0,
      paymentMethod: order.paymentMethod ?? "cash",
      createdAt: order.createdAt,
      generalNote: order.notes ?? undefined,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: isAr ? "إجمالي الفواتير" : "Total Invoices",  value: String(filtered.length), icon: "🧾" },
          { label: isAr ? "الإيرادات" : "Revenue",                value: `${SAR} ${fmt(totalRevenue)}`, icon: "💰" },
          { label: isAr ? "الضريبة المحصلة" : "Tax Collected",   value: `${SAR} ${fmt(totalTax)}`, icon: "📊" },
          { label: isAr ? "متوسط قيمة الفاتورة" : "Avg Invoice", value: `${SAR} ${fmt(filtered.length ? totalRevenue / filtered.length : 0)}`, icon: "📈" },
        ].map((c) => (
          <div key={c.label} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
            <span className="text-2xl">{c.icon}</span>
            <div>
              <p className="text-xs text-muted-foreground">{c.label}</p>
              <p className="text-base font-bold text-foreground">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder={isAr ? "بحث برقم الطلب..." : "Search by order #..."}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="h-8 px-3 rounded-xl bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-44"
        />
        <input
          type="date"
          value={filterDate}
          onChange={(e) => setFilterDate(e.target.value)}
          className="h-8 px-2 rounded-xl bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="h-8 px-2 rounded-xl bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">{isAr ? "كل الحالات" : "All Statuses"}</option>
          {["pending","preparing","ready","completed","cancelled"].map((s) => (
            <option key={s} value={s}>{t(`kitchen.statuses.${s === "preparing" ? "in_progress" : s}`)}</option>
          ))}
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="h-8 px-2 rounded-xl bg-card border border-border text-sm text-foreground focus:outline-none focus:border-primary"
        >
          <option value="">{isAr ? "كل الأنواع" : "All Types"}</option>
          <option value="dine_in">{t("pos.orderType.dine_in")}</option>
          <option value="takeaway">{t("pos.orderType.takeaway")}</option>
          <option value="delivery">{t("pos.orderType.delivery")}</option>
        </select>
        {(searchQuery || filterStatus || filterType || filterDate) && (
          <button
            onClick={() => { setSearchQuery(""); setFilterStatus(""); setFilterType(""); setFilterDate(""); }}
            className="h-8 px-3 rounded-xl bg-red-500/15 text-red-400 border border-red-500/30 text-xs font-medium hover:bg-red-500/25 transition-colors"
          >
            {isAr ? "مسح الفلاتر" : "Clear filters"}
          </button>
        )}
        <button
          onClick={() => {
            exportToExcel(
              filtered.map((o) => ({
                "#": o.id,
                "Order #": o.orderNumber,
                Type: o.type,
                Status: o.status,
                Subtotal: o.subtotal,
                Discount: o.discount,
                Tax: o.tax,
                Total: o.total,
                "Payment": o.paymentMethod ?? "",
                Date: o.createdAt,
              })),
              `invoices_${new Date().toISOString().slice(0, 10)}`
            );
          }}
          className="ms-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-medium transition-colors"
        >
          <FileSpreadsheet size={13} /> {t("reports.exportExcel")}
        </button>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <ReceiptText size={32} className="mb-2 opacity-20" />
            <p className="text-sm">{t("reports.noData")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "رقم الطلب" : "Order #"}</th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "النوع" : "Type"}</th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "الحالة" : "Status"}</th>
                  <th className="px-4 py-3 text-end font-medium">{isAr ? "الإجمالي" : "Total"}</th>
                  <th className="px-4 py-3 text-end font-medium">{isAr ? "الضريبة" : "Tax"}</th>
                  <th className="px-4 py-3 text-end font-medium">{isAr ? "الخصم" : "Disc."}</th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "الدفع" : "Payment"}</th>
                  <th className="px-4 py-3 text-start font-medium">{isAr ? "التاريخ" : "Date"}</th>
                  <th className="px-4 py-3 text-center font-medium">{isAr ? "فاتورة" : "Invoice"}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr key={order.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-foreground">{order.orderNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {ORDER_TYPE_ICON[order.type] ?? "?"} {t(`pos.orderType.${order.type}`)}
                      {order.tableNumber && <span className="ms-1 text-xs">·T{order.tableNumber}</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${ORDER_STATUS_COLORS[order.status] ?? "bg-gray-500/20 text-gray-300"}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-end font-bold text-primary">{SAR} {fmt(order.total ?? 0)}</td>
                    <td className="px-4 py-3 text-end text-muted-foreground">{SAR} {fmt(order.tax ?? 0)}</td>
                    <td className="px-4 py-3 text-end text-red-400">
                      {(order.discount ?? 0) > 0 ? `-${SAR} ${fmt(order.discount ?? 0)}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {order.paymentMethod ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {new Date(order.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US", { dateStyle: "short", timeStyle: "short" })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => openInvoice(order)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/15 text-primary border border-primary/30 text-xs font-medium hover:bg-primary/25 transition-colors"
                      >
                        <ReceiptText size={11} />
                        {isAr ? "فاتورة" : "View"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewInvoice && <InvoiceModal data={viewInvoice} onClose={() => setViewInvoice(null)} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   INVENTORY & WASTE TAB (for Reports → Inventory section)
═══════════════════════════════════════════════════════ */
const WASTE_REASON_LABELS: Record<string, { en: string; ar: string }> = {
  spoilage:   { en: "Spoilage",       ar: "تلف" },
  burning:    { en: "Burning",        ar: "احتراق" },
  expiry:     { en: "Expiry",         ar: "انتهاء صلاحية" },
  prep_error: { en: "Prep Error",     ar: "خطأ في التحضير" },
  theft:      { en: "Theft",          ar: "سرقة" },
  other:      { en: "Other",          ar: "أخرى" },
};

function InventoryWasteTab() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [range, setRange] = useState<"today" | "week" | "month">("month");

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const from =
    range === "today"
      ? today
      : range === "week"
      ? new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0]
      : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split("T")[0];

  const { data: analytics, isLoading: aLoading } = useGetWasteAnalytics({ from, to: today });
  const { data: inventory, isLoading: invLoading } = useListInventory({});

  const lowStock = inventory?.filter((i) => i.isLowStock) ?? [];
  const byReason = analytics?.byReason ?? {};
  const topItems = analytics?.topWastedItems ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Range */}
      <div className="flex gap-1 p-1 bg-card border border-border rounded-xl w-fit print:hidden">
        {(["today", "week", "month"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              range === r ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r === "today" ? (isAr ? "اليوم" : "Today") : r === "week" ? (isAr ? "أسبوع" : "This Week") : (isAr ? "هذا الشهر" : "This Month")}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {aLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard
            label={isAr ? "تكلفة الهدر" : "Waste Cost"}
            value={`${SAR} ${fmt(analytics?.totalWasteCost ?? 0)}`}
            icon={Trash2} color="bg-red-600"
          />
          <KpiCard
            label={isAr ? "إدخالات الهدر" : "Waste Entries"}
            value={String(analytics?.totalEntries ?? 0)}
            icon={Package} color="bg-orange-600"
          />
          <KpiCard
            label={isAr ? "عناصر المخزون" : "Inventory Items"}
            value={String(inventory?.length ?? 0)}
            icon={Boxes} color="bg-blue-600"
          />
          <KpiCard
            label={isAr ? "مخزون منخفض" : "Low Stock Items"}
            value={String(lowStock.length)}
            icon={AlertTriangle} color={lowStock.length > 0 ? "bg-destructive" : "bg-emerald-600"}
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top wasted items */}
        <SectionCard title={isAr ? "أكثر الأصناف هدراً" : "Top Wasted Items"}>
          {aLoading ? (
            <Skeleton className="h-40" />
          ) : topItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Trash2 size={24} className="mb-2 opacity-20" />
              <p className="text-xs">{isAr ? "لا توجد بيانات هدر" : "No waste data"}</p>
            </div>
          ) : (
            topItems.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold flex items-center justify-center">{idx + 1}</span>
                  <span className="text-xs text-foreground">{item.inventoryName}</span>
                </div>
                <div className="text-end">
                  <span className="text-xs font-bold text-red-400">{item.totalWasted.toFixed(2)} {item.unit}</span>
                  {item.totalCost > 0 && (
                    <span className="block text-[10px] text-muted-foreground">{SAR} {item.totalCost.toFixed(2)}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </SectionCard>

        {/* Waste by reason */}
        <SectionCard title={isAr ? "الهدر حسب السبب" : "Waste by Reason"}>
          {aLoading ? (
            <Skeleton className="h-40" />
          ) : Object.keys(byReason).length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <BarChart3 size={24} className="mb-2 opacity-20" />
              <p className="text-xs">{isAr ? "لا توجد بيانات" : "No data"}</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={Object.entries(byReason).map(([reason, cost]) => ({
                  reason: isAr ? (WASTE_REASON_LABELS[reason]?.ar ?? reason) : (WASTE_REASON_LABELS[reason]?.en ?? reason),
                  cost: cost as number,
                }))} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="reason" tick={{ fill: MUTED_COLOR, fontSize: 9 }} />
                  <YAxis tick={{ fill: MUTED_COLOR, fontSize: 9 }} />
                  <Tooltip
                    contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8 }}
                    formatter={(v: number) => [`${SAR} ${fmt(v)}`, isAr ? "التكلفة" : "Cost"]}
                  />
                  <Bar dataKey="cost" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {Object.entries(byReason).map(([reason, cost]) => (
                  <StatRow
                    key={reason}
                    label={isAr ? (WASTE_REASON_LABELS[reason]?.ar ?? reason) : (WASTE_REASON_LABELS[reason]?.en ?? reason)}
                    value={`${SAR} ${fmt(cost as number)}`}
                    accent="text-red-400"
                  />
                ))}
              </div>
            </>
          )}
        </SectionCard>
      </div>

      {/* Low stock items */}
      {lowStock.length > 0 && (
        <SectionCard title={isAr ? "تنبيهات المخزون المنخفض" : "Low Stock Alerts"}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {lowStock.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={12} className="text-destructive" />
                  <span className="text-xs font-medium text-foreground">{item.name}</span>
                </div>
                <span className="text-xs text-destructive font-bold">
                  {item.quantity} / {item.lowStockThreshold} {item.unit}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   AMENDMENTS TAB
═══════════════════════════════════════════════════════ */
interface Amendment {
  id: number;
  orderId: number;
  orderNumber: string;
  type: string;
  reason: string;
  customerName: string;
  customerPhone?: string | null;
  cashierName: string;
  cashierRole?: string | null;
  amountBefore?: number | null;
  amountAfter?: number | null;
  discountAmount?: number | null;
  printed: string;
  printedAt?: string | null;
  createdAt: string;
}

const AMENDMENT_TYPE_META: Record<string, { labelEn: string; labelAr: string; colorCls: string; icon: React.ElementType }> = {
  cancel:   { labelEn: "Cancel",   labelAr: "إلغاء",   colorCls: "bg-red-500/10 text-red-400 border-red-500/20",     icon: Ban },
  discount: { labelEn: "Discount", labelAr: "خصم",     colorCls: "bg-primary/10 text-primary border-primary/20",     icon: Tag },
  return:   { labelEn: "Return",   labelAr: "مرتجع",   colorCls: "bg-amber-500/10 text-amber-400 border-amber-500/20", icon: RotateCcw },
  edit:     { labelEn: "Edit",     labelAr: "تعديل",   colorCls: "bg-blue-500/10 text-blue-400 border-blue-500/20",  icon: FileEdit },
};

function AmendmentsTab() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { getToken } = useAuth();
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterDate, setFilterDate] = useState("");
  const [filterType, setFilterType] = useState("");
  const [search, setSearch] = useState("");

  const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

  const fetchAmendments = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (filterDate) { params.set("from", filterDate); params.set("to", filterDate); }
      if (filterType) params.set("type", filterType);
      const res = await fetch(`${BASE}/api/amendments?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAmendments(await res.json() as Amendment[]);
    } finally {
      setLoading(false);
    }
  }, [getToken, filterDate, filterType, BASE]);

  // Fetch on mount and whenever filters change
  useState(() => { void fetchAmendments(); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [_tick, setTick] = useState(0);
  const doFetch = () => { setTick(v => v + 1); void fetchAmendments(); };

  const filtered = amendments.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return a.orderNumber.toLowerCase().includes(q) ||
      a.customerName.toLowerCase().includes(q) ||
      a.cashierName.toLowerCase().includes(q) ||
      a.reason.toLowerCase().includes(q);
  });

  const counts = {
    total: filtered.length,
    cancel: filtered.filter(a => a.type === "cancel").length,
    discount: filtered.filter(a => a.type === "discount").length,
    return: filtered.filter(a => a.type === "return").length,
    edit: filtered.filter(a => a.type === "edit").length,
  };

  const fmt = (n?: number | null) => n != null ? n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";

  return (
    <div className="flex flex-col gap-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: isAr ? "إجمالي التعديلات" : "Total Amendments", value: String(counts.total), colorCls: "text-foreground", icon: FileEdit },
          { label: isAr ? "إلغاءات" : "Cancels",  value: String(counts.cancel),   colorCls: "text-red-400",    icon: Ban },
          { label: isAr ? "خصومات" : "Discounts", value: String(counts.discount), colorCls: "text-primary",    icon: Tag },
          { label: isAr ? "مرتجعات" : "Returns",  value: String(counts.return),   colorCls: "text-amber-400",  icon: RotateCcw },
          { label: isAr ? "تعديلات" : "Edits",    value: String(counts.edit),     colorCls: "text-blue-400",   icon: FileEdit },
        ].map(({ label, value, colorCls, icon: Icon }) => (
          <div key={label} className="bg-card border border-border rounded-2xl p-4 flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-muted-foreground text-xs">
              <Icon size={12} /> {label}
            </div>
            <p className={`text-2xl font-bold ${colorCls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full h-9 rounded-xl border border-border bg-background text-sm ps-8 pe-3 outline-none"
            placeholder={isAr ? "بحث برقم الطلب أو العميل أو الكاشير..." : "Search by order, customer, cashier..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            dir={isAr ? "rtl" : "ltr"}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter size={13} className="text-muted-foreground" />
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background text-xs px-3 outline-none"
          >
            <option value="">{isAr ? "كل الأنواع" : "All types"}</option>
            <option value="cancel">{isAr ? "إلغاء" : "Cancel"}</option>
            <option value="discount">{isAr ? "خصم" : "Discount"}</option>
            <option value="return">{isAr ? "مرتجع" : "Return"}</option>
            <option value="edit">{isAr ? "تعديل" : "Edit"}</option>
          </select>
          <input
            type="date"
            value={filterDate}
            onChange={e => setFilterDate(e.target.value)}
            className="h-9 rounded-xl border border-border bg-background text-xs px-3 outline-none"
          />
          <button
            onClick={doFetch}
            className="h-9 px-4 rounded-xl bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            {loading ? "..." : (isAr ? "تحديث" : "Refresh")}
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 rounded-xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
          <FileEdit size={40} className="opacity-20" />
          <p className="text-sm">{isAr ? "لا توجد تعديلات مسجّلة" : "No amendments recorded"}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-card border-b border-border">
                <tr className="text-xs text-muted-foreground">
                  {[
                    isAr ? "رقم الفاتورة" : "Invoice #",
                    isAr ? "النوع" : "Type",
                    isAr ? "السبب" : "Reason",
                    isAr ? "الكاشير" : "Cashier",
                    isAr ? "العميل" : "Customer",
                    isAr ? "قبل" : "Before",
                    isAr ? "بعد" : "After",
                    isAr ? "التاريخ" : "Date",
                    isAr ? "الطباعة" : "Printed",
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-start font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(a => {
                  const meta = AMENDMENT_TYPE_META[a.type] ?? AMENDMENT_TYPE_META["edit"]!;
                  const Icon = meta.icon;
                  return (
                    <tr key={a.id} className="bg-background hover:bg-card/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold">#{a.orderNumber}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${meta.colorCls}`}>
                          <Icon size={10} />
                          {isAr ? meta.labelAr : meta.labelEn}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[180px]">
                        <span className="truncate block" title={a.reason}>{a.reason}</span>
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{a.cashierName}</div>
                        {a.cashierRole && <div className="text-muted-foreground capitalize">{a.cashierRole.replace(/_/g, " ")}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div>{a.customerName}</div>
                        {a.customerPhone && <div className="text-muted-foreground" dir="ltr">{a.customerPhone}</div>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">{fmt(a.amountBefore as number | null)}</td>
                      <td className="px-4 py-3 text-xs font-mono">{fmt(a.amountAfter as number | null)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleString(isAr ? "ar-SA" : "en-US", { dateStyle: "short", timeStyle: "short" })}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {a.printed === "yes" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400">
                            <Printer size={10} /> {isAr ? "✓ مطبوع" : "✓ Yes"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">{isAr ? "لا" : "No"}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   SECTIONS + MAIN PAGE
═══════════════════════════════════════════════════════ */
const SECTIONS = ["sales", "inventory_waste", "financial", "amendments"] as const;
type Section = typeof SECTIONS[number];

const SALES_TABS = ["kpi", "daily", "monthly", "yearly"] as const;
type SalesTab = typeof SALES_TABS[number];

const SECTION_ICONS: Record<Section, typeof BarChart3> = {
  sales: TrendingUp,
  inventory_waste: Boxes,
  financial: ReceiptText,
  amendments: FileEdit,
};

export default function ReportsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [section, setSection] = useState<Section>("sales");
  const [salesTab, setSalesTab] = useState<SalesTab>("kpi");

  const [activePreset, setActivePreset] = useState<string>("thisMonth");
  const [from, setFrom] = useState(() => presetRange("thisMonth").from);
  const [to, setTo] = useState(() => presetRange("thisMonth").to);

  const handlePreset = useCallback((p: string) => {
    if (!p) return;
    setActivePreset(p);
    const r = presetRange(p);
    setFrom(r.from);
    setTo(r.to);
  }, []);

  const { data: stats } = useGetDashboardStats();

  const sectionLabels: Record<Section, string> = {
    sales: isAr ? "المبيعات" : "Sales",
    inventory_waste: isAr ? "المخزون والهدر" : "Inventory & Waste",
    financial: isAr ? "المالية" : "Financial",
    amendments: isAr ? "سجل التعديلات" : "Amendment Log",
  };

  const salesTabLabels: Record<SalesTab, string> = {
    kpi: t("reports.tabs.kpi"),
    daily: t("reports.tabs.daily"),
    monthly: t("reports.tabs.monthly"),
    yearly: t("reports.tabs.yearly"),
  };

  return (
    <div className="flex flex-col gap-6 p-6 print:p-4 h-full overflow-y-auto scrollbar-none bg-background">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/15 flex items-center justify-center print:hidden">
          <BarChart3 size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground print:text-black">{t("reports.title")}</h1>
          <p className="text-xs text-muted-foreground print:text-gray-500">{new Date().toLocaleDateString()}</p>
        </div>
      </div>

      {/* Smart Alerts */}
      <AlertStrip stats={stats} />

      {/* Section switcher */}
      <div className="flex gap-2 p-1.5 bg-card border border-border rounded-2xl w-fit print:hidden">
        {SECTIONS.map((s) => {
          const Icon = SECTION_ICONS[s];
          return (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                section === s
                  ? s === "inventory_waste"
                    ? "bg-orange-600 text-white shadow-sm"
                    : s === "financial"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-primary text-white shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              {sectionLabels[s]}
            </button>
          );
        })}
      </div>

      {/* ── SALES SECTION ── */}
      {section === "sales" && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-1 p-1 bg-card border border-border rounded-xl w-fit print:hidden">
            {SALES_TABS.map((tab_) => (
              <button
                key={tab_}
                onClick={() => setSalesTab(tab_)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  salesTab === tab_
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {salesTabLabels[tab_]}
              </button>
            ))}
          </div>

          {/* Date range presets — KPI sub-tab only */}
          {salesTab === "kpi" && (
            <DateRangeBar
              from={from} to={to}
              onFromChange={setFrom} onToChange={setTo}
              activePreset={activePreset} onPreset={handlePreset}
            />
          )}

          {salesTab === "kpi" && <KpiTab from={from} to={to} />}
          {salesTab === "daily" && <DailyTab />}
          {salesTab === "monthly" && <MonthlyTab />}
          {salesTab === "yearly" && <YearlyTab />}
        </>
      )}

      {/* ── INVENTORY & WASTE SECTION ── */}
      {section === "inventory_waste" && <InventoryWasteTab />}

      {/* ── FINANCIAL SECTION ── */}
      {section === "financial" && <InvoicesTab />}

      {/* ── AMENDMENTS SECTION ── */}
      {section === "amendments" && <AmendmentsTab />}
    </div>
  );
}
