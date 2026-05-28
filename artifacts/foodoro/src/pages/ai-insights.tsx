// AI Insights — لوحة موحّدة لمحركات الذكاء الاصطناعي الثلاثة:
//   1) Predictive (تنبؤات اليوم + خطة المخزون + سرد سياقي)
//   2) Recommendations (الأكثر طلباً + مزامنة Basket)
//   3) Anomaly Detection (تنبيهات إحصائية + ملخص LLM)
//
// تصميم: dark theme, three sticky tabs, RTL، بدون emojis.

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Brain, TrendingUp, AlertTriangle, Sparkles, RefreshCw,
  Package, Clock, Users, Activity,
} from "lucide-react";

// ─── Types mirror backend payloads ────────────────────────────────────────
interface ProductPrediction {
  productId: number;
  productName: string;
  predictedQuantity: number;
  confidence: number;
  peakHours: number[];
  recommendedStock: number;
  trend: "rising" | "stable" | "falling";
  trendPerDay: number;
  daysOfHistory: number;
}
interface DailyPrediction {
  date: string;
  totalPredictedOrders: number;
  totalPredictedRevenue: number;
  peakHour: number;
  topProducts: ProductPrediction[];
  staffing: { waiters: number; kitchenStaff: number; cashiers: number };
  averageConfidence: number;
}
interface InventoryItem {
  productId: number;
  productName: string;
  totalNeededQty: number;
  dailyAverage: number;
  urgency: "high" | "medium" | "low";
  note: string;
}
interface Recommendation {
  productId: number;
  productName: string;
  price: number;
  score: number;
  reason: string;
  source: "personal" | "pairing" | "trending";
}
interface Anomaly {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  score: number;
  metrics: Record<string, number | string>;
  detectedAt: string;
}
interface AnomalyReport {
  generatedAt: string;
  totalAnomalies: number;
  anomalies: Anomaly[];
  narrative: string;
}

type Tab = "predict" | "recommend" | "anomaly";

function authHeaders(): Record<string, string> {
  const t = localStorage.getItem("foodoro-token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function api<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { success?: boolean; data?: T };
    return j?.data ?? null;
  } catch {
    return null;
  }
}

const SEVERITY_STYLE: Record<Anomaly["severity"], string> = {
  low:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};

const URGENCY_STYLE: Record<InventoryItem["urgency"], string> = {
  high:   "bg-red-500/10 text-red-400 border-red-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
};

const SOURCE_STYLE: Record<Recommendation["source"], string> = {
  personal: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/30",
  pairing:  "bg-sky-500/10 text-sky-400 border-sky-500/30",
  trending: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

const SOURCE_LABEL: Record<Recommendation["source"], string> = {
  personal: "موصى شخصياً",
  pairing:  "يطلب معاً",
  trending: "الأكثر طلباً",
};

export default function AiInsightsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("predict");
  const [loading, setLoading] = useState(true);

  // Predict tab state
  const [daily, setDaily] = useState<DailyPrediction | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [narrative, setNarrative] = useState<string>("");
  const [narrativeLoading, setNarrativeLoading] = useState(false);

  // Recommend tab state
  const [trending, setTrending] = useState<Recommendation[]>([]);

  // Anomaly tab state
  const [anomalyReport, setAnomalyReport] = useState<AnomalyReport | null>(null);

  const reloadAll = useCallback(async () => {
    setLoading(true);
    const [d, inv, tr, an] = await Promise.all([
      api<DailyPrediction>("/api/ai/predictions/daily"),
      api<InventoryItem[]>("/api/ai/predictions/inventory-plan?days=7"),
      api<Recommendation[]>("/api/ai/recommendations/trending?limit=8"),
      api<AnomalyReport>("/api/ai/anomalies"),
    ]);
    setDaily(d);
    setInventory(inv ?? []);
    setTrending(tr ?? []);
    setAnomalyReport(an);
    setLoading(false);
  }, []);

  const loadNarrative = useCallback(async () => {
    setNarrativeLoading(true);
    const n = await api<{ narrative: string }>("/api/ai/predictions/narrative");
    setNarrative(n?.narrative ?? "");
    setNarrativeLoading(false);
  }, []);

  useEffect(() => { void reloadAll(); }, [reloadAll]);

  const refresh = () => {
    void reloadAll();
    toast({ title: "تم التحديث" });
  };

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-7xl mx-auto" data-testid="ai-insights-page">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Brain className="text-fuchsia-400" size={24} />
              مركز الذكاء الاصطناعي
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              تنبؤ ذكي • توصيات • كشف شذوذ — مدعوم بـ Claude Haiku 4.5
            </p>
          </div>
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-accent transition-colors"
            data-testid="ai-reload"
          >
            <RefreshCw size={12} /> تحديث
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-card border border-border rounded-2xl w-fit" data-testid="ai-tabs">
          <TabButton tab="predict" current={tab} onClick={setTab} icon={<TrendingUp size={14} />} label="التنبؤات" />
          <TabButton tab="recommend" current={tab} onClick={setTab} icon={<Sparkles size={14} />} label="التوصيات" />
          <TabButton tab="anomaly" current={tab} onClick={setTab} icon={<AlertTriangle size={14} />} label="التنبيهات" />
        </div>

        {loading && (
          <div className="text-xs text-muted-foreground text-center py-8" data-testid="ai-loading">
            جارٍ تحميل التحليلات...
          </div>
        )}

        {/* ─── PREDICT TAB ────────────────────────────────────────────── */}
        {!loading && tab === "predict" && (
          <div className="space-y-4" data-testid="tab-predict">
            {daily && (
              <>
                {/* KPI row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard label="إيرادات الغد المتوقعة" value={`${daily.totalPredictedRevenue.toLocaleString("ar-SA")} ر.س`}
                    icon={<TrendingUp size={16} />} tone="emerald" />
                  <KpiCard label="عدد الطلبات المتوقع" value={String(daily.totalPredictedOrders)}
                    icon={<Activity size={16} />} tone="sky" />
                  <KpiCard label="ساعة الذروة" value={`${daily.peakHour}:00`}
                    icon={<Clock size={16} />} tone="amber" />
                  <KpiCard label="مستوى الثقة" value={`${daily.averageConfidence}%`}
                    icon={<Brain size={16} />} tone="fuchsia" />
                </div>

                {/* Staffing */}
                <div className="bg-card border border-border rounded-2xl p-4">
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-1.5">
                    <Users size={14} className="text-sky-400" />
                    الموظفون المطلوبون
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <StaffingBox label="نوادل" count={daily.staffing.waiters} />
                    <StaffingBox label="مطبخ" count={daily.staffing.kitchenStaff} />
                    <StaffingBox label="كاشير" count={daily.staffing.cashiers} />
                  </div>
                </div>

                {/* Top products */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-bold">المنتجات الأعلى توقعاً للغد</h3>
                    <span className="text-[10px] text-muted-foreground">{daily.topProducts.length} منتج</span>
                  </div>
                  {daily.topProducts.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">لا توجد بيانات كافية للتنبؤ — أضف المزيد من الطلبات أولاً</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {daily.topProducts.map((p) => (
                        <div key={p.productId} className="px-4 py-3 flex items-center justify-between gap-3" data-testid={`predict-product-${p.productId}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{p.productName}</span>
                              <TrendBadge trend={p.trend} />
                              <ConfidenceBadge value={p.confidence} />
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              ساعات الذروة: {p.peakHours.map(h => `${h}:00`).join(" · ") || "—"}
                              {" "}· مخزون مقترح: {p.recommendedStock}
                              {" "}· تاريخ: {p.daysOfHistory} يوم
                            </p>
                          </div>
                          <div className="text-end shrink-0">
                            <p className="text-xl font-bold text-fuchsia-400">{p.predictedQuantity}</p>
                            <p className="text-[10px] text-muted-foreground">وحدة</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Inventory plan */}
                <div className="bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                    <h3 className="text-sm font-bold flex items-center gap-1.5">
                      <Package size={14} className="text-amber-400" />
                      خطة مخزون 7 أيام
                    </h3>
                  </div>
                  {inventory.length === 0 ? (
                    <p className="px-4 py-6 text-center text-xs text-muted-foreground">لا توجد توصيات — أضف بيانات أكثر</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {inventory.slice(0, 10).map((it) => (
                        <div key={it.productId} className="px-4 py-2.5 flex items-center justify-between gap-3" data-testid={`inv-${it.productId}`}>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">{it.productName}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${URGENCY_STYLE[it.urgency]}`}>
                                {it.urgency === "high" ? "عاجل" : it.urgency === "medium" ? "متوسط" : "منخفض"}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{it.note}</p>
                          </div>
                          <div className="text-end shrink-0">
                            <p className="text-sm font-bold">{it.totalNeededQty}</p>
                            <p className="text-[10px] text-muted-foreground">{it.dailyAverage}/يوم</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* LLM narrative */}
                <div className="bg-card border border-border rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold flex items-center gap-1.5">
                      <Sparkles size={14} className="text-fuchsia-400" />
                      تحليل ذكي للغد
                    </h3>
                    <button
                      onClick={() => void loadNarrative()}
                      disabled={narrativeLoading}
                      className="text-[11px] text-fuchsia-400 hover:underline disabled:opacity-50"
                      data-testid="narrative-generate"
                    >
                      {narrativeLoading ? "جارٍ التحليل..." : narrative ? "إعادة توليد" : "اكتب لي توصيات"}
                    </button>
                  </div>
                  {narrative ? (
                    <div className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed" data-testid="narrative-text">
                      {narrative}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      اضغط "اكتب لي توصيات" لتلقي تحليل سياقي مكتوب بواسطة Claude Haiku.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── RECOMMEND TAB ─────────────────────────────────────────── */}
        {!loading && tab === "recommend" && (
          <div className="space-y-4" data-testid="tab-recommend">
            <div className="bg-card border border-border rounded-2xl p-4">
              <h3 className="text-sm font-bold mb-1">الأكثر طلباً في هذا الوقت</h3>
              <p className="text-[11px] text-muted-foreground mb-3">
                يحسب وزن مرجّح بساعة اليوم ويوم الأسبوع — حدّث الصفحة لمزامنته مع التغيرات.
              </p>
              {trending.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">لا توجد بيانات كافية بعد</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {trending.map((r, idx) => (
                    <div key={r.productId} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-secondary/40 rounded-xl" data-testid={`reco-${r.productId}`}>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-[10px] font-bold text-fuchsia-400 w-5 shrink-0">#{idx + 1}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{r.productName}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SOURCE_STYLE[r.source]}`}>
                              {SOURCE_LABEL[r.source]}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate">{r.reason}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-end shrink-0">
                        <p className="text-sm font-bold text-amber-400">{r.price.toFixed(2)}</p>
                        <p className="text-[10px] text-muted-foreground">ر.س</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <BasketTester />
          </div>
        )}

        {/* ─── ANOMALY TAB ──────────────────────────────────────────── */}
        {!loading && tab === "anomaly" && anomalyReport && (
          <div className="space-y-4" data-testid="tab-anomaly">
            <div className="flex items-center justify-between bg-card border border-border rounded-2xl px-4 py-3">
              <div>
                <p className="text-sm font-bold">{anomalyReport.totalAnomalies} تنبيه نشط</p>
                <p className="text-[11px] text-muted-foreground">
                  آخر فحص: {new Date(anomalyReport.generatedAt).toLocaleString("ar-SA")}
                </p>
              </div>
              <AlertTriangle size={20} className={anomalyReport.totalAnomalies > 0 ? "text-amber-400" : "text-emerald-400"} />
            </div>

            {anomalyReport.narrative && (
              <div className="bg-card border border-fuchsia-500/20 rounded-2xl p-4">
                <h3 className="text-sm font-bold mb-2 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-fuchsia-400" />
                  ملخص AI
                </h3>
                <div className="text-xs whitespace-pre-wrap leading-relaxed" data-testid="anomaly-narrative">
                  {anomalyReport.narrative}
                </div>
              </div>
            )}

            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-sm font-bold">التنبيهات التفصيلية</h3>
              </div>
              {anomalyReport.anomalies.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  لا توجد تنبيهات — العمليات اليوم طبيعية
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {anomalyReport.anomalies.map((a) => (
                    <div key={a.id} className="px-4 py-3" data-testid={`anomaly-${a.id}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] px-2 py-0.5 rounded border ${SEVERITY_STYLE[a.severity]}`}>
                              {a.severity === "critical" ? "حرج" : a.severity === "high" ? "عالي" : a.severity === "medium" ? "متوسط" : "منخفض"}
                            </span>
                            <span className="text-sm font-medium">{a.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{a.description}</p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {Object.entries(a.metrics).map(([k, v]) => (
                              <span key={k} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/50 text-foreground/70">
                                {k}: {String(v)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────

function TabButton({ tab, current, onClick, icon, label }: {
  tab: Tab; current: Tab; onClick: (t: Tab) => void; icon: React.ReactNode; label: string;
}) {
  const active = tab === current;
  return (
    <button
      onClick={() => onClick(tab)}
      data-testid={`tab-btn-${tab}`}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-colors ${
        active ? "bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {icon} {label}
    </button>
  );
}

function KpiCard({ label, value, icon, tone }: {
  label: string; value: string; icon: React.ReactNode; tone: "emerald" | "sky" | "amber" | "fuchsia";
}) {
  const colorMap = {
    emerald:  "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20",
    sky:      "text-sky-400 bg-sky-500/10 ring-sky-500/20",
    amber:    "text-amber-400 bg-amber-500/10 ring-amber-500/20",
    fuchsia:  "text-fuchsia-400 bg-fuchsia-500/10 ring-fuchsia-500/20",
  };
  return (
    <div className={`bg-card border border-border rounded-2xl p-4 ring-1 ${colorMap[tone].split(" ")[2]}`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[tone].split(" ").slice(0, 2).join(" ")}`}>
          {icon}
        </div>
      </div>
      <p className="text-xl font-bold mt-2">{value}</p>
    </div>
  );
}

function StaffingBox({ label, count }: { label: string; count: number }) {
  return (
    <div className="bg-secondary/40 rounded-xl px-3 py-3 text-center">
      <p className="text-2xl font-bold text-sky-400">{count}</p>
      <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
    </div>
  );
}

function TrendBadge({ trend }: { trend: ProductPrediction["trend"] }) {
  const map = {
    rising:  { label: "صاعد", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    stable:  { label: "ثابت", cls: "bg-muted/30 text-muted-foreground border-border" },
    falling: { label: "نازل", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
  };
  const m = map[trend];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded border ${m.cls}`}>{m.label}</span>;
}

function ConfidenceBadge({ value }: { value: number }) {
  const cls = value >= 70 ? "text-emerald-400" : value >= 50 ? "text-amber-400" : "text-muted-foreground";
  return <span className={`text-[10px] ${cls}`}>ثقة {value}%</span>;
}

function BasketTester() {
  const [ids, setIds] = useState("");
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const run = async () => {
    const parsed = ids.split(",").map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n > 0);
    if (parsed.length === 0) {
      toast({ title: "أدخل معرفات منتجات صحيحة", variant: "destructive" });
      return;
    }
    setLoading(true);
    const r = await api<Recommendation[]>("/api/ai/recommendations/basket", {
      method: "POST",
      body: JSON.stringify({ cartProductIds: parsed, limit: 5 }),
    });
    setRecs(r ?? []);
    setLoading(false);
  };

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <h3 className="text-sm font-bold mb-1">جرّب توصيات السلة</h3>
      <p className="text-[11px] text-muted-foreground mb-3">
        أدخل معرفات منتجات (مفصولة بفاصلة) لمعرفة ما يُطلب معها عادة.
      </p>
      <div className="flex gap-2">
        <input
          value={ids}
          onChange={e => setIds(e.target.value)}
          placeholder="مثال: 1, 2, 5"
          className="flex-1 px-3 py-2 text-xs bg-secondary border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-fuchsia-500"
          data-testid="basket-input"
          dir="ltr"
        />
        <button
          onClick={() => void run()}
          disabled={loading}
          className="px-3 py-2 text-xs bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30 rounded-lg hover:bg-fuchsia-500/25 disabled:opacity-50"
          data-testid="basket-run"
        >
          {loading ? "..." : "تجربة"}
        </button>
      </div>
      {recs.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {recs.map((r) => (
            <div key={r.productId} className="flex items-center justify-between gap-2 px-3 py-2 bg-secondary/40 rounded-lg text-xs" data-testid={`basket-rec-${r.productId}`}>
              <div className="min-w-0">
                <p className="font-medium truncate">{r.productName}</p>
                <p className="text-[10px] text-muted-foreground">{r.reason}</p>
              </div>
              <span className="text-amber-400 font-bold shrink-0">{r.price.toFixed(2)} ر.س</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
