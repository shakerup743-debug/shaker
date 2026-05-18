import { useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, DollarSign, Receipt, BarChart2,
  Calendar, Download, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/contexts/currency";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, LineChart, Line, Area, AreaChart, Legend,
} from "recharts";

interface MonthlyData {
  month: string;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  orderCount: number;
  taxCollected: number;
}

interface FinancialSummary {
  period: string;
  totalRevenue: number;
  totalCogs: number;
  grossProfit: number;
  grossMarginPct: number;
  totalTaxCollected: number;
  totalOrders: number;
  avgOrderValue: number;
  monthly: MonthlyData[];
  vatSummary: { taxable: number; vatAmount: number; totalWithVat: number };
}

const MONTH_LABELS: Record<string, { en: string; ar: string }> = {
  "1": { en: "Jan", ar: "يناير" }, "2": { en: "Feb", ar: "فبراير" },
  "3": { en: "Mar", ar: "مارس" }, "4": { en: "Apr", ar: "أبريل" },
  "5": { en: "May", ar: "مايو" }, "6": { en: "Jun", ar: "يونيو" },
  "7": { en: "Jul", ar: "يوليو" }, "8": { en: "Aug", ar: "أغسطس" },
  "9": { en: "Sep", ar: "سبتمبر" }, "10": { en: "Oct", ar: "أكتوبر" },
  "11": { en: "Nov", ar: "نوفمبر" }, "12": { en: "Dec", ar: "ديسمبر" },
};

export default function FinancialsPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { currency } = useCurrency();
  const [year, setYear] = useState(new Date().getFullYear());

  const fmt = (v: number) => `${currency.symbol}${v.toLocaleString("en-SA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const fmtPct = (v: number) => `${v.toFixed(1)}%`;

  const { data, isLoading } = useQuery<FinancialSummary>({
    queryKey: ["financials", year],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/ai/financial-summary?year=${year}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<FinancialSummary>;
    },
  });

  const chartData = (data?.monthly ?? []).map(m => ({
    name: isAr ? (MONTH_LABELS[m.month]?.ar ?? m.month) : (MONTH_LABELS[m.month]?.en ?? m.month),
    revenue: m.revenue,
    grossProfit: m.grossProfit,
    tax: m.taxCollected,
    orders: m.orderCount,
    margin: m.grossMargin,
  }));

  const kpis = data ? [
    { label: isAr ? "إجمالي الإيرادات" : "Total Revenue", value: fmt(data.totalRevenue), icon: DollarSign, color: "text-primary bg-primary/10 border-primary/20", trend: null },
    { label: isAr ? "إجمالي الأرباح" : "Gross Profit", value: fmt(data.grossProfit), icon: TrendingUp, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", trend: `${fmtPct(data.grossMarginPct)} margin` },
    { label: isAr ? "ضريبة القيمة المضافة" : "VAT Collected", value: fmt(data.totalTaxCollected), icon: Receipt, color: "text-amber-400 bg-amber-400/10 border-amber-400/20", trend: "15% rate" },
    { label: isAr ? "متوسط قيمة الطلب" : "Avg Order Value", value: fmt(data.avgOrderValue), icon: BarChart2, color: "text-blue-400 bg-blue-400/10 border-blue-400/20", trend: `${data.totalOrders} orders` },
  ] : [];

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart2 size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "التقارير المالية" : "Financial Reports"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "الأرباح والخسائر والضريبة" : "P&L, Cash Flow & VAT"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-card border border-border rounded-xl overflow-hidden">
            <button onClick={() => setYear(y => y - 1)} className="h-9 px-3 text-muted-foreground hover:text-foreground text-sm">‹</button>
            <span className="h-9 px-3 flex items-center text-sm font-semibold text-foreground border-x border-border">{year}</span>
            <button onClick={() => setYear(y => y + 1)} disabled={year >= new Date().getFullYear()} className="h-9 px-3 text-muted-foreground hover:text-foreground text-sm disabled:opacity-30">›</button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />
          ))
        ) : (
          kpis.map((k, i) => {
            const Icon = k.icon;
            return (
              <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className={`p-4 rounded-2xl border ${k.color}`}>
                <div className="flex items-center justify-between mb-2">
                  <Icon size={16} />
                  {k.trend && <span className="text-[10px] opacity-70">{k.trend}</span>}
                </div>
                <p className="text-xl font-bold">{k.value}</p>
                <p className="text-[11px] opacity-70 mt-0.5">{k.label}</p>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Revenue + Profit Chart */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-semibold text-foreground mb-4">{isAr ? "الإيرادات والأرباح الشهرية" : "Monthly Revenue & Gross Profit"}</h3>
        {isLoading ? (
          <div className="h-52 bg-muted/10 rounded-xl animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">{isAr ? "لا توجد بيانات" : "No data yet"}</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E67E22" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#E67E22" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="profGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={v => `${currency.symbol}${(v as number / 1000).toFixed(0)}k`} />
              <RTooltip contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [fmt(v as number), ""]} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="revenue" name={isAr ? "الإيرادات" : "Revenue"} stroke="#E67E22" fill="url(#revGrad)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="grossProfit" name={isAr ? "الأرباح" : "Gross Profit"} stroke="#10B981" fill="url(#profGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Margin % Chart */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-semibold text-foreground mb-4">{isAr ? "هامش الربح الشهري (%)" : "Monthly Gross Margin (%)"}</h3>
        {isLoading ? (
          <div className="h-40 bg-muted/10 rounded-xl animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#6B7280" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <RTooltip contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }} formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, isAr ? "الهامش" : "Margin"]} />
              <Bar dataKey="margin" name={isAr ? "الهامش%" : "Margin%"} fill="#E67E22" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* VAT Summary */}
      {data?.vatSummary && (
        <div className="p-4 rounded-2xl bg-card border border-amber-400/20">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Receipt size={14} className="text-amber-400" />
            {isAr ? "ملخص ضريبة القيمة المضافة (15%)" : "VAT Summary (15%)"}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: isAr ? "المبلغ الخاضع للضريبة" : "Taxable Amount", value: fmt(data.vatSummary.taxable) },
              { label: isAr ? "قيمة الضريبة" : "VAT Amount", value: fmt(data.vatSummary.vatAmount) },
              { label: isAr ? "الإجمالي مع الضريبة" : "Total incl. VAT", value: fmt(data.vatSummary.totalWithVat) },
            ].map(s => (
              <div key={s.label} className="text-center p-3 rounded-xl bg-amber-400/5 border border-amber-400/10">
                <p className="text-sm font-bold text-amber-400">{s.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Table */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-semibold text-foreground mb-3">{isAr ? "التفاصيل الشهرية" : "Monthly Breakdown"}</h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 bg-muted/10 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground border-b border-border">
                  <th className="text-start py-2 font-medium">{isAr ? "الشهر" : "Month"}</th>
                  <th className="text-end py-2 font-medium">{isAr ? "الإيرادات" : "Revenue"}</th>
                  <th className="text-end py-2 font-medium">{isAr ? "الأرباح" : "Profit"}</th>
                  <th className="text-end py-2 font-medium">{isAr ? "الهامش" : "Margin"}</th>
                  <th className="text-end py-2 font-medium">{isAr ? "الضريبة" : "VAT"}</th>
                  <th className="text-end py-2 font-medium">{isAr ? "الطلبات" : "Orders"}</th>
                </tr>
              </thead>
              <tbody>
                {(data?.monthly ?? []).filter(m => m.revenue > 0).map(m => (
                  <tr key={m.month} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="py-2.5 text-foreground font-medium">
                      {isAr ? MONTH_LABELS[m.month]?.ar : MONTH_LABELS[m.month]?.en}
                    </td>
                    <td className="py-2.5 text-end text-primary font-semibold">{fmt(m.revenue)}</td>
                    <td className="py-2.5 text-end text-emerald-400">{fmt(m.grossProfit)}</td>
                    <td className="py-2.5 text-end">
                      <span className={`px-1.5 py-0.5 rounded ${m.grossMargin >= 30 ? "text-emerald-400 bg-emerald-400/10" : m.grossMargin >= 15 ? "text-amber-400 bg-amber-400/10" : "text-red-400 bg-red-400/10"}`}>
                        {fmtPct(m.grossMargin)}
                      </span>
                    </td>
                    <td className="py-2.5 text-end text-amber-400">{fmt(m.taxCollected)}</td>
                    <td className="py-2.5 text-end text-muted-foreground">{m.orderCount}</td>
                  </tr>
                ))}
                {(data?.monthly ?? []).filter(m => m.revenue > 0).length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">{isAr ? "لا توجد بيانات لهذا العام" : "No data for this year"}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
