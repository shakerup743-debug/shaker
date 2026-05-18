import { useState } from "react";
import { motion } from "framer-motion";
import { Users, TrendingUp, Star, Heart, Crown, Search, ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/contexts/currency";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, Tooltip as ReTooltip, ResponsiveContainer, Legend } from "recharts";

interface Customer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  loyaltyPoints: number;
  loyaltyTier: "bronze" | "silver" | "gold" | "platinum";
  totalOrders: number;
  totalSpent: number;
  lastOrderAt?: string;
  createdAt?: string;
}

const TIER_CONFIG = {
  bronze:   { color: "#CD7F32", emoji: "🥉", labelEn: "Bronze",   labelAr: "برونز",   min: 0,    max: 999 },
  silver:   { color: "#C0C0C0", emoji: "🥈", labelEn: "Silver",   labelAr: "فضة",     min: 1000, max: 4999 },
  gold:     { color: "#FFD700", emoji: "🥇", labelEn: "Gold",     labelAr: "ذهب",     min: 5000, max: 9999 },
  platinum: { color: "#E5E4E2", emoji: "💎", labelEn: "Platinum", labelAr: "بلاتين",  min: 10000, max: Infinity },
};

function timeSince(iso: string, isAr: boolean) {
  const d = new Date(iso);
  const m = Math.floor((Date.now() - d.getTime()) / 60000);
  if (m < 60) return isAr ? `${m} دق` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isAr ? `${h} س` : `${h}h ago`;
  const days = Math.floor(h / 24);
  return isAr ? `${days} يوم` : `${days}d ago`;
}

export default function CustomerAnalyticsPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { format } = useCurrency();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<Customer["loyaltyTier"] | "all">("all");

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["customer-analytics"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/customers", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const data = await res.json() as Customer[] | { customers?: Customer[] };
      return Array.isArray(data) ? data : (data.customers ?? []);
    },
  });

  const filtered = customers.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.email ?? "").toLowerCase().includes(search.toLowerCase());
    const matchTier = tierFilter === "all" || c.loyaltyTier === tierFilter;
    return matchSearch && matchTier;
  });

  const tierCounts = Object.keys(TIER_CONFIG).map(tier => ({
    name: isAr ? TIER_CONFIG[tier as Customer["loyaltyTier"]].labelAr : TIER_CONFIG[tier as Customer["loyaltyTier"]].labelEn,
    value: customers.filter(c => c.loyaltyTier === tier).length,
    color: TIER_CONFIG[tier as Customer["loyaltyTier"]].color,
  })).filter(t => t.value > 0);

  const totalRevenue = customers.reduce((a, c) => a + (c.totalSpent ?? 0), 0);
  const avgSpend = customers.length ? totalRevenue / customers.length : 0;
  const topCustomers = [...customers].sort((a, b) => (b.totalSpent ?? 0) - (a.totalSpent ?? 0)).slice(0, 3);

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Users size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">{isAr ? "تحليل العملاء" : "Customer Analytics"}</h1>
          <p className="text-xs text-muted-foreground">{isAr ? "سلوك العملاء وتحليل الولاء" : "Customer behavior & loyalty analysis"}</p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Users,      label: isAr ? "إجمالي العملاء" : "Total Customers", value: customers.length,     color: "#E67E22" },
          { icon: TrendingUp, label: isAr ? "إجمالي الإيرادات" : "Total Revenue",  value: format(totalRevenue), color: "#10B981" },
          { icon: Heart,      label: isAr ? "متوسط الإنفاق" : "Avg Spend",        value: format(avgSpend),     color: "#3B82F6" },
          { icon: Crown,      label: isAr ? "بلاتيني" : "Platinum",               value: customers.filter(c => c.loyaltyTier === "platinum").length, color: "#8B5CF6" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="p-3 rounded-2xl bg-card border border-border">
            <div className="w-7 h-7 rounded-lg mb-2 flex items-center justify-center" style={{ backgroundColor: color + "18" }}>
              <Icon size={13} style={{ color }} />
            </div>
            <p className="text-base font-bold text-foreground">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Tier distribution pie */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">{isAr ? "توزيع الفئات" : "Tier Distribution"}</h3>
          {tierCounts.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-xs text-muted-foreground">{isAr ? "لا بيانات" : "No data"}</div>
          ) : (
            <ResponsiveContainer width="100%" height={128}>
              <PieChart>
                <Pie data={tierCounts} cx="50%" cy="50%" innerRadius={30} outerRadius={55} paddingAngle={2} dataKey="value">
                  {tierCounts.map((t, i) => <Cell key={i} fill={t.color} />)}
                </Pie>
                <ReTooltip contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top customers */}
        <div className="p-4 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">{isAr ? "أفضل العملاء" : "Top Customers"}</h3>
          <div className="space-y-2">
            {topCustomers.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">{isAr ? "لا بيانات" : "No data yet"}</p>
            ) : topCustomers.map((c, idx) => {
              const tier = TIER_CONFIG[c.loyaltyTier];
              return (
                <div key={c.id} className="flex items-center gap-2">
                  <span className="text-base">{tier.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{c.name}</p>
                    <p className="text-[10px] text-muted-foreground">{c.totalOrders ?? 0} {isAr ? "طلب" : "orders"}</p>
                  </div>
                  <p className="text-xs font-bold text-primary">{format(c.totalSpent ?? 0)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tier filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        <button onClick={() => setTierFilter("all")}
          className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all ${tierFilter === "all" ? "bg-primary text-white border-primary" : "bg-card text-muted-foreground border-border"}`}>
          {isAr ? "الكل" : "All"} ({customers.length})
        </button>
        {(Object.entries(TIER_CONFIG) as [Customer["loyaltyTier"], typeof TIER_CONFIG.bronze][]).map(([tier, cfg]) => (
          <button key={tier} onClick={() => setTierFilter(tier)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all whitespace-nowrap ${tierFilter === tier ? "text-white border-transparent" : "bg-card text-muted-foreground border-border"}`}
            style={tierFilter === tier ? { backgroundColor: cfg.color } : {}}>
            {cfg.emoji} {isAr ? cfg.labelAr : cfg.labelEn} ({customers.filter(c => c.loyaltyTier === tier).length})
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-8 bg-card border-border h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={isAr ? "البحث في العملاء..." : "Search customers..."} />
      </div>

      {/* Customer list */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 border border-dashed border-border rounded-2xl text-muted-foreground">
          <Users size={24} className="mb-2 opacity-30" />
          <p className="text-sm">{isAr ? "لا يوجد عملاء" : "No customers found"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const tier = TIER_CONFIG[c.loyaltyTier];
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-2xl bg-card border border-border">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0" style={{ backgroundColor: tier.color + "20" }}>
                    {tier.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: tier.color + "20", color: tier.color }}>
                        {isAr ? tier.labelAr : tier.labelEn}
                      </span>
                    </div>
                    {c.email && <p className="text-[10px] text-muted-foreground truncate">{c.email}</p>}
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-muted-foreground">{c.totalOrders ?? 0} {isAr ? "طلب" : "orders"}</span>
                      <span className="text-[10px] flex items-center gap-0.5 text-amber-400"><Star size={9} />{c.loyaltyPoints ?? 0} {isAr ? "نقطة" : "pts"}</span>
                      {c.lastOrderAt && <span className="text-[10px] text-muted-foreground">{timeSince(c.lastOrderAt, isAr)}</span>}
                    </div>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-sm font-bold text-primary">{format(c.totalSpent ?? 0)}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{isAr ? "إجمالي" : "lifetime"}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
