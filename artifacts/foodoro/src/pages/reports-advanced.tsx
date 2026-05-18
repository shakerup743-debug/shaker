import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, ShoppingBag,
  Calendar, Download, RefreshCw, ArrowUpRight, ArrowDownRight, Clock,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ReTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from "recharts";
import { useCurrency } from "@/contexts/currency";
import { Skeleton } from "@/components/ui/skeleton";

const PERIOD_OPTIONS = [
  { value: "7d",  labelEn: "7 Days",  labelAr: "7 أيام" },
  { value: "30d", labelEn: "30 Days", labelAr: "30 يوم" },
  { value: "90d", labelEn: "90 Days", labelAr: "90 يوم" },
];

const COLORS = ["#E67E22", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"];

interface DailyData {
  date: string;
  revenue: number;
  orders: number;
  tax: number;
  avgOrderValue: number;
}

interface HourlyData {
  hour: number;
  orders: number;
  revenue: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
  category?: string;
}

interface DashboardStats {
  todayRevenue?: number;
  yesterdayRevenue?: number;
  todayOrders?: number;
  yesterdayOrders?: number;
  pendingKitchenTickets?: number;
  lowStockCount?: number;
  totalProducts?: number;
  monthRevenue?: number;
}

function KpiCard({ label, value, sub, trend, icon: Icon, color }: {
  label: string; value: string; sub?: string;
  trend?: number; icon: React.ElementType; color: string;
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
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </motion.div>
  );
}

export default function ReportsAdvancedPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { format } = useCurrency();
  const [period, setPeriod] = useState("30d");

  const today = new Date().toISOString().split("T")[0]!;

  const fetcher = async (url: string) => {
    const token = await getToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("fetch error");
    return res.json() as Promise<unknown>;
  };

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/reports/dashboard"],
    queryFn: () => fetcher("/api/reports/dashboard") as Promise<DashboardStats>,
  });

  const { data: daily, isLoading: dailyLoading } = useQuery<DailyData[]>({
    queryKey: ["/api/reports/daily", { date: today }],
    queryFn: () => fetcher(`/api/reports/daily?date=${today}`) as Promise<DailyData[]>,
  });

  const { data: hourly, isLoading: hourlyLoading } = useQuery<HourlyData[]>({
    queryKey: ["/api/reports/hourly", { date: today }],
    queryFn: () => fetcher(`/api/reports/hourly?date=${today}`) as Promise<HourlyData[]>,
  });

  const { data: topProducts, isLoading: topLoading } = useQuery<TopProduct[]>({
    queryKey: ["/api/reports/top-products", { date: today }],
    queryFn: () => fetcher(`/api/reports/top-products?date=${today}&limit=8`) as Promise<TopProduct[]>,
  });

  const revenueTrend = stats?.todayRevenue && stats.yesterdayRevenue && stats.yesterdayRevenue > 0
    ? ((Number(stats.todayRevenue) - Number(stats.yesterdayRevenue)) / Number(stats.yesterdayRevenue)) * 100
    : undefined;

  const ordersTrend = stats?.todayOrders && stats.yesterdayOrders && stats.yesterdayOrders > 0
    ? ((stats.todayOrders - stats.yesterdayOrders) / stats.yesterdayOrders) * 100
    : undefined;

  const hourlyData = (hourly ?? []).map(h => ({
    ...h,
    label: `${h.hour}:00`,
  }));

  const pieData = (topProducts ?? []).slice(0, 5).map(p => ({
    name: p.name.length > 15 ? p.name.slice(0, 15) + "…" : p.name,
    value: p.revenue,
  }));

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart3 size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "التقارير المتقدمة" : "Advanced Reports"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "تحليل مفصّل للأداء المالي" : "Detailed financial performance analysis"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-border overflow-hidden bg-card">
            {PERIOD_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setPeriod(o.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${period === o.value ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"}`}>
                {isAr ? o.labelAr : o.labelEn}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-3">
        {statsLoading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />) : (
          <>
            <KpiCard icon={DollarSign} color="#E67E22" label={isAr ? "إيرادات اليوم" : "Today Revenue"}
              value={format(Number(stats?.todayRevenue ?? 0))} trend={revenueTrend}
              sub={isAr ? `أمس: ${format(Number(stats?.yesterdayRevenue ?? 0))}` : `Yesterday: ${format(Number(stats?.yesterdayRevenue ?? 0))}`} />
            <KpiCard icon={ShoppingBag} color="#3B82F6" label={isAr ? "طلبات اليوم" : "Today Orders"}
              value={String(stats?.todayOrders ?? 0)} trend={ordersTrend}
              sub={isAr ? `أمس: ${stats?.yesterdayOrders ?? 0}` : `Yesterday: ${stats?.yesterdayOrders ?? 0}`} />
            <KpiCard icon={Clock} color="#F59E0B" label={isAr ? "انتظار المطبخ" : "Kitchen Queue"}
              value={String(stats?.pendingKitchenTickets ?? 0)} sub={isAr ? "تذاكر نشطة" : "Active tickets"} />
            <KpiCard icon={TrendingUp} color="#10B981" label={isAr ? "متوسط الطلب" : "Avg Order Value"}
              value={stats?.todayOrders && stats.todayOrders > 0
                ? format(Number(stats.todayRevenue ?? 0) / stats.todayOrders)
                : format(0)} />
          </>
        )}
      </div>

      {/* Revenue area chart */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">{isAr ? "الإيرادات بالساعة" : "Hourly Revenue"}</h3>
          <span className="text-[10px] text-muted-foreground">{today}</span>
        </div>
        {hourlyLoading ? <Skeleton className="h-44" /> : hourlyData.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">{isAr ? "لا بيانات لهذا اليوم" : "No data for today yet"}</div>
        ) : (
          <ResponsiveContainer width="100%" height={176}>
            <AreaChart data={hourlyData}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E67E22" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#E67E22" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="label" tick={{ fill: "#6B7280", fontSize: 10 }} />
              <YAxis tick={{ fill: "#6B7280", fontSize: 10 }} />
              <ReTooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#F9FAFB" }} itemStyle={{ color: "#E67E22" }} />
              <Area type="monotone" dataKey="revenue" stroke="#E67E22" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Orders bar chart + Pie side by side */}
      <div className="grid grid-cols-2 gap-4">
        {/* Orders by hour */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">{isAr ? "الطلبات بالساعة" : "Orders by Hour"}</h3>
          {hourlyLoading ? <Skeleton className="h-44" /> : (
            <ResponsiveContainer width="100%" height={176}>
              <BarChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="label" tick={{ fill: "#6B7280", fontSize: 9 }} />
                <YAxis tick={{ fill: "#6B7280", fontSize: 9 }} />
                <ReTooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#F9FAFB" }} itemStyle={{ color: "#3B82F6" }} />
                <Bar dataKey="orders" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top products pie */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">{isAr ? "أفضل المنتجات" : "Top Products"}</h3>
          {topLoading ? <Skeleton className="h-44" /> : pieData.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">{isAr ? "لا بيانات" : "No data"}</div>
          ) : (
            <ResponsiveContainer width="100%" height={176}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={44} outerRadius={72}
                  paddingAngle={2} dataKey="value" nameKey="name">
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <ReTooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top products table */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <h3 className="text-sm font-semibold text-foreground mb-4">{isAr ? "أفضل المنتجات مبيعاً" : "Best Selling Products"}</h3>
        {topLoading ? <Skeleton className="h-32" /> : (topProducts ?? []).length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">{isAr ? "لا بيانات لهذا اليوم" : "No sales data for today"}</div>
        ) : (
          <div className="space-y-2">
            {(topProducts ?? []).map((p, idx) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className="w-6 text-xs text-muted-foreground text-center font-mono">#{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                    <p className="text-xs font-bold text-primary shrink-0 ms-2">{format(p.revenue)}</p>
                  </div>
                  <div className="h-1.5 rounded-full bg-border overflow-hidden">
                    <div className="h-full rounded-full bg-primary transition-all duration-700"
                      style={{ width: `${((topProducts ?? [])[0]?.revenue ?? 1) > 0 ? (p.revenue / (topProducts ?? [])[0]!.revenue) * 100 : 0}%` }} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{p.quantity} {isAr ? "وحدة" : "units"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
