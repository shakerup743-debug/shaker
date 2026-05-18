import { useState } from "react";
import { motion } from "framer-motion";
import {
  Package, AlertTriangle, TrendingDown, TrendingUp, RefreshCw,
  ShoppingCart, Brain, ArrowUpRight, ArrowDownRight, Zap,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/contexts/currency";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer, Cell } from "recharts";

interface InventoryItem {
  id: number;
  name: string;
  nameAr?: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  costPerUnit: number;
  category?: string;
  lastRestocked?: string;
  status?: "ok" | "low" | "critical" | "overstock";
}

function stockStatus(item: InventoryItem): InventoryItem["status"] {
  if (item.currentStock <= 0) return "critical";
  if (item.currentStock < item.minStock) return "low";
  if (item.currentStock > item.maxStock) return "overstock";
  return "ok";
}

const STATUS_CONFIG = {
  ok:        { label: "OK",        labelAr: "جيد",       color: "#10B981", bg: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" },
  low:       { label: "Low",       labelAr: "منخفض",     color: "#F59E0B", bg: "bg-amber-500/10 border-amber-500/20 text-amber-400" },
  critical:  { label: "Critical",  labelAr: "حرج",       color: "#EF4444", bg: "bg-red-500/10 border-red-500/20 text-red-400" },
  overstock: { label: "Overstock", labelAr: "زائد",      color: "#3B82F6", bg: "bg-blue-500/10 border-blue-500/20 text-blue-400" },
};

export default function InventoryIntelligencePage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { format } = useCurrency();
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<InventoryItem["status"] | "all">("all");

  const { data: items = [], isLoading, refetch } = useQuery<InventoryItem[]>({
    queryKey: ["inventory-intelligence"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/inventory", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const data = await res.json() as InventoryItem[] | { items?: InventoryItem[] };
      const arr = Array.isArray(data) ? data : (data.items ?? []);
      return arr.map(item => ({ ...item, status: stockStatus(item) }));
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ id, quantity, reason }: { id: number; quantity: number; reason: string }) => {
      const token = await getToken();
      await fetch(`/api/inventory/${id}/adjust`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ quantity, reason }),
      });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["inventory-intelligence"] }),
  });

  const withStatus = items.map(i => ({ ...i, status: stockStatus(i) }));
  const filtered = filterStatus === "all" ? withStatus : withStatus.filter(i => i.status === filterStatus);

  const counts = {
    all: withStatus.length,
    ok: withStatus.filter(i => i.status === "ok").length,
    low: withStatus.filter(i => i.status === "low").length,
    critical: withStatus.filter(i => i.status === "critical").length,
    overstock: withStatus.filter(i => i.status === "overstock").length,
  };

  const totalValue = withStatus.reduce((a, i) => a + i.currentStock * (i.costPerUnit ?? 0), 0);

  // Chart data — top 8 by stock %
  const chartData = withStatus
    .map(i => ({
      name: (isAr && i.nameAr ? i.nameAr : i.name).slice(0, 12),
      pct: i.maxStock > 0 ? Math.round((i.currentStock / i.maxStock) * 100) : 0,
      status: stockStatus(i),
    }))
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 8);

  // AI recommendations
  const aiRecs = withStatus
    .filter(i => i.status === "low" || i.status === "critical")
    .slice(0, 4)
    .map(i => ({
      item: i,
      reorderQty: Math.max(i.maxStock - i.currentStock, i.minStock * 2),
      cost: format((i.maxStock - i.currentStock) * (i.costPerUnit ?? 0)),
      urgency: i.status === "critical" ? "high" : "medium",
    }));

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Package size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "ذكاء المخزون" : "Inventory Intelligence"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "تحليل وتوصيات ذكية للمخزون" : "Smart analysis & reorder recommendations"}</p>
          </div>
        </div>
        <button onClick={() => void refetch()} className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Package, label: isAr ? "إجمالي الأصناف" : "Total Items", value: withStatus.length, color: "#E67E22" },
          { icon: AlertTriangle, label: isAr ? "تحذيرات" : "Alerts", value: counts.low + counts.critical, color: "#EF4444" },
          { icon: TrendingUp, label: isAr ? "قيمة المخزون" : "Stock Value", value: format(totalValue), color: "#10B981" },
          { icon: Zap, label: isAr ? "يحتاج طلب" : "Needs Reorder", value: counts.critical, color: "#F59E0B" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="p-3 rounded-2xl bg-card border border-border">
            <div className="w-8 h-8 rounded-xl mb-2 flex items-center justify-center" style={{ backgroundColor: color + "18" }}>
              <Icon size={14} style={{ color }} />
            </div>
            <p className="text-base font-bold text-foreground">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* AI Recommendations */}
      {aiRecs.length > 0 && (
        <div className="p-4 rounded-2xl bg-card border border-amber-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Brain size={15} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">{isAr ? "توصيات الذكاء الاصطناعي" : "AI Reorder Recommendations"}</h3>
          </div>
          <div className="space-y-2">
            {aiRecs.map(({ item, reorderQty, cost, urgency }) => (
              <div key={item.id} className="flex items-center justify-between p-3 rounded-xl bg-background border border-border">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2 h-2 rounded-full ${urgency === "high" ? "bg-red-400 animate-pulse" : "bg-amber-400"}`} />
                  <div>
                    <p className="text-xs font-semibold text-foreground">{isAr && item.nameAr ? item.nameAr : item.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {item.currentStock} {item.unit} {isAr ? "/ الحد الأدنى:" : "/ min:"} {item.minStock} {item.unit}
                    </p>
                  </div>
                </div>
                <div className="text-end">
                  <p className="text-xs font-bold text-primary">+{reorderQty} {item.unit}</p>
                  <p className="text-[10px] text-muted-foreground">{cost}</p>
                </div>
                <button
                  onClick={() => adjustMutation.mutate({ id: item.id, quantity: reorderQty, reason: "AI reorder recommendation" })}
                  disabled={adjustMutation.isPending}
                  className="ms-3 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary text-white text-[10px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
                  <ShoppingCart size={10} />{isAr ? "طلب" : "Order"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stock level chart */}
      {chartData.length > 0 && (
        <div className="p-4 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-4">{isAr ? "مستويات المخزون (%)" : "Stock Levels (%)"}</h3>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} layout="vertical" barSize={10}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: "#6B7280", fontSize: 9 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: "#9CA3AF", fontSize: 9 }} width={70} />
              <ReTooltip
                contentStyle={{ backgroundColor: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
                formatter={(val) => [`${val}%`, isAr ? "المخزون" : "Stock"]}
              />
              <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={STATUS_CONFIG[entry.status ?? "ok"].color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Status filter */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
        {(["all", "ok", "low", "critical", "overstock"] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap border transition-all ${
              filterStatus === s
                ? "bg-primary text-white border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40"
            }`}>
            {s === "all" ? (isAr ? `الكل (${counts.all})` : `All (${counts.all})`) : `${isAr ? STATUS_CONFIG[s].labelAr : STATUS_CONFIG[s].label} (${counts[s]})`}
          </button>
        ))}
      </div>

      {/* Items list */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 border border-dashed border-border rounded-2xl text-muted-foreground">
          <Package size={24} className="mb-2 opacity-30" />
          <p className="text-sm">{isAr ? "لا توجد عناصر" : "No items found"}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const status = item.status ?? "ok";
            const cfg = STATUS_CONFIG[status];
            const pct = item.maxStock > 0 ? Math.min((item.currentStock / item.maxStock) * 100, 100) : 0;
            return (
              <motion.div key={item.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                className="p-3.5 rounded-2xl bg-card border border-border">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{isAr && item.nameAr ? item.nameAr : item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.currentStock} / {item.maxStock} {item.unit}
                      {item.costPerUnit && <span className="ms-2">{format(item.costPerUnit)}/{item.unit}</span>}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.bg}`}>
                    {isAr ? cfg.labelAr : cfg.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{Math.round(pct)}%</span>
                  {status === "low" || status === "critical" ? (
                    <TrendingDown size={11} className="text-red-400 shrink-0" />
                  ) : status === "overstock" ? (
                    <TrendingUp size={11} className="text-blue-400 shrink-0" />
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
