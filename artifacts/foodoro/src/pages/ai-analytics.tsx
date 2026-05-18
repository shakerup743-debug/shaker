import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import {
  Brain, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  BarChart3, Package, Users, DollarSign, Lightbulb, Target,
  RefreshCw, Calendar, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useCurrency } from "@/contexts/currency";

const BASE = import.meta.env.BASE_URL as string;

interface Insight {
  period: { days: number; from: string; to: string };
  summary: {
    totalRevenue: number; totalOrders: number; completedOrders: number;
    cancelledOrders: number; cancellationRate: number; avgOrderValue: number;
    totalTax: number; totalDiscount: number; revenueGrowth: number;
  };
  orderTypes: { dineIn: number; takeaway: number; delivery: number };
  inventory: { lowStockCount: number; criticalStockCount: number; criticalItems: { id: number; name: string; unit: string }[] };
  peakHour: { hour: number; orderCount: number } | null;
  insights: string[];
  recommendations: string[];
  alerts: string[];
}

interface Forecast {
  forecast: { date: string; dayName: string; predictedRevenue: number; predictedOrders: number; confidence: string }[];
  weekTotalForecast: number;
  basedOnDays: number;
}

interface TopPerformers {
  topProducts: { productId: number; name: string; sold: number; revenue: number }[];
  bottomProducts: { productId: number; name: string; sold: number; revenue: number }[];
  topCustomers: { id: number; name: string; phone: string; totalOrders: number; totalSpent: number; loyaltyTier: string }[];
}

interface InventoryHealth {
  items: { id: number; name: string; unit: string; quantity: number; threshold: number; status: string; urgency: string; daysUntilEmpty: number | null; recommendation: string | null }[];
  summary: { critical: unknown[]; medium: unknown[]; healthy: unknown[] };
  totalItems: number;
}

async function fetchAi(endpoint: string, params?: Record<string, string>) {
  const url = new URL(`${BASE}api/${endpoint}`, window.location.href);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const URGENCY_COLOR: Record<string, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  high: "bg-red-500/20 text-red-300 border-red-500/30",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  low: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  none: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "text-emerald-400",
  medium: "text-amber-400",
  low: "text-gray-400",
};

export default function AiAnalyticsPage() {
  const { t } = useTranslation();
  const { format: fmt } = useCurrency();
  const [days, setDays] = useState("30");

  const insightsQ = useQuery<Insight>({
    queryKey: ["ai-insights", days],
    queryFn: () => fetchAi("ai/insights", { days }) as Promise<Insight>,
  });

  const forecastQ = useQuery<Forecast>({
    queryKey: ["ai-forecast"],
    queryFn: () => fetchAi("ai/forecast") as Promise<Forecast>,
  });

  const performersQ = useQuery<TopPerformers>({
    queryKey: ["ai-performers", days],
    queryFn: () => fetchAi("ai/top-performers", { days }) as Promise<TopPerformers>,
  });

  const inventoryQ = useQuery<InventoryHealth>({
    queryKey: ["ai-inventory"],
    queryFn: () => fetchAi("ai/inventory-health") as Promise<InventoryHealth>,
  });

  const isLoading = insightsQ.isLoading || forecastQ.isLoading;

  const refetchAll = () => {
    void insightsQ.refetch();
    void forecastQ.refetch();
    void performersQ.refetch();
    void inventoryQ.refetch();
  };

  const data = insightsQ.data;

  return (
    <div className="flex flex-col gap-6 p-1">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">AI Analytics</h1>
            <p className="text-xs text-muted-foreground">ذكاء اصطناعي لتحليل الأعمال</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-36 h-8 text-xs bg-card border-border">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">آخر 7 أيام</SelectItem>
              <SelectItem value="30">آخر 30 يوم</SelectItem>
              <SelectItem value="90">آخر 90 يوم</SelectItem>
              <SelectItem value="365">هذا العام</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={refetchAll} disabled={isLoading} className="h-8 gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            تحديث
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "الإيراد الإجمالي", value: fmt(data.summary.totalRevenue), icon: DollarSign, color: "text-primary", trend: data.summary.revenueGrowth },
            { label: "إجمالي الطلبات", value: data.summary.totalOrders.toString(), icon: BarChart3, color: "text-blue-400", trend: null },
            { label: "متوسط الطلب", value: fmt(data.summary.avgOrderValue), icon: Target, color: "text-purple-400", trend: null },
            { label: "نسبة الإلغاء", value: `${data.summary.cancellationRate}%`, icon: AlertTriangle, color: data.summary.cancellationRate > 15 ? "text-red-400" : "text-emerald-400", trend: null },
          ].map((kpi) => (
            <Card key={kpi.label} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground">{kpi.label}</p>
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <p className="text-lg font-bold text-foreground">{kpi.value}</p>
                {kpi.trend !== null && (
                  <div className={`flex items-center gap-1 mt-1 text-xs ${kpi.trend >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {kpi.trend >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                    {Math.abs(kpi.trend)}% مقارنة بالفترة السابقة
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Alerts */}
        {data && data.alerts.length > 0 && (
          <Card className="bg-red-950/20 border-red-500/30 lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-red-300">
                <AlertTriangle className="w-4 h-4" /> تنبيهات فورية
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.alerts.map((alert, i) => (
                <div key={i} className="flex items-start gap-2 text-sm text-red-200">
                  <span className="text-red-400 mt-0.5">⚠</span> {alert}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Insights */}
        {data && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-primary">
                <Lightbulb className="w-4 h-4" /> رؤى الأعمال
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.insights.length === 0 && <p className="text-xs text-muted-foreground">لا توجد بيانات كافية</p>}
              {data.insights.map((ins, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" /> {ins}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Recommendations */}
        {data && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-400">
                <Brain className="w-4 h-4" /> توصيات الذكاء الاصطناعي
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {data.recommendations.length === 0 && <p className="text-xs text-muted-foreground">لا توصيات حالياً</p>}
              {data.recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="text-amber-400 mt-0.5">→</span> {rec}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Order Types */}
        {data && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-foreground">توزيع الطلبات</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {[
                { label: "داخلي", value: data.orderTypes.dineIn, color: "bg-primary" },
                { label: "سفري", value: data.orderTypes.takeaway, color: "bg-blue-500" },
                { label: "توصيل", value: data.orderTypes.delivery, color: "bg-purple-500" },
              ].map((type) => {
                const total = data.orderTypes.dineIn + data.orderTypes.takeaway + data.orderTypes.delivery;
                const pct = total > 0 ? Math.round((type.value / total) * 100) : 0;
                return (
                  <div key={type.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{type.label}</span>
                      <span className="text-foreground font-medium">{type.value} ({pct}%)</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
              {data.peakHour && (
                <div className="mt-2 pt-2 border-t border-border text-xs text-muted-foreground">
                  ساعة الذروة: <span className="text-primary font-medium">{data.peakHour.hour}:00</span> ({data.peakHour.orderCount} طلب)
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* 7-Day Forecast */}
      {forecastQ.data && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-foreground">
              <Calendar className="w-4 h-4 text-primary" /> توقعات الأسبوع القادم
              <Badge variant="outline" className="text-[10px] text-muted-foreground ms-auto">
                مبني على {forecastQ.data.basedOnDays} يوم من البيانات
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {forecastQ.data.forecast.map((day) => (
                <div key={day.date} className="flex flex-col items-center text-center p-2 rounded-lg bg-background border border-border">
                  <p className="text-[10px] text-muted-foreground">{day.dayName?.slice(0, 3)}</p>
                  <p className="text-[10px] text-muted-foreground">{day.date?.slice(5)}</p>
                  <p className="text-sm font-bold text-primary mt-1">{fmt(day.predictedRevenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{day.predictedOrders} طلب</p>
                  <span className={`text-[9px] mt-1 ${CONFIDENCE_COLOR[day.confidence] ?? "text-gray-400"}`}>
                    {day.confidence === "high" ? "★★★" : day.confidence === "medium" ? "★★☆" : "★☆☆"}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm">
              <span className="text-muted-foreground">إجمالي توقع الأسبوع</span>
              <span className="font-bold text-primary">{fmt(forecastQ.data.weekTotalForecast)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Products */}
        {performersQ.data && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                <TrendingUp className="w-4 h-4 text-emerald-400" /> أفضل المنتجات
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-2">
                {performersQ.data.topProducts.slice(0, 8).map((p, i) => (
                  <div key={p.productId} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i < 3 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>{i + 1}</span>
                      <span className="text-muted-foreground truncate max-w-32">{p.name}</span>
                    </div>
                    <div className="text-end">
                      <p className="text-foreground font-medium">{fmt(p.revenue)}</p>
                      <p className="text-muted-foreground">{p.sold} وحدة</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inventory Health */}
        {inventoryQ.data && (
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                <Package className="w-4 h-4 text-amber-400" /> صحة المخزون
                <Badge variant="outline" className="ms-auto text-[10px]">
                  {inventoryQ.data.totalItems} عنصر
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[
                  { label: "حرج", count: inventoryQ.data.summary.critical.length, color: "text-red-400" },
                  { label: "متوسط", count: inventoryQ.data.summary.medium.length, color: "text-amber-400" },
                  { label: "جيد", count: inventoryQ.data.summary.healthy.length, color: "text-emerald-400" },
                ].map((s) => (
                  <div key={s.label} className="text-center p-2 rounded-lg bg-background border border-border">
                    <p className={`text-lg font-bold ${s.color}`}>{s.count}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {inventoryQ.data.items.filter(i => i.urgency !== "none" && i.urgency !== "low").map((item) => (
                  <div key={item.id} className="flex items-center justify-between text-xs p-2 rounded bg-background border border-border">
                    <div>
                      <p className="text-foreground font-medium">{item.name}</p>
                      <p className="text-muted-foreground">{item.quantity} {item.unit} (حد: {item.threshold})</p>
                    </div>
                    <Badge className={`text-[9px] border ${URGENCY_COLOR[item.urgency] ?? ""}`}>
                      {item.status === "out_of_stock" ? "نفد" : item.status === "critical" ? "حرج" : "منخفض"}
                    </Badge>
                  </div>
                ))}
                {inventoryQ.data.items.filter(i => i.urgency !== "none" && i.urgency !== "low").length === 0 && (
                  <div className="text-center py-4 text-xs text-emerald-400 flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" /> جميع العناصر بمستوى جيد
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Top Customers */}
        {performersQ.data && (
          <Card className="bg-card border-border lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-foreground">
                <Users className="w-4 h-4 text-blue-400" /> أفضل العملاء
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {performersQ.data.topCustomers.slice(0, 10).map((c, i) => (
                  <div key={c.id} className="p-3 rounded-lg bg-background border border-border text-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-1 ${i === 0 ? "bg-yellow-500/20 text-yellow-400" : i === 1 ? "bg-gray-400/20 text-gray-300" : i === 2 ? "bg-amber-700/20 text-amber-600" : "bg-muted text-muted-foreground"}`}>
                      {i + 1}
                    </div>
                    <p className="text-xs font-medium text-foreground truncate">{c.name}</p>
                    <p className="text-[10px] text-primary font-bold">{fmt(c.totalSpent)}</p>
                    <p className="text-[10px] text-muted-foreground">{c.totalOrders} طلب</p>
                    <Badge variant="outline" className="text-[8px] mt-1 capitalize">{c.loyaltyTier}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom / Weak Products */}
      {performersQ.data && performersQ.data.bottomProducts.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-foreground">
              <TrendingDown className="w-4 h-4 text-red-400" /> منتجات ضعيفة الأداء
              <span className="text-[10px] text-muted-foreground ms-1">— يُنصح بمراجعتها أو إيقافها</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {performersQ.data.bottomProducts.slice(0, 10).map((p) => (
                <div key={p.productId} className="p-3 rounded-lg bg-background border border-red-500/20 text-center">
                  <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                  <p className="text-[10px] text-primary">{fmt(p.revenue)}</p>
                  <p className="text-[10px] text-muted-foreground">{p.sold} وحدة</p>
                  {p.sold === 0 && <Badge variant="destructive" className="text-[8px] mt-1">لم يُباع</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
