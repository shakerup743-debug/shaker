import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Monitor, AlertTriangle, Lock, RefreshCw, Smartphone,
  Globe, X, CheckCircle2, Clock, Copy, Info,
  Fingerprint, ShieldAlert, Activity, ChevronDown, Shield,
  KeyRound, ToggleLeft, ToggleRight, Eye, EyeOff, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BarChart, Bar, XAxis, YAxis, Tooltip as ChartTooltip, ResponsiveContainer } from "recharts";

// ── Types ──────────────────────────────────────────────────────────────────

interface UserSession {
  id: number;
  userId: number;
  userName: string | null;
  userRole: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  deviceFingerprint: string | null;
  isSuccess: boolean;
  revoked: boolean;
  mfaVerified: boolean;
  isCurrent: boolean;
  lastActiveAt: string;
  createdAt: string;
}

interface SecurityEvent {
  id: number;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  ipAddress: string | null;
  userId: number | null;
  userName: string | null;
  metadata: Record<string, unknown> | null;
  resolved: boolean;
  createdAt: string;
}

interface EventSummary {
  total_events_today: number;
  brute_force_today: number;
  failed_logins_today: number;
  active_sessions: number;
  mfa_adoption_rate: number;
  mfa_enabled_count: number;
  total_users: number;
}

interface MfaSetupData {
  secret: string;
  otpAuthUrl: string;
  qrDataUrl: string | null;
}

interface MasterPasswordStatus {
  exists: boolean;
  createdAt?: string;
  lastChangedAt?: string;
  lastUsedAt?: string;
  usageCount?: number;
}

interface ProtectedOperation {
  id: number;
  operationKey: string;
  operationNameEn: string;
  operationNameAr: string;
  description: string | null;
  requiresPassword: boolean;
  isEnabled: boolean;
  riskLevel: string;
}

interface ApiUser {
  sub: string;
  role: string;
  tenantId: number | null;
}

// ── Constants ──────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  low:      "text-blue-400 bg-blue-400/10 border-blue-400/20",
  medium:   "text-amber-400 bg-amber-400/10 border-amber-400/20",
  high:     "text-orange-400 bg-orange-400/10 border-orange-400/20",
  critical: "text-red-400 bg-red-400/10 border-red-400/20",
};

const EVENT_LABELS: Record<string, { en: string; ar: string }> = {
  login_failed:     { en: "Login Failed",      ar: "فشل تسجيل الدخول" },
  brute_force:      { en: "Brute Force",        ar: "هجوم تخميني" },
  suspicious_ip:    { en: "Suspicious IP",      ar: "IP مشبوه" },
  account_locked:   { en: "Account Locked",     ar: "حساب مقفل" },
  mfa_failed:       { en: "MFA Failed",         ar: "فشل MFA" },
  session_revoked:  { en: "Session Revoked",    ar: "إلغاء جلسة" },
  mfa_enabled:      { en: "MFA Enabled",        ar: "تفعيل MFA" },
  mfa_disabled:     { en: "MFA Disabled",       ar: "تعطيل MFA" },
  login_success:    { en: "Login Success",      ar: "دخول ناجح" },
};

function timeSince(iso: string, isAr: boolean) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return isAr ? "الآن" : "just now";
  if (m < 60) return isAr ? `${m}د` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return isAr ? `${h}س` : `${h}h ago`;
  return isAr ? `${Math.floor(h / 24)}ي` : `${Math.floor(h / 24)}d ago`;
}

function DeviceIcon({ userAgent }: { userAgent: string | null }) {
  if (!userAgent) return <Monitor size={14} />;
  if (/Mobile|Android|iPhone/i.test(userAgent)) return <Smartphone size={14} />;
  return <Monitor size={14} />;
}

function deviceLabel(userAgent: string | null, isAr: boolean) {
  if (!userAgent) return isAr ? "جهاز غير معروف" : "Unknown";
  if (/Mobile|Android|iPhone/i.test(userAgent)) return isAr ? "هاتف محمول" : "Mobile";
  if (/Mac/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows";
  return isAr ? "سطح المكتب" : "Desktop";
}

// ── Access Denied (non-admin) ──────────────────────────────────────────────

function AccessDenied({ isAr }: { isAr: boolean }) {
  return (
    <div className="h-full flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 p-8 text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center">
          <Lock size={28} className="text-red-400" />
        </div>
        <h2 className="text-lg font-bold text-foreground">
          {isAr ? "وصول مقيّد" : "Access Restricted"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isAr
            ? "مركز الأمان متاح لمدير النظام والمالك فقط."
            : "The Security Center is only available to administrators and owners."}
        </p>
      </div>
    </div>
  );
}

// ── Overview Tab ───────────────────────────────────────────────────────────

function buildActivityData(events: SecurityEvent[], isAr: boolean) {
  const days: Record<string, { logins: number; threats: number }> = {};
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toLocaleDateString(isAr ? "ar" : "en-US", { weekday: "short" });
    days[key] = { logins: 0, threats: 0 };
  }
  events.forEach(e => {
    const d = new Date(e.createdAt);
    const key = d.toLocaleDateString(isAr ? "ar" : "en-US", { weekday: "short" });
    if (key in days) {
      if (["brute_force", "mfa_failed", "suspicious_ip", "account_locked"].includes(e.type)) {
        days[key].threats++;
      } else if (e.type === "login_success") {
        days[key].logins++;
      }
    }
  });
  return Object.entries(days).map(([name, v]) => ({ name, ...v }));
}

function OverviewTab({
  summary, events, isLoading, isAr,
}: {
  summary: EventSummary | undefined;
  events: SecurityEvent[] | undefined;
  isLoading: boolean;
  isAr: boolean;
}) {
  const stats = [
    {
      label: isAr ? "الجلسات النشطة" : "Active Sessions",
      value: summary?.active_sessions ?? 0,
      icon: Monitor,
      color: "text-blue-400",
      bg: "bg-blue-400/10 border-blue-400/20",
    },
    {
      label: isAr ? "محاولات فاشلة (اليوم)" : "Failed Logins (today)",
      value: summary?.failed_logins_today ?? 0,
      icon: AlertTriangle,
      color: (summary?.failed_logins_today ?? 0) > 0 ? "text-amber-400" : "text-muted-foreground",
      bg: (summary?.failed_logins_today ?? 0) > 0 ? "bg-amber-400/10 border-amber-400/20" : "bg-card border-border",
    },
    {
      label: isAr ? "هجمات تخمينية (اليوم)" : "Brute Force (today)",
      value: summary?.brute_force_today ?? 0,
      icon: ShieldAlert,
      color: (summary?.brute_force_today ?? 0) > 0 ? "text-red-400" : "text-muted-foreground",
      bg: (summary?.brute_force_today ?? 0) > 0 ? "bg-red-400/10 border-red-400/20" : "bg-card border-border",
    },
    {
      label: isAr ? "نسبة تفعيل MFA" : "MFA Adoption",
      value: `${summary?.mfa_adoption_rate ?? 0}%`,
      icon: Fingerprint,
      color: (summary?.mfa_adoption_rate ?? 0) >= 50 ? "text-emerald-400" : "text-amber-400",
      bg: (summary?.mfa_adoption_rate ?? 0) >= 50 ? "bg-emerald-400/10 border-emerald-400/20" : "bg-amber-400/10 border-amber-400/20",
    },
  ];

  const chartData = buildActivityData(events ?? [], isAr);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`p-4 rounded-2xl border ${bg}`}>
            {isLoading ? (
              <Skeleton className="h-12 w-full rounded-xl" />
            ) : (
              <>
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${bg}`}>
                  <Icon size={15} className={color} />
                </div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{label}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Activity chart — last 7 days */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <p className="text-xs font-semibold text-foreground mb-3 flex items-center gap-2">
          <Activity size={12} className="text-primary" />
          {isAr ? "نشاط آخر 7 أيام" : "Activity — last 7 days"}
        </p>
        <ResponsiveContainer width="100%" height={80}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 9, fill: "#6B7280" }} axisLine={false} tickLine={false} />
            <ChartTooltip
              contentStyle={{ background: "#1F2937", border: "1px solid #374151", borderRadius: 8, fontSize: 11 }}
              labelStyle={{ color: "#D1D5DB" }}
            />
            <Bar dataKey="threats" fill="#EF4444" radius={[3, 3, 0, 0]} name={isAr ? "تهديدات" : "Threats"} />
            <Bar dataKey="logins" fill="#E67E22" radius={[3, 3, 0, 0]} name={isAr ? "تسجيل دخول" : "Logins"} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {summary && (
        <div className="p-4 rounded-2xl bg-card border border-border space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Fingerprint size={13} className="text-primary" />
            <p className="text-xs font-semibold text-foreground">{isAr ? "إحصائيات MFA" : "MFA Statistics"}</p>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{isAr ? "مفعّل" : "Enabled"}</span>
            <span className="font-medium text-emerald-400">{summary.mfa_enabled_count} / {summary.total_users}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${summary.mfa_adoption_rate}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sessions Tab ───────────────────────────────────────────────────────────

function SessionsTab({ isAr, fetcher }: { isAr: boolean; fetcher: (path: string, opts?: RequestInit) => Promise<unknown> }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);

  const { data: sessions, isLoading } = useQuery<UserSession[]>({
    queryKey: ["security-sessions"],
    queryFn: () => fetcher("/api/security/sessions") as Promise<UserSession[]>,
    refetchInterval: 30000,
  });

  const revokeMut = useMutation({
    mutationFn: (id: number) => fetcher(`/api/security/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["security-sessions"] });
      void qc.invalidateQueries({ queryKey: ["security-summary"] });
      toast({ title: isAr ? "تم إلغاء الجلسة" : "Session revoked" });
    },
  });

  const revokeableSessions = (sessions ?? []).filter(s => !s.isCurrent && !s.revoked && s.isSuccess);

  function sessionStatus(s: UserSession) {
    if (!s.isSuccess) return { label: isAr ? "فشل" : "Failed", color: "text-red-400 bg-red-400/10 border-red-400/20" };
    if (s.revoked) return { label: isAr ? "ملغاة" : "Revoked", color: "text-muted-foreground bg-muted/30 border-border" };
    if (s.isCurrent) return { label: isAr ? "الحالية" : "Current", color: "text-primary bg-primary/10 border-primary/30" };
    return { label: isAr ? "نشطة" : "Active", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" };
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {isLoading ? "..." : `${(sessions ?? []).filter(s => s.isSuccess && !s.revoked).length} ${isAr ? "جلسة نشطة" : "active sessions"}`}
        </p>
        {revokeableSessions.length > 0 && (
          <button onClick={() => setRevokeAllOpen(true)} className="text-xs text-red-400 hover:text-red-300 transition-colors">
            {isAr ? "إلغاء الجلسات الأخرى" : "Revoke other sessions"}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : (sessions ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground border border-dashed border-border rounded-2xl">
            <Monitor size={24} className="mb-2 opacity-30" />
            <p className="text-sm">{isAr ? "لا جلسات" : "No sessions"}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {(sessions ?? []).map(session => {
              const status = sessionStatus(session);
              return (
                <motion.div
                  key={session.id}
                  layout
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`p-3.5 rounded-2xl border transition-all ${session.isCurrent ? "bg-primary/5 border-primary/30" : session.revoked || !session.isSuccess ? "bg-muted/20 border-border opacity-60" : "bg-card border-border"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${session.isCurrent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <DeviceIcon userAgent={session.userAgent} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground">{deviceLabel(session.userAgent, isAr)}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${status.color}`}>{status.label}</span>
                        {session.mfaVerified && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">MFA ✓</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {session.ipAddress && (
                          <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                            <Globe size={9} /> {session.ipAddress}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock size={9} /> {timeSince(session.createdAt, isAr)}
                        </span>
                      </div>
                    </div>
                    {!session.isCurrent && !session.revoked && session.isSuccess && (
                      <button
                        onClick={() => revokeMut.mutate(session.id)}
                        disabled={revokeMut.isPending}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      <Dialog open={revokeAllOpen} onOpenChange={setRevokeAllOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              {isAr ? "إلغاء الجلسات الأخرى" : "Revoke Other Sessions"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {isAr ? "سيتم تسجيل الخروج من جميع الأجهزة الأخرى. الجلسة الحالية ستبقى." : "All other devices will be signed out. Your current session stays active."}
          </p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setRevokeAllOpen(false)} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm font-medium">
              {isAr ? "إلغاء" : "Cancel"}
            </button>
            <button
              onClick={() => {
                revokeableSessions.forEach(s => revokeMut.mutate(s.id));
                setRevokeAllOpen(false);
              }}
              className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-semibold"
            >
              {isAr ? "تأكيد" : "Confirm"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Threats Tab ────────────────────────────────────────────────────────────

function ThreatsTab({ isAr, fetcher }: { isAr: boolean; fetcher: (path: string, opts?: RequestInit) => Promise<unknown> }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [severityFilter, setSeverityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data: events, isLoading } = useQuery<SecurityEvent[]>({
    queryKey: ["security-events"],
    queryFn: () => fetcher("/api/security/events?limit=100") as Promise<SecurityEvent[]>,
    refetchInterval: 30000,
  });

  const filtered = (events ?? []).filter(e => {
    const matchSev = severityFilter === "all" || e.severity === severityFilter;
    const matchType = typeFilter === "all" || e.type === typeFilter;
    return matchSev && matchType;
  });

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {["all", "critical", "high", "medium", "low"].map(sev => (
          <button key={sev} onClick={() => setSeverityFilter(sev)}
            className={`shrink-0 px-3 py-1 rounded-full border text-[11px] font-medium transition-all ${severityFilter === sev ? (sev === "all" ? "bg-primary text-white border-primary" : (SEVERITY_COLORS[sev] ?? "") + " ring-1 ring-current") : "border-border text-muted-foreground hover:text-foreground"}`}>
            {sev === "all" ? (isAr ? "الكل" : "All") : sev}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        {["all", "login_failed", "brute_force", "mfa_failed", "session_revoked"].map(t => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`shrink-0 px-3 py-1 rounded-full border text-[11px] font-medium transition-all ${typeFilter === t ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {t === "all" ? (isAr ? "الكل" : "All") : (EVENT_LABELS[t]?.[isAr ? "ar" : "en"] ?? t)}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground border border-dashed border-border rounded-2xl">
            <CheckCircle2 size={24} className="mb-2 opacity-30 text-emerald-400" />
            <p className="text-sm">{isAr ? "لا أحداث أمنية" : "No security events"}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map(e => {
              const lbl = EVENT_LABELS[e.type];
              const isOpen = expanded === e.id;
              return (
                <motion.div key={e.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-2xl bg-card border border-border overflow-hidden">
                  <button className="w-full flex items-center gap-3 p-3 text-start" onClick={() => setExpanded(isOpen ? null : e.id)}>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border whitespace-nowrap ${SEVERITY_COLORS[e.severity] ?? SEVERITY_COLORS.low}`}>{e.severity}</span>
                    <span className="flex-1 text-xs font-medium text-foreground truncate">{isAr ? lbl?.ar : lbl?.en ?? e.type}</span>
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0 hidden sm:block">{e.ipAddress ?? "—"}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeSince(e.createdAt, isAr)}</span>
                    <ChevronDown size={12} className={`text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {isOpen && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-border overflow-hidden">
                        <div className="p-3 space-y-2">
                          <div className="grid grid-cols-2 gap-2 text-[11px]">
                            {e.userName && <div><span className="text-muted-foreground">{isAr ? "المستخدم: " : "User: "}</span><span className="text-foreground">{e.userName}</span></div>}
                            {e.ipAddress && <div><span className="text-muted-foreground">IP: </span><span className="font-mono text-foreground">{e.ipAddress}</span></div>}
                            <div><span className="text-muted-foreground">{isAr ? "الوقت: " : "Time: "}</span><span className="text-foreground">{new Date(e.createdAt).toLocaleString()}</span></div>
                          </div>
                          {e.metadata && (
                            <pre className="text-[10px] font-mono text-muted-foreground bg-background border border-border rounded-xl p-2 overflow-auto max-h-24">
                              {JSON.stringify(e.metadata, null, 2)}
                            </pre>
                          )}
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

// ── MFA Status Grid (per-user) ─────────────────────────────────────────────

interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: string;
  mfaEnabled: boolean;
  isActive: boolean;
}

function MfaUserGrid({ isAr, fetcher }: { isAr: boolean; fetcher: (path: string, opts?: RequestInit) => Promise<unknown> }) {
  const { data: users, isLoading } = useQuery<StaffUser[]>({
    queryKey: ["staff-mfa-grid"],
    queryFn: () => fetcher("/api/users") as Promise<StaffUser[]>,
  });

  const activeUsers = (users ?? []).filter(u => u.isActive);
  const enabled = activeUsers.filter(u => u.mfaEnabled).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-foreground">{isAr ? "حالة MFA لأعضاء الفريق" : "Team MFA Status"}</p>
        <span className="text-[11px] text-muted-foreground">{enabled}/{activeUsers.length} {isAr ? "مفعّل" : "enabled"}</span>
      </div>
      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : (
        <div className="space-y-1.5">
          {activeUsers.map(user => (
            <div key={user.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-muted-foreground">{user.name.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user.role}</p>
              </div>
              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-semibold border ${user.mfaEnabled ? "bg-emerald-400/10 text-emerald-400 border-emerald-400/20" : "bg-muted text-muted-foreground border-border"}`}>
                <Shield size={10} />
                {user.mfaEnabled ? (isAr ? "مفعّل" : "On") : (isAr ? "غير مفعّل" : "Off")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── MFA Tab ────────────────────────────────────────────────────────────────

function MfaTab({ isAr, fetcher, mfaAdoptionRate, mfaEnabledCount, totalUsers }: {
  isAr: boolean;
  fetcher: (path: string, opts?: RequestInit) => Promise<unknown>;
  mfaAdoptionRate: number;
  mfaEnabledCount: number;
  totalUsers: number;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [phase, setPhase] = useState<"idle" | "setup" | "disable">("idle");
  const [setupData, setSetupData] = useState<MfaSetupData | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const setupMut = useMutation({
    mutationFn: () => fetcher("/api/security/mfa/setup", { method: "POST" }) as Promise<MfaSetupData>,
    onSuccess: (data) => { setSetupData(data); setPhase("setup"); setCode(""); },
    onError: (e: Error) => toast({ title: e.message.includes("already") ? (isAr ? "MFA مفعّل بالفعل" : "MFA already enabled") : (isAr ? "خطأ في الإعداد" : "Setup error"), variant: "destructive" }),
  });

  const verifyMut = useMutation({
    mutationFn: () => fetcher("/api/security/mfa/verify", { method: "POST", body: JSON.stringify({ code }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["security-summary"] });
      setPhase("idle"); setCode(""); setSetupData(null);
      toast({ title: isAr ? "تم تفعيل التحقق بخطوتين!" : "Two-factor auth enabled!" });
    },
    onError: () => toast({ title: isAr ? "رمز خاطئ" : "Invalid code", variant: "destructive" }),
  });

  const disableMut = useMutation({
    mutationFn: () => fetcher("/api/security/mfa", { method: "DELETE", body: JSON.stringify({ code }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["security-summary"] });
      setPhase("idle"); setCode("");
      toast({ title: isAr ? "تم تعطيل التحقق بخطوتين" : "Two-factor auth disabled" });
    },
    onError: () => toast({ title: isAr ? "رمز خاطئ" : "Invalid code", variant: "destructive" }),
  });

  function copySecret() {
    if (setupData?.secret) {
      void navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (phase === "setup" && setupData) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
          <p className="text-sm font-semibold text-foreground">{isAr ? "إعداد التحقق بخطوتين" : "Setup Two-Factor Auth"}</p>
          <p className="text-xs text-muted-foreground">{isAr ? "افتح Google Authenticator أو Authy وامسح رمز QR أو أضف الحساب يدويًا." : "Open Google Authenticator or Authy, scan the QR code or add manually."}</p>

          {/* QR Code */}
          {setupData.qrDataUrl ? (
            <div className="flex justify-center">
              <img src={setupData.qrDataUrl} alt="QR Code" className="w-40 h-40 rounded-xl border border-border bg-white p-1" />
            </div>
          ) : null}

          {/* Manual key */}
          <div className="p-3 rounded-xl bg-background border border-border">
            <p className="text-[10px] text-muted-foreground mb-1">{isAr ? "أو أدخل المفتاح يدويًا" : "Or enter key manually"}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-primary break-all">{setupData.secret}</code>
              <button onClick={copySecret} className="shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary hover:bg-primary/20 transition-colors">
                {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-400/5 border border-amber-400/20">
            <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-400">{isAr ? "الإعدادات: FOODORO، SHA1، 6 أرقام، 30 ثانية" : "Settings: FOODORO, SHA1, 6 digits, 30s period"}</p>
          </div>

          <Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="font-mono text-center text-lg tracking-widest bg-background border-border h-12" maxLength={6} />

          <div className="flex gap-2">
            <button onClick={() => { setPhase("idle"); setCode(""); }} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm font-medium">{isAr ? "إلغاء" : "Cancel"}</button>
            <button onClick={() => verifyMut.mutate()} disabled={code.length < 6 || verifyMut.isPending} className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50">
              {verifyMut.isPending ? (isAr ? "جارٍ التحقق..." : "Verifying...") : (isAr ? "تفعيل" : "Activate")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "disable") {
    return (
      <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <p className="text-sm font-semibold text-foreground">{isAr ? "تعطيل التحقق بخطوتين" : "Disable Two-Factor Auth"}</p>
        <p className="text-xs text-muted-foreground">{isAr ? "أدخل رمز التطبيق للتأكيد" : "Enter your authenticator app code to confirm."}</p>
        <Input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" className="font-mono text-center text-lg tracking-widest bg-background border-border h-12" maxLength={6} />
        <div className="flex gap-2">
          <button onClick={() => { setPhase("idle"); setCode(""); }} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm font-medium">{isAr ? "إلغاء" : "Cancel"}</button>
          <button onClick={() => disableMut.mutate()} disabled={code.length < 6 || disableMut.isPending} className="flex-1 h-10 rounded-xl bg-red-500 text-white text-sm font-semibold disabled:opacity-50">
            {disableMut.isPending ? (isAr ? "جارٍ..." : "Disabling...") : (isAr ? "تعطيل" : "Disable")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
        <div className="flex items-center gap-2">
          <Fingerprint size={14} className="text-primary" />
          <p className="text-xs font-semibold text-foreground">{isAr ? "إحصائيات التحقق بخطوتين" : "Team MFA Statistics"}</p>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{isAr ? "المستخدمون الذين فعّلوا MFA" : "Users with MFA enabled"}</span>
          <span className="font-semibold text-foreground">{mfaEnabledCount} / {totalUsers}</span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${mfaAdoptionRate}%` }} />
        </div>
        <p className="text-[11px] text-muted-foreground">{mfaAdoptionRate}% {isAr ? "نسبة التبني" : "adoption rate"}</p>
      </div>

      <div className="p-4 rounded-2xl bg-card border border-border space-y-2">
        <p className="text-xs font-medium text-foreground">{isAr ? "تحقق بخطوتين لحسابك" : "Your Two-Factor Auth"}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {isAr ? "طبقة حماية إضافية باستخدام Google Authenticator أو Authy. الرمز يتجدد كل 30 ثانية." : "Extra protection using Google Authenticator or Authy. Code refreshes every 30 seconds."}
        </p>
      </div>

      {/* Per-user MFA status grid */}
      <MfaUserGrid isAr={isAr} fetcher={fetcher} />

      <button onClick={() => setupMut.mutate()} disabled={setupMut.isPending} className="w-full h-11 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
        {setupMut.isPending ? (isAr ? "جارٍ الإعداد..." : "Setting up...") : (isAr ? "إعداد التحقق بخطوتين" : "Setup Two-Factor Auth")}
      </button>
      <button onClick={() => setPhase("disable")} className="w-full h-11 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors">
        {isAr ? "تعطيل التحقق بخطوتين" : "Disable Two-Factor Auth"}
      </button>
    </div>
  );
}

// ── Master Password Tab ────────────────────────────────────────────────────

function MasterPasswordTab({ isAr, fetcher }: { isAr: boolean; fetcher: (p: string, o?: RequestInit) => Promise<unknown> }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [showChange, setShowChange] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState<string[] | null>(null);

  // Create form
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);

  // Change form
  const [curPwd, setCurPwd] = useState("");
  const [changePwd, setChangePwd] = useState("");
  const [confirmChangePwd, setConfirmChangePwd] = useState("");

  const { data: status, isLoading } = useQuery<MasterPasswordStatus>({
    queryKey: ["master-password-status"],
    queryFn: () => fetcher("/api/security/master-password/status") as Promise<MasterPasswordStatus>,
    refetchOnWindowFocus: false,
  });

  const createMut = useMutation({
    mutationFn: (password: string) =>
      fetcher("/api/security/master-password/create", { method: "POST", body: JSON.stringify({ password }) }) as Promise<{ ok: boolean; backupCodes: string[] }>,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["master-password-status"] });
      setShowCreate(false);
      setNewPwd(""); setConfirmPwd("");
      setShowBackupCodes(data.backupCodes);
      toast({ title: isAr ? "تم إنشاء كلمة المرور الرئيسية" : "Master password created" });
    },
    onError: () => toast({ title: isAr ? "خطأ في الإنشاء" : "Failed to create", variant: "destructive" }),
  });

  const changeMut = useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      fetcher("/api/security/master-password/change", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["master-password-status"] });
      setShowChange(false);
      setCurPwd(""); setChangePwd(""); setConfirmChangePwd("");
      toast({ title: isAr ? "تم تغيير كلمة المرور الرئيسية" : "Master password changed" });
    },
    onError: (e: Error) => toast({ title: e.message.includes("incorrect") ? (isAr ? "كلمة المرور الحالية خاطئة" : "Current password incorrect") : (isAr ? "خطأ" : "Error"), variant: "destructive" }),
  });

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString(isAr ? "ar-SA" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  return (
    <div className="space-y-5">
      {/* Status Card */}
      <div className={`p-4 rounded-2xl border ${status?.exists ? "border-emerald-500/30 bg-emerald-500/5" : "border-orange-500/30 bg-orange-500/5"}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${status?.exists ? "bg-emerald-500/20" : "bg-orange-500/20"}`}>
            <KeyRound size={18} className={status?.exists ? "text-emerald-400" : "text-orange-400"} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">{isAr ? "كلمة المرور الرئيسية" : "Master Password"}</p>
            <p className={`text-xs ${status?.exists ? "text-emerald-400" : "text-orange-400"}`}>
              {status?.exists ? (isAr ? "مُعيَّنة ونشطة" : "Set & Active") : (isAr ? "لم تُعيَّن بعد" : "Not configured yet")}
            </p>
          </div>
          {status?.exists ? (
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold border border-emerald-500/30">
              {isAr ? "مُفعَّلة" : "ACTIVE"}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] font-semibold border border-orange-500/30">
              {isAr ? "غير مُعيَّنة" : "NOT SET"}
            </span>
          )}
        </div>
        {status?.exists && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-background/50">
              <p className="text-[10px] text-muted-foreground">{isAr ? "تاريخ الإنشاء" : "Created"}</p>
              <p className="text-xs font-medium mt-0.5">{fmtDate(status.createdAt)}</p>
            </div>
            <div className="p-2 rounded-xl bg-background/50">
              <p className="text-[10px] text-muted-foreground">{isAr ? "آخر تغيير" : "Last Changed"}</p>
              <p className="text-xs font-medium mt-0.5">{fmtDate(status.lastChangedAt)}</p>
            </div>
            <div className="p-2 rounded-xl bg-background/50">
              <p className="text-[10px] text-muted-foreground">{isAr ? "مرات الاستخدام" : "Usage Count"}</p>
              <p className="text-sm font-bold text-primary mt-0.5">{status.usageCount ?? 0}</p>
            </div>
          </div>
        )}
      </div>

      {!status?.exists && !showCreate && (
        <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle size={16} className="text-orange-400 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              {isAr
                ? "كلمة المرور الرئيسية تحمي العمليات الحساسة كحذف الطلبات وتعديل الأسعار والإعدادات. يُنصح بتعيينها فوراً."
                : "The master password protects sensitive operations like deleting orders, editing prices, and changing settings. Set it up immediately."}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            {isAr ? "إنشاء كلمة المرور الرئيسية" : "Create Master Password"}
          </button>
        </div>
      )}

      {showCreate && (
        <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 space-y-3">
          <p className="text-sm font-semibold">{isAr ? "إنشاء كلمة مرور رئيسية جديدة" : "Create New Master Password"}</p>
          <div className="space-y-2">
            <div className="relative">
              <Input
                type={showNewPwd ? "text" : "password"}
                className="bg-background border-border pe-10"
                placeholder={isAr ? "كلمة المرور (8 أحرف على الأقل)" : "Password (min 8 chars)"}
                value={newPwd}
                onChange={e => setNewPwd(e.target.value)}
              />
              <button type="button" onClick={() => setShowNewPwd(v => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showNewPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <Input
              type="password"
              className={`bg-background border-border ${confirmPwd && confirmPwd !== newPwd ? "border-red-500" : ""}`}
              placeholder={isAr ? "تأكيد كلمة المرور" : "Confirm password"}
              value={confirmPwd}
              onChange={e => setConfirmPwd(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => createMut.mutate(newPwd)}
              disabled={newPwd.length < 8 || newPwd !== confirmPwd || createMut.isPending}
              className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {createMut.isPending ? (isAr ? "جارٍ الإنشاء..." : "Creating...") : (isAr ? "إنشاء" : "Create")}
            </button>
            <button onClick={() => setShowCreate(false)} className="h-10 px-4 rounded-xl border border-border text-sm hover:bg-accent transition-colors">
              {isAr ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {status?.exists && !showChange && (
        <button
          onClick={() => setShowChange(true)}
          className="w-full h-10 rounded-xl border border-border bg-card text-sm font-medium hover:bg-accent transition-colors flex items-center justify-center gap-2"
        >
          <Lock size={14} />
          {isAr ? "تغيير كلمة المرور الرئيسية" : "Change Master Password"}
        </button>
      )}

      {showChange && (
        <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
          <p className="text-sm font-semibold">{isAr ? "تغيير كلمة المرور الرئيسية" : "Change Master Password"}</p>
          <div className="space-y-2">
            <Input
              type="password"
              className="bg-background border-border"
              placeholder={isAr ? "كلمة المرور الحالية" : "Current password"}
              value={curPwd}
              onChange={e => setCurPwd(e.target.value)}
            />
            <Input
              type="password"
              className="bg-background border-border"
              placeholder={isAr ? "كلمة المرور الجديدة (8+)" : "New password (8+)"}
              value={changePwd}
              onChange={e => setChangePwd(e.target.value)}
            />
            <Input
              type="password"
              className={`bg-background border-border ${confirmChangePwd && confirmChangePwd !== changePwd ? "border-red-500" : ""}`}
              placeholder={isAr ? "تأكيد كلمة المرور الجديدة" : "Confirm new password"}
              value={confirmChangePwd}
              onChange={e => setConfirmChangePwd(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => changeMut.mutate({ currentPassword: curPwd, newPassword: changePwd })}
              disabled={!curPwd || changePwd.length < 8 || changePwd !== confirmChangePwd || changeMut.isPending}
              className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
            >
              {changeMut.isPending ? (isAr ? "جارٍ التغيير..." : "Changing...") : (isAr ? "تغيير" : "Change")}
            </button>
            <button onClick={() => setShowChange(false)} className="h-10 px-4 rounded-xl border border-border text-sm hover:bg-accent transition-colors">
              {isAr ? "إلغاء" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* Backup Codes Modal */}
      <Dialog open={!!showBackupCodes} onOpenChange={() => setShowBackupCodes(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-400" />
              {isAr ? "رموز الاسترداد" : "Backup Codes"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {isAr
                ? "احتفظ بهذه الرموز في مكان آمن. يمكن استخدام كل رمز مرة واحدة فقط لاسترداد الوصول."
                : "Store these codes somewhere safe. Each code can only be used once to regain access."}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(showBackupCodes ?? []).map(code => (
                <div key={code} className="px-3 py-2 rounded-xl bg-background border border-border font-mono text-sm text-center tracking-wider">
                  {code}
                </div>
              ))}
            </div>
            <button
              onClick={() => {
                void navigator.clipboard.writeText((showBackupCodes ?? []).join("\n"));
              }}
              className="w-full h-9 rounded-xl border border-border text-sm flex items-center justify-center gap-2 hover:bg-accent transition-colors"
            >
              <Copy size={13} />
              {isAr ? "نسخ الرموز" : "Copy Codes"}
            </button>
            <button
              onClick={() => setShowBackupCodes(null)}
              className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold"
            >
              {isAr ? "تم الحفظ، إغلاق" : "Saved, Close"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Permission Gates Tab ───────────────────────────────────────────────────

const RISK_META: Record<string, { color: string; label: string; labelAr: string }> = {
  critical: { color: "text-red-400 bg-red-400/10 border-red-400/30",   label: "Critical", labelAr: "حرج" },
  high:     { color: "text-orange-400 bg-orange-400/10 border-orange-400/30", label: "High", labelAr: "عالي" },
  medium:   { color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30", label: "Medium", labelAr: "متوسط" },
  low:      { color: "text-blue-400 bg-blue-400/10 border-blue-400/30",  label: "Low", labelAr: "منخفض" },
};

function PermissionGatesTab({ isAr, fetcher }: { isAr: boolean; fetcher: (p: string, o?: RequestInit) => Promise<unknown> }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: ops, isLoading } = useQuery<ProtectedOperation[]>({
    queryKey: ["protected-operations"],
    queryFn: () => fetcher("/api/security/operations") as Promise<ProtectedOperation[]>,
    refetchOnWindowFocus: false,
  });

  const toggleMut = useMutation({
    mutationFn: ({ key, field, value }: { key: string; field: string; value: boolean }) =>
      fetcher(`/api/security/operations/${key}`, { method: "PATCH", body: JSON.stringify({ [field]: value }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["protected-operations"] }),
    onError: () => toast({ title: isAr ? "خطأ في التحديث" : "Update failed", variant: "destructive" }),
  });

  if (isLoading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>;

  const grouped = (ops ?? []).reduce<Record<string, ProtectedOperation[]>>((acc, op) => {
    const g = op.riskLevel ?? "high";
    if (!acc[g]) acc[g] = [];
    acc[g].push(op);
    return acc;
  }, {});

  const riskOrder = ["critical", "high", "medium", "low"];

  return (
    <div className="space-y-5">
      <div className="p-4 rounded-2xl border border-border bg-card">
        <div className="flex items-start gap-3">
          <Info size={14} className="text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "بوابات الصلاحيات تحدد العمليات التي تتطلب كلمة المرور الرئيسية قبل التنفيذ. عطّل الحماية للعمليات الروتينية، وفعّلها للعمليات الحساسة."
              : "Permission gates define which operations require the master password before execution. Disable protection for routine tasks, enable it for sensitive ones."}
          </p>
        </div>
      </div>

      {riskOrder.filter(r => grouped[r]?.length).map(risk => {
        const meta = RISK_META[risk] ?? RISK_META.high;
        return (
          <div key={risk} className="space-y-2">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold ${meta.color}`}>
              {isAr ? meta.labelAr : meta.label}
            </div>
            {grouped[risk].map(op => (
              <div key={op.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{isAr ? op.operationNameAr : op.operationNameEn}</p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{op.operationKey}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[10px] text-muted-foreground">{isAr ? "يحتاج كلمة مرور" : "Needs password"}</p>
                    <button
                      onClick={() => toggleMut.mutate({ key: op.operationKey, field: "requiresPassword", value: !op.requiresPassword })}
                      className={`transition-colors ${op.requiresPassword ? "text-primary" : "text-muted-foreground/40"}`}
                      title={op.requiresPassword ? (isAr ? "إيقاف متطلب كلمة المرور" : "Disable password requirement") : (isAr ? "تفعيل متطلب كلمة المرور" : "Enable password requirement")}
                    >
                      {op.requiresPassword ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <p className="text-[10px] text-muted-foreground">{isAr ? "نشط" : "Enabled"}</p>
                    <button
                      onClick={() => toggleMut.mutate({ key: op.operationKey, field: "isEnabled", value: !op.isEnabled })}
                      className={`transition-colors ${op.isEnabled ? "text-emerald-400" : "text-muted-foreground/40"}`}
                      title={op.isEnabled ? (isAr ? "تعطيل البوابة" : "Disable gate") : (isAr ? "تفعيل البوابة" : "Enable gate")}
                    >
                      {op.isEnabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

const TABS = ["overview", "sessions", "threats", "mfa", "master", "gates"] as const;
type Tab = typeof TABS[number];

export default function SecurityPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");

  const fetcher = async (path: string, opts?: RequestInit) => {
    const token = await getToken();
    const res = await fetch(path, {
      ...opts,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(await res.text());
    if (res.status === 204) return null;
    return res.json() as Promise<unknown>;
  };

  // Fetch current user to check role (admin/owner gate)
  const { data: meData, isLoading: meLoading } = useQuery<{ user: ApiUser }>({
    queryKey: ["auth-me"],
    queryFn: () => fetcher("/api/auth/me") as Promise<{ user: ApiUser }>,
    retry: false,
  });

  const { data: summary, isLoading } = useQuery<EventSummary>({
    queryKey: ["security-summary"],
    queryFn: () => fetcher("/api/security/events/summary") as Promise<EventSummary>,
    refetchInterval: 60000,
    enabled: ["owner", "admin", "platform_admin"].includes(meData?.user?.role ?? ""),
  });

  // Events used for overview chart
  const { data: allEvents } = useQuery<SecurityEvent[]>({
    queryKey: ["security-events"],
    queryFn: () => fetcher("/api/security/events?limit=200") as Promise<SecurityEvent[]>,
    refetchInterval: 60000,
    enabled: ["owner", "admin", "platform_admin"].includes(meData?.user?.role ?? ""),
  });

  const tabLabels: Record<Tab, { en: string; ar: string; icon: React.ElementType }> = {
    overview:  { en: "Overview",  ar: "نظرة عامة",      icon: Activity },
    sessions:  { en: "Sessions",  ar: "الجلسات",         icon: Monitor },
    threats:   { en: "Threats",   ar: "التهديدات",       icon: ShieldAlert },
    mfa:       { en: "MFA",       ar: "التحقق",          icon: Fingerprint },
    master:    { en: "Master",    ar: "كلمة المرور",     icon: KeyRound },
    gates:     { en: "Gates",     ar: "البوابات",        icon: Lock },
  };

  if (meLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Skeleton className="w-12 h-12 rounded-full" />
      </div>
    );
  }

  const role = meData?.user?.role ?? "";
  const isAdminOrOwner = ["owner", "admin", "platform_admin"].includes(role);

  if (!isAdminOrOwner) {
    return <AccessDenied isAr={isAr} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background">
      <div className="shrink-0 px-5 pt-5 pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck size={18} className="text-primary" />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground">{isAr ? "مركز الأمان" : "Security Center"}</h1>
              <p className="text-xs text-muted-foreground">{isAr ? "الجلسات، التهديدات، والتحقق بخطوتين" : "Sessions, threats & two-factor auth"}</p>
            </div>
          </div>
          <button onClick={() => {
            void qc.invalidateQueries({ queryKey: ["security-summary"] });
            void qc.invalidateQueries({ queryKey: ["security-sessions"] });
            void qc.invalidateQueries({ queryKey: ["security-events"] });
          }} className="w-9 h-9 rounded-xl bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="flex gap-1 mt-4 p-1 bg-card rounded-xl border border-border">
          {TABS.map(t => {
            const { en, ar, icon: Icon } = tabLabels[t];
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium transition-all ${active ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <Icon size={12} />
                {isAr ? ar : en}
                {t === "threats" && (summary?.brute_force_today ?? 0) > 0 && (
                  <span className="w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {summary!.brute_force_today}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.15 }}>
            {tab === "overview" && <OverviewTab summary={summary} events={allEvents} isLoading={isLoading} isAr={isAr} />}
            {tab === "sessions" && <SessionsTab isAr={isAr} fetcher={fetcher} />}
            {tab === "threats"  && <ThreatsTab isAr={isAr} fetcher={fetcher} />}
            {tab === "mfa"      && (
              <MfaTab
                isAr={isAr}
                fetcher={fetcher}
                mfaAdoptionRate={summary?.mfa_adoption_rate ?? 0}
                mfaEnabledCount={summary?.mfa_enabled_count ?? 0}
                totalUsers={summary?.total_users ?? 0}
              />
            )}
            {tab === "master"   && <MasterPasswordTab isAr={isAr} fetcher={fetcher} />}
            {tab === "gates"    && <PermissionGatesTab isAr={isAr} fetcher={fetcher} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
