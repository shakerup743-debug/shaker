import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Shield, AlertTriangle, ShieldCheck, ShieldOff, RefreshCw, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FraudStats {
  todayAttempts: number;
  blockedEntries: number;
  pendingApproval: number;
}

interface FraudAttempt {
  id: number;
  detection_type: string;
  qr_token: string | null;
  device_fingerprint: string | null;
  ip_address: string | null;
  phone_number: string | null;
  fraud_score: number | null;
  severity: "low" | "medium" | "high" | "critical";
  action_taken: string;
  metadata: Record<string, unknown>;
  detected_at: string;
}

interface PendingOrder {
  id: number;
  order_id: number;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  fraud_score: number;
  fraud_flags: string[];
  risk_level: string;
  status: string;
  total: number;
  created_at: string;
}

interface BlacklistEntry {
  id: number;
  blacklist_type: string;
  value: string;
  reason: string | null;
  blocked_at: string;
  expires_at: string | null;
}

const SEVERITY_COLOR: Record<string, string> = {
  low:      "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  medium:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
  high:     "bg-orange-500/10 text-orange-400 border-orange-500/30",
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("foodoro-token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function FraudMonitoringPage() {
  const [stats, setStats] = useState<FraudStats>({ todayAttempts: 0, blockedEntries: 0, pendingApproval: 0 });
  const [attempts, setAttempts] = useState<FraudAttempt[]>([]);
  const [pending, setPending] = useState<PendingOrder[]>([]);
  const [blacklist, setBlacklist] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const reload = useCallback(async () => {
    try {
      const [s, a, p, b] = await Promise.all([
        fetch("/api/admin/fraud/stats",     { headers: authHeaders() }).then((r) => r.json()),
        fetch("/api/admin/fraud/attempts?limit=30", { headers: authHeaders() }).then((r) => r.json()),
        fetch("/api/admin/fraud/pending",   { headers: authHeaders() }).then((r) => r.json()),
        fetch("/api/admin/fraud/blacklist", { headers: authHeaders() }).then((r) => r.json()),
      ]);
      setStats(s);
      setAttempts(Array.isArray(a) ? a : []);
      setPending(Array.isArray(p) ? p : []);
      setBlacklist(Array.isArray(b) ? b : []);
    } catch (e) {
      toast({ title: "خطأ", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void reload();
    const t = setInterval(() => void reload(), 30_000);
    return () => clearInterval(t);
  }, [reload]);

  const approve = async (id: number) => {
    await fetch(`/api/admin/fraud/orders/${id}/approve`, { method: "POST", headers: authHeaders() });
    toast({ title: "تمت الموافقة" });
    void reload();
  };

  const reject = async (id: number) => {
    const reason = prompt("سبب الرفض؟", "طلب احتيالي مؤكد") ?? undefined;
    await fetch(`/api/admin/fraud/orders/${id}/reject`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    toast({ title: "تم الرفض وحظر العميل لـ 7 أيام" });
    void reload();
  };

  const unblacklist = async (id: number) => {
    if (!confirm("إزالة من القائمة السوداء؟")) return;
    await fetch(`/api/admin/fraud/blacklist/${id}`, { method: "DELETE", headers: authHeaders() });
    void reload();
  };

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-7xl mx-auto" data-testid="fraud-page">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="text-primary" size={24} />
              مراقبة الاحتيال
            </h1>
            <p className="text-xs text-muted-foreground mt-1">حماية متعددة الطبقات لطلبات QR</p>
          </div>
          <button
            onClick={() => void reload()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-foreground text-xs hover:bg-accent transition-colors"
            data-testid="fraud-reload"
          >
            <RefreshCw size={12} /> تحديث
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <StatCard label="محاولات اليوم"   value={stats.todayAttempts}   icon={<AlertTriangle size={16} />} tone="amber" />
          <StatCard label="عناصر محظورة"     value={stats.blockedEntries}   icon={<ShieldOff size={16} />}     tone="red" />
          <StatCard label="بانتظار الموافقة" value={stats.pendingApproval}  icon={<ShieldCheck size={16} />}   tone="orange" />
        </div>

        {/* Pending approvals */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold">طلبات بانتظار موافقتك</h2>
            <span className="text-xs text-muted-foreground">{pending.length} طلب</span>
          </div>
          {pending.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">لا توجد طلبات معلقة 👍</p>
          ) : (
            <div className="divide-y divide-border">
              {pending.map((o) => (
                <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-4 py-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between" data-testid={`pending-row-${o.id}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">#{o.order_number}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${SEVERITY_COLOR[o.risk_level] ?? SEVERITY_COLOR.medium}`}>
                        Score {o.fraud_score} / {o.risk_level}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {o.customer_name} · {o.customer_phone} · {o.total?.toFixed(2)} ر.س
                    </p>
                    {o.fraud_flags?.length > 0 && (
                      <p className="text-[10px] text-amber-400 mt-0.5 truncate">⚠ {o.fraud_flags.join(" · ")}</p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => void approve(o.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs hover:bg-emerald-500/20 transition-colors"
                      data-testid={`approve-${o.id}`}
                    >
                      <Check size={12} /> موافقة
                    </button>
                    <button
                      onClick={() => void reject(o.id)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 text-xs hover:bg-red-500/20 transition-colors"
                      data-testid={`reject-${o.id}`}
                    >
                      <X size={12} /> رفض وحظر
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Recent fraud attempts */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold">آخر المحاولات المكتشفة</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-muted-foreground text-[10px]">
                <tr>
                  <th className="px-3 py-2 text-start">الوقت</th>
                  <th className="px-3 py-2 text-start">النوع</th>
                  <th className="px-3 py-2 text-start">الدرجة</th>
                  <th className="px-3 py-2 text-start">الجوال</th>
                  <th className="px-3 py-2 text-start">IP</th>
                  <th className="px-3 py-2 text-start">الإجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attempts.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">لا توجد محاولات حتى الآن</td></tr>
                ) : attempts.map((a) => (
                  <tr key={a.id} data-testid={`attempt-row-${a.id}`}>
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(a.detected_at).toLocaleString("ar-SA")}</td>
                    <td className="px-3 py-2 truncate max-w-[200px]" title={a.detection_type}>{a.detection_type}</td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${SEVERITY_COLOR[a.severity] ?? SEVERITY_COLOR.medium}`}>
                        {a.fraud_score ?? "-"}
                      </span>
                    </td>
                    <td className="px-3 py-2 [direction:ltr]">{a.phone_number ?? "-"}</td>
                    <td className="px-3 py-2 [direction:ltr] text-muted-foreground">{a.ip_address ?? "-"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{a.action_taken}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Blacklist */}
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-bold">القائمة السوداء</h2>
          </div>
          {blacklist.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">القائمة فارغة 👍</p>
          ) : (
            <div className="divide-y divide-border">
              {blacklist.map((b) => (
                <div key={b.id} className="px-4 py-2.5 flex items-center justify-between gap-3" data-testid={`blacklist-row-${b.id}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <span className="text-muted-foreground">{b.blacklist_type}:</span>{" "}
                      <span className="font-mono [direction:ltr]">{b.value.slice(0, 40)}{b.value.length > 40 ? "…" : ""}</span>
                    </p>
                    {b.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{b.reason}</p>}
                    {b.expires_at && (
                      <p className="text-[10px] text-muted-foreground/60">حتى {new Date(b.expires_at).toLocaleString("ar-SA")}</p>
                    )}
                  </div>
                  <button
                    onClick={() => void unblacklist(b.id)}
                    className="text-[11px] text-primary hover:underline shrink-0"
                    data-testid={`unblock-${b.id}`}
                  >
                    إلغاء الحظر
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {loading && (
          <p className="text-center text-xs text-muted-foreground">جاري التحميل...</p>
        )}
    </div>
  );
}

function StatCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "amber" | "red" | "orange" }) {
  const ringColor = tone === "red" ? "ring-red-500/20" : tone === "amber" ? "ring-amber-500/20" : "ring-orange-500/20";
  const iconColor = tone === "red" ? "text-red-400 bg-red-500/10" : tone === "amber" ? "text-amber-400 bg-amber-500/10" : "text-orange-400 bg-orange-500/10";
  return (
    <div className={`bg-card border border-border rounded-2xl p-4 ring-1 ${ringColor}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  );
}
