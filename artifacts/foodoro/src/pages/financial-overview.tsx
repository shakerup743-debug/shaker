import { useState } from "react";
import { motion } from "framer-motion";
import {
  DollarSign, TrendingUp, TrendingDown, Receipt, PiggyBank,
  BarChart3, Calendar, Download, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/contexts/currency";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";

interface DashboardStats {
  todayRevenue?: number;
  yesterdayRevenue?: number;
  todayOrders?: number;
  monthRevenue?: number;
  taxRate?: number;
}

interface DailyRevenue {
  date: string;
  revenue: number;
  orders: number;
  tax: number;
  avgOrderValue: number;
}

const EXPENSE_CATEGORIES = [
  { nameEn: "Cost of Goods", nameAr: "تكلفة البضائع", pct: 35, color: "#E67E22" },
  { nameEn: "Labor",         nameAr: "الرواتب",         pct: 28, color: "#3B82F6" },
  { nameEn: "Rent",          nameAr: "الإيجار",         pct: 12, color: "#10B981" },
  { nameEn: "Utilities",     nameAr: "المرافق",         pct: 6,  color: "#F59E0B" },
  { nameEn: "Marketing",     nameAr: "التسويق",         pct: 4,  color: "#8B5CF6" },
  { nameEn: "Other",         nameAr: "أخرى",            pct: 15, color: "#6B7280" },
];

function KpiCard({ label, value, trend, icon: Icon, color, sub }: {
  label: string; value: string; trend?: number; icon: React.ElementType; color: string; sub?: string;
}) {
  const isUp = (trend ?? 0) >= 0;
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-2xl bg-card border border-border">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "18" }}>
          <Icon size={16} style={{ color }} />
        </div>
        {trend !== undefined && (
          <span className={`flex items-center gap-1 text-[11px] font-semibold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
            {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {Math.abs(trend).toFixed(1)}%
          </span>
        )}
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</p>}
    </motion.div>
  );
}

export default function FinancialOverviewPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { format } = useCurrency();
  const [period, setPeriod] = useState<"today" | "week" | "month">("today");

  const today = new Date().toISOString().split("T")[0]!;

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/reports/dashboard"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/reports/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return {};
      return res.json() as Promise<DashboardStats>;
    },
  });

  const { data: daily = [], isLoading: dailyLoading } = useQuery<DailyRevenue[]>({
    queryKey: ["/api/reports/daily", { date: today }],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/reports/daily?date=${today}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const data = await res.json() as DailyRevenue[] | DailyRevenue;
      return Array.isArray(data) ? data : [data];
    },
  });

  const TAX_RATE = 0.15;
  const todayRev = Number(stats?.todayRevenue ?? 0);
  const todayTax = todayRev * TAX_RATE;
  const todayNet = todayRev - todayTax;
  const yesterdayRev = Number(stats?.yesterdayRevenue ?? 0);
  const revTrend = yesterdayRev > 0 ? ((todayRev - yesterdayRev) / yesterdayRev) * 100 : undefined;

  const COGS_RATE = 0.35;
  const grossProfit = todayNet - (todayNet * COGS_RATE);
  const grossMargin = todayNet > 0 ? (grossProfit / todayNet) * 100 : 0;

  // Build expense breakdown from today's data
  const expenseData = EXPENSE_CATEGORIES.map(e => ({
    ...e,
    amount: todayNet * (e.pct / 100),
  }));

  // 7-day trend from daily data (use daily as last point)
  const trendData = daily.length > 0 ? daily.map(d => ({
    label: new Date(d.date).toLocaleDateString(isAr ? "ar-SA" : "en-US", { weekday: "short" }),
    revenue: d.revenue,
    profit: d.revenue * (1 - TAX_RATE) * (1 - COGS_RATE),
  })) : Array.from({ length: 7 }, (_, i) => ({
    label: ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"][i]!,
    revenue: 0,
    profit: 0,
  }));

  const PERIOD_OPTIONS = [
    { value: "today", labelEn: "Today", labelAr: "اليوم" },
    { value: "week",  labelEn: "Week",  labelAr: "الأسبوع" },
    { value: "month", labelEn: "Month", labelAr: "الشهر" },
  ] as const;

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <DollarSign size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "النظرة المالية" : "Financial Overview"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "الإيرادات والأرباح والضرائب" : "Revenue, profit & tax breakdown"}</p>
          </div>
        </div>
        <div className="flex gap-1 p-0.5 rounded-xl bg-card border border-border">
          {PERIOD_OPTIONS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${period === p.value ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
              {isAr ? p.labelAr : p.labelEn}
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid */}
      {statsLoading ? (
        <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <KpiCard icon={TrendingUp}   color="#E67E22" label={isAr ? "الإيرادات الإجمالية" : "Gross Revenue"}  value={format(todayRev)} trend={revTrend} sub={isAr ? `أمس: ${format(yesterdayRev)}` : `Yesterday: ${format(yesterdayRev)}`} />
          <KpiCard icon={Receipt}      color="#F59E0B" label={isAr ? "ضريبة القيمة المضافة 15%" : "VAT (15%)"}   value={format(todayTax)} sub={isAr ? "المستحق للهيئة" : "Due to authority"} />
          <KpiCard icon={DollarSign}   color="#10B981" label={isAr ? "صافي الإيرادات" : "Net Revenue"}          value={format(todayNet)} />
          <KpiCard icon={PiggyBank}    color="#8B5CF6" label={isAr ? "الربح الإجمالي" : "Gross Profit"}         value={format(grossProfit)} sub={isAr ? `هامش: ${grossMargin.toFixed(1)}%` : `Margin: ${grossMargin.toFixed(1)}%`} />
        </div>
      )}

      {/* Revenue vs profit chart */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">{isAr ? "الإيرادات والأرباح" : "Revenue vs Profit"}</h3>
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
            <Download size={12} />{isAr ? "تصدير" : "Export"}
          </button>
        </div>
        {dailyLoading ? <Skeleton className="h-44" /> : (
          <ResponsiveContainer width="100%" height={176}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="revGradF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E67E22" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#E67E22" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profGradF" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fill: "#6B7280", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} />
              <ReTooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: "#F9FAFB" }} />
              <Area type="monotone" dataKey="revenue" stroke="#E67E22" strokeWidth={2} fill="url(#revGradF)"
                name={isAr ? "الإيرادات" : "Revenue"} />
              <Area type="monotone" dataKey="profit" stroke="#10B981" strokeWidth={2} fill="url(#profGradF)"
                name={isAr ? "الأرباح" : "Profit"} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* P&L table */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3">{isAr ? "قائمة الدخل المبسطة" : "Simplified P&L Statement"}</h3>
        <div className="space-y-2">
          {[
            { label: isAr ? "إجمالي الإيرادات" : "Total Revenue",     value: todayRev,   type: "revenue" as const },
            { label: isAr ? "ضريبة القيمة المضافة" : "Less: VAT",      value: -todayTax,  type: "deduct" as const },
            { label: isAr ? "صافي الإيرادات" : "Net Revenue",          value: todayNet,   type: "subtotal" as const },
            { label: isAr ? "تكلفة البضائع المباعة" : "COGS (est.)",   value: -(todayNet * COGS_RATE), type: "deduct" as const },
            { label: isAr ? "الربح الإجمالي" : "Gross Profit",          value: grossProfit, type: "total" as const },
          ].map(({ label, value, type }) => (
            <div key={label} className={`flex items-center justify-between py-2 ${type === "subtotal" || type === "total" ? "border-t border-border mt-1 pt-3" : ""}`}>
              <span className={`text-xs ${type === "total" ? "font-bold text-foreground" : type === "subtotal" ? "font-semibold text-foreground" : "text-muted-foreground"}`}>{label}</span>
              <span className={`text-sm font-bold ${value >= 0 ? "text-emerald-400" : "text-red-400"} ${type === "total" ? "text-base" : ""}`}>
                {value < 0 ? `(${format(Math.abs(value))})` : format(value)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Expense breakdown */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3">{isAr ? "توزيع المصروفات (تقديري)" : "Expense Breakdown (estimated)"}</h3>
        <div className="space-y-2.5">
          {expenseData.map(e => (
            <div key={e.nameEn} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: e.color }} />
              <p className="text-xs text-muted-foreground flex-1">{isAr ? e.nameAr : e.nameEn}</p>
              <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${e.pct}%`, backgroundColor: e.color }} />
              </div>
              <span className="text-xs text-muted-foreground w-8 text-end">{e.pct}%</span>
              <span className="text-xs font-semibold text-foreground w-20 text-end">{format(e.amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
