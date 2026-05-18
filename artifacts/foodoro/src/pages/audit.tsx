import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Search, Filter, Clock, User, Database, Eye, RefreshCw, ChevronDown } from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const ACTION_COLORS: Record<string, string> = {
  create: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  update: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  delete: "text-red-400 bg-red-400/10 border-red-400/20",
  login:  "text-primary bg-primary/10 border-primary/20",
  award_points: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  redeem_points: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  order_created: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  order_completed: "text-teal-400 bg-teal-400/10 border-teal-400/20",
  revoke: "text-red-400 bg-red-400/10 border-red-400/20",
  create_user: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
};

interface AuditLog {
  id: number;
  user_id: number | null;
  user_name: string | null;
  action: string;
  resource: string;
  resource_id: number | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export default function AuditPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data: logs, isLoading, refetch } = useQuery<AuditLog[]>({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/audit?limit=100", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      const body = await res.json() as { data?: AuditLog[] } | AuditLog[];
      return Array.isArray(body) ? body : (body.data ?? []);
    },
    refetchInterval: 30000,
  });

  const actions = ["all", ...new Set((logs ?? []).map(l => l.action))];

  const filtered = (logs ?? []).filter(l => {
    const matchSearch = !search ||
      l.action.includes(search.toLowerCase()) ||
      l.resource.includes(search.toLowerCase()) ||
      (l.user_name ?? "").toLowerCase().includes(search.toLowerCase());
    const matchAction = actionFilter === "all" || l.action === actionFilter;
    return matchSearch && matchAction;
  });

  function timeSince(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return isAr ? "الآن" : "just now";
    if (m < 60) return isAr ? `${m} دقيقة` : `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return isAr ? `${h} ساعة` : `${h}h ago`;
    return isAr ? `${Math.floor(h / 24)} يوم` : `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "سجل التدقيق" : "Audit Log"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "تتبع جميع العمليات في النظام" : "Track all system operations"}</p>
          </div>
        </div>
        <button onClick={() => void refetch()} className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: isAr ? "إجمالي الأحداث" : "Total Events", value: (logs ?? []).length },
          { label: isAr ? "اليوم" : "Today", value: (logs ?? []).filter(l => new Date(l.created_at) > new Date(Date.now() - 86400000)).length, color: "text-primary" },
          { label: isAr ? "مستخدمون فريدون" : "Unique Users", value: new Set((logs ?? []).map(l => l.user_id).filter(Boolean)).size, color: "text-blue-400" },
          { label: isAr ? "آخر ساعة" : "Last Hour", value: (logs ?? []).filter(l => new Date(l.created_at) > new Date(Date.now() - 3600000)).length, color: "text-amber-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-3 rounded-2xl bg-card border border-border text-center">
            <p className={`text-xl font-bold ${color ?? "text-foreground"}`}>{value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-8 bg-card border-border h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? "البحث..." : "Search..."} />
        </div>
        <div className="relative">
          <select value={actionFilter} onChange={e => setActionFilter(e.target.value)}
            className="h-9 px-3 pe-7 rounded-xl bg-card border border-border text-sm text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary">
            {actions.map(a => <option key={a} value={a}>{a === "all" ? (isAr ? "جميع الأحداث" : "All events") : a}</option>)}
          </select>
          <Filter size={11} className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </div>
      </div>

      {/* Log entries */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground border border-dashed border-border rounded-2xl">
            <Eye size={24} className="mb-2 opacity-30" />
            <p className="text-sm">{isAr ? "لا توجد سجلات" : "No audit logs"}</p>
            <p className="text-xs mt-1 opacity-60">{isAr ? "ستظهر هنا الأحداث عند حدوثها" : "Events will appear here as they occur"}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map(log => {
              const colorCls = ACTION_COLORS[log.action] ?? "text-muted-foreground bg-muted/30 border-border";
              const isOpen = expanded === log.id;
              return (
                <motion.div key={log.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className="rounded-2xl bg-card border border-border overflow-hidden">
                  <button className="w-full flex items-center gap-3 p-3.5 text-start" onClick={() => setExpanded(isOpen ? null : log.id)}>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border whitespace-nowrap ${colorCls}`}>
                      {log.action}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        <span className="text-primary">{log.resource}</span>
                        {log.resource_id ? ` #${log.resource_id}` : ""}
                      </p>
                      {log.user_name && (
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <User size={9} /> {log.user_name}
                        </p>
                      )}
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock size={9} /> {timeSince(log.created_at)}
                      </p>
                    </div>
                    <ChevronDown size={12} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && log.metadata && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="border-t border-border overflow-hidden">
                        <div className="p-3.5 space-y-2">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <Database size={10} />
                            <span>{isAr ? "البيانات الوصفية" : "Metadata"}</span>
                            {log.ip_address && <span className="ms-auto font-mono">{log.ip_address}</span>}
                          </div>
                          <pre className="text-[10px] text-muted-foreground bg-background border border-border rounded-xl p-2.5 overflow-auto font-mono max-h-32">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                          <p className="text-[10px] text-muted-foreground">
                            {new Date(log.created_at).toLocaleString()}
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
