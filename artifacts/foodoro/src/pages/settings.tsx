import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { Settings, Plus, Pencil, Trash2, Check, QrCode, Download, Smartphone, ClipboardList, Eye, EyeOff, Sun, Moon, Monitor } from "lucide-react";
import { useUser, useAuth } from "@/lib/clerk-shim";
import { useTheme, type ThemeMode } from "@/contexts/theme";
import {
  useListCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  getListCategoriesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

const PRESET_COLORS = [
  "#E67E22", "#EF4444", "#10B981", "#3B82F6", "#8B5CF6",
  "#F59E0B", "#EC4899", "#06B6D4", "#84CC16", "#F97316",
];

function CategoryForm({
  initial,
  onSubmit,
  loading,
}: {
  initial?: { name: string; color: string };
  onSubmit: (data: { name: string; color: string }) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#E67E22");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("settings.categories.form.name")}</Label>
        <Input
          className="bg-background border-border"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("settings.categories.form.namePlaceholder")}
          data-testid="input-category-name"
        />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{t("settings.categories.form.color")}</Label>
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              data-testid={`color-${c}`}
              onClick={() => setColor(c)}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
              style={{ backgroundColor: c }}
            >
              {color === c && <Check size={14} className="text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl border border-border" style={{ backgroundColor: color }} />
          <Input
            className="bg-background border-border h-8 w-32 text-sm font-mono"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#E67E22"
            data-testid="input-category-color"
          />
        </div>
      </div>
      <button
        data-testid="button-save-category"
        disabled={!name || loading}
        onClick={() => onSubmit({ name, color })}
        className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm disabled:opacity-40 transition-colors"
      >
        {loading
          ? t("settings.categories.form.saving")
          : initial
          ? t("settings.categories.form.update")
          : t("settings.categories.form.save")}
      </button>
    </div>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const AUDIT_ACTIONS = [
  "login",
  "logout",
  "order_created",
  "order_completed",
  "inventory_adjusted",
  "user_created",
  "user_updated",
] as const;

interface AuditLogEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

function actionBadgeClass(action: string): string {
  const map: Record<string, string> = {
    login: "bg-blue-500/15 text-blue-400",
    logout: "bg-slate-500/15 text-slate-400",
    order_created: "bg-emerald-500/15 text-emerald-400",
    order_completed: "bg-primary/15 text-primary",
    inventory_adjusted: "bg-amber-500/15 text-amber-400",
    user_created: "bg-purple-500/15 text-purple-400",
    user_updated: "bg-slate-400/15 text-slate-400",
  };
  return map[action] ?? "bg-muted text-muted-foreground";
}

function AuditLogPanel({ getToken }: { getToken: () => Promise<string | null> }) {
  const { t } = useTranslation();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [logs, setLogs] = useState<AuditLogEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`${BASE}/api/admin/audit-logs?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      const data = await res.json() as AuditLogEntry[];
      setLogs(data);
    } catch (e: unknown) {
      setFetchError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [from, to, actionFilter, getToken]);

  const actionLabel = (a: string) => {
    const key = `settings.auditLog.actions.${a}` as const;
    const val = t(key as Parameters<typeof t>[0]);
    return val !== key ? val : a;
  };

  const metadataSummary = (meta: Record<string, unknown> | null): string => {
    if (!meta) return "";
    return Object.entries(meta)
      .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
      .join("; ")
      .slice(0, 120);
  };

  const handleExportCsv = useCallback(() => {
    if (!logs || logs.length === 0) return;
    const headers = ["Timestamp", "User", "Action", "Resource", "ID", "IP", "Metadata summary"];
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = logs.map((log) => [
      escape(new Date(log.createdAt).toISOString()),
      escape(log.userName ?? ""),
      escape(log.action),
      escape(log.resource),
      escape(log.resourceId ?? ""),
      escape(log.ipAddress ?? ""),
      escape(metadataSummary(log.metadata)),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `audit-log-${dateStr}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }, [logs]);

  return (
    <div className="p-5 rounded-2xl bg-card border border-border">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{t("settings.auditLog.title")}</h3>
        </div>
        {logs && logs.length > 0 && (
          <button
            data-testid="button-export-csv"
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-medium transition-colors"
          >
            <Download size={13} />
            {t("settings.auditLog.exportCsv")}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t("settings.auditLog.subtitle")}</p>

      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("settings.auditLog.filterFrom")}</label>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-xl bg-background border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary/60"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("settings.auditLog.filterTo")}</label>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-xl bg-background border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary/60"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">{t("settings.auditLog.filterAction")}</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="h-9 rounded-xl bg-background border border-border px-3 text-sm text-foreground focus:outline-none focus:border-primary/60"
          >
            <option value="">{t("settings.auditLog.filterAction")}</option>
            {AUDIT_ACTIONS.map((a) => (
              <option key={a} value={a}>{actionLabel(a)}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleLoad}
            disabled={loading}
            className="h-9 px-5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium disabled:opacity-40 transition-colors"
          >
            {loading ? "..." : t("settings.auditLog.load")}
          </button>
        </div>
      </div>

      {fetchError && <p className="text-red-400 text-xs mb-3">{fetchError}</p>}

      {logs !== null && (
        logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground border border-border rounded-xl">
            <ClipboardList size={28} className="mb-2 opacity-20" />
            <p className="text-sm">{t("settings.auditLog.noData")}</p>
            <p className="text-xs mt-1">{t("settings.auditLog.noDataHint")}</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground whitespace-nowrap">{t("settings.auditLog.columns.time")}</th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("settings.auditLog.columns.user")}</th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("settings.auditLog.columns.action")}</th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("settings.auditLog.columns.resource")}</th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("settings.auditLog.columns.resourceId")}</th>
                  <th className="px-3 py-2 text-start font-medium text-muted-foreground">{t("settings.auditLog.columns.ip")}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-foreground whitespace-nowrap">{log.userName ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${actionBadgeClass(log.action)}`}>
                        {actionLabel(log.action)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{log.resource}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono">{log.resourceId ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground font-mono">{log.ipAddress ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}

function QrPanel({ getToken }: { getToken: () => Promise<string | null> }) {
  const { t } = useTranslation();
  const [tableNumber, setTableNumber] = useState("");
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const guestUrl = useCallback((table: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}${BASE}/order?table=${encodeURIComponent(table)}`;
  }, []);

  const handleGenerate = useCallback(async () => {
    const table = tableNumber.trim();
    if (!table) return;
    setGenerating(true);
    setGenError(null);
    if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl);
    setQrBlobUrl(null);
    try {
      const token = await getToken();
      const url = `${BASE}/api/qr/table?tableNumber=${encodeURIComponent(table)}&guestUrl=${encodeURIComponent(guestUrl(table))}`;
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error("Failed to generate QR code");
      const blob = await res.blob();
      setQrBlobUrl(URL.createObjectURL(blob));
    } catch (e: unknown) {
      setGenError(e instanceof Error ? e.message : "Error");
    } finally {
      setGenerating(false);
    }
  }, [tableNumber, guestUrl, qrBlobUrl, getToken]);

  const handleDownload = useCallback(() => {
    if (!qrBlobUrl) return;
    const a = document.createElement("a");
    a.href = qrBlobUrl;
    a.download = `qr-table-${tableNumber}.png`;
    a.click();
  }, [qrBlobUrl, tableNumber]);

  return (
    <div className="p-5 rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-2 mb-1">
        <QrCode size={16} className="text-primary" />
        <h3 className="text-sm font-semibold text-foreground">{t("qr.title")}</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-4">{t("qr.subtitle")}</p>

      <div className="flex gap-2 mb-4">
        <div className="flex-1">
          <label className="block text-xs text-muted-foreground mb-1">{t("qr.tableLabel")}</label>
          <input
            data-testid="input-qr-table"
            type="text"
            value={tableNumber}
            onChange={(e) => { setTableNumber(e.target.value); setQrBlobUrl(null); setGenError(null); }}
            placeholder={t("qr.tablePlaceholder")}
            className="w-full h-10 rounded-xl bg-background border border-border px-3 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/60"
          />
        </div>
        <div className="flex items-end">
          <button
            data-testid="button-generate-qr"
            onClick={handleGenerate}
            disabled={!tableNumber.trim() || generating}
            className="h-10 px-4 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {generating ? "..." : t("qr.generate")}
          </button>
        </div>
      </div>

      {genError && <p className="text-red-400 text-xs mb-3">{genError}</p>}

      {qrBlobUrl && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row gap-4 items-start"
        >
          <div className="p-3 rounded-xl bg-white inline-block shrink-0">
            <img
              src={qrBlobUrl}
              alt={`QR Table ${tableNumber}`}
              className="w-36 h-36 block"
              data-testid="qr-image"
            />
          </div>
          <div className="flex-1 flex flex-col gap-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t("qr.orderLink", { table: tableNumber })}</p>
              <p className="text-xs font-mono text-foreground bg-background border border-border rounded-lg px-3 py-2 break-all">
                {guestUrl(tableNumber)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Smartphone size={13} className="text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{t("qr.scanHint")}</p>
            </div>
            <button
              data-testid="button-download-qr"
              onClick={handleDownload}
              className="flex items-center gap-2 h-9 px-4 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-sm font-medium transition-colors self-start"
            >
              <Download size={14} />
              {t("qr.download")}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function QrVisibilityCard({ getToken }: { getToken: () => Promise<string | null> }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [hideUnavailable, setHideUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(`${BASE}/api/tenants/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (!res.ok) return;
        const data = await res.json() as { tenant?: { settings?: { hideUnavailableInQr?: boolean } } };
        const settings = (data as { tenant?: { settings?: { hideUnavailableInQr?: boolean } } }).tenant?.settings
          ?? (data as { settings?: { hideUnavailableInQr?: boolean } }).settings ?? {};
        if (!cancelled) {
          setHideUnavailable((settings as { hideUnavailableInQr?: boolean }).hideUnavailableInQr ?? false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [getToken]);

  const handleToggle = useCallback(async () => {
    const next = !hideUnavailable;
    setHideUnavailable(next);
    setSaving(true);
    try {
      const token = await getToken();
      await fetch(`${BASE}/api/tenants/me/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ hideUnavailableInQr: next }),
      });
    } catch {
      setHideUnavailable(!next);
    } finally {
      setSaving(false);
    }
  }, [hideUnavailable, getToken]);

  return (
    <div className="p-5 rounded-2xl bg-card border border-border">
      <div className="flex items-center gap-2 mb-3">
        {hideUnavailable ? <EyeOff size={16} className="text-amber-400" /> : <Eye size={16} className="text-primary" />}
        <h3 className="text-sm font-semibold text-foreground">
          {isAr ? "إعدادات قائمة QR" : "QR Menu Visibility"}
        </h3>
      </div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-foreground font-medium">
            {isAr ? "إخفاء المنتجات غير المتوفرة من قائمة QR" : "Hide unavailable products from QR menu"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isAr
              ? "عند التفعيل، لن يرى العملاء المنتجات المعطّلة من المطبخ في قائمة الطلبات"
              : "When enabled, guests won't see kitchen-disabled items in the QR order menu"}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading || saving}
          aria-pressed={hideUnavailable}
          className={`shrink-0 w-11 h-6 rounded-full transition-colors relative disabled:opacity-40 ${
            hideUnavailable ? "bg-amber-500" : "bg-border"
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${hideUnavailable ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>
      {hideUnavailable && (
        <p className="mt-3 text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-2">
          {isAr
            ? "تنبيه: المنتجات المعطّلة لن تظهر في قائمة العملاء حتى يُعيد المطبخ تفعيلها."
            : "Active: Disabled products are hidden from the guest menu until re-enabled by the kitchen."}
        </p>
      )}
    </div>
  );
}

// ─── Appearance: theme switcher (Dark / Light / System) ─────────────────
function AppearanceSection() {
  const { t } = useTranslation();
  const { mode, resolved, setMode } = useTheme();

  const options: { id: ThemeMode; label: string; icon: React.ReactNode; description: string }[] = [
    { id: "dark",   label: t("settings.appearance.dark",  "داكن"),  icon: <Moon size={16} />,   description: t("settings.appearance.darkDesc",  "الثيم الافتراضي") },
    { id: "light",  label: t("settings.appearance.light", "فاتح"),  icon: <Sun size={16} />,    description: t("settings.appearance.lightDesc", "مريح في النهار") },
    { id: "system", label: t("settings.appearance.system","تلقائي"),icon: <Monitor size={16} />,description: t("settings.appearance.systemDesc","يتبع الجهاز") },
  ];

  return (
    <section data-testid="appearance-section">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">
          {t("settings.appearance.title", "المظهر")}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("settings.appearance.subtitle", "اختر الثيم المفضل — يُطبَّق فوراً ويُحفظ على الجهاز")}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {options.map((opt) => {
          const active = mode === opt.id;
          const showResolvedHint = opt.id === "system";
          return (
            <button
              key={opt.id}
              data-testid={`theme-option-${opt.id}`}
              onClick={() => setMode(opt.id)}
              className={`relative text-start p-4 rounded-2xl border transition-all duration-200 ${
                active
                  ? "border-primary/60 bg-primary/5 ring-2 ring-primary/30"
                  : "border-border bg-card hover:border-primary/30 hover:bg-card/80"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${active ? "bg-primary text-white" : "bg-muted text-foreground"}`}>
                  {opt.icon}
                </div>
                {active && <Check size={14} className="text-primary" />}
              </div>
              <div className="font-medium text-sm">{opt.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                {opt.description}
                {showResolvedHint && (
                  <span className="ms-1 text-foreground/60">
                    ({resolved === "dark" ? t("settings.appearance.dark", "داكن") : t("settings.appearance.light", "فاتح")})
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useUser();
  const { getToken } = useAuth();
  const [createOpen, setCreateOpen] = useState(false);
  const [editCat, setEditCat] = useState<{ id: number; name: string; color: string } | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: categories, isLoading } = useListCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });

  const handleCreate = async (data: { name: string; color: string }) => {
    try {
      await createCategory.mutateAsync({ data });
      invalidate();
      setCreateOpen(false);
      toast({ title: t("settings.toast.created") });
    } catch {
      toast({ title: t("settings.toast.error"), variant: "destructive" });
    }
  };

  const handleUpdate = async (data: { name: string; color: string }) => {
    if (!editCat) return;
    try {
      await updateCategory.mutateAsync({ id: editCat.id, data });
      invalidate();
      setEditCat(null);
      toast({ title: t("settings.toast.updated") });
    } catch {
      toast({ title: t("settings.toast.error"), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteCategory.mutateAsync({ id: deleteId });
      invalidate();
      setDeleteId(null);
      toast({ title: t("settings.toast.deleted") });
    } catch {
      toast({ title: t("settings.toast.error"), variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Settings size={18} className="text-primary" />
          <h1 className="text-base font-semibold">{t("settings.title")}</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        <AppearanceSection />

        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{t("settings.categories.title")}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{t("settings.categories.subtitle")}</p>
            </div>
            <button
              data-testid="button-add-category"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
            >
              <Plus size={15} />
              {t("settings.categories.addCategory")}
            </button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3"
              initial="hidden" animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            >
              {categories?.map((cat) => (
                <motion.div
                  key={cat.id}
                  variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                  data-testid={`card-category-${cat.id}`}
                  className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border group"
                >
                  <div className="w-10 h-10 rounded-xl shrink-0" style={{ backgroundColor: cat.color }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{cat.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{cat.color}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      data-testid={`button-edit-cat-${cat.id}`}
                      onClick={() => setEditCat(cat)}
                      className="w-7 h-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      data-testid={`button-delete-cat-${cat.id}`}
                      onClick={() => setDeleteId(cat.id)}
                      className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </motion.div>
              ))}
              {(!categories || categories.length === 0) && (
                <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <Settings size={28} className="mb-2 opacity-20" />
                  <p className="text-sm">{t("settings.categories.empty")}</p>
                  <p className="text-xs mt-1">{t("settings.categories.emptyHint")}</p>
                </div>
              )}
            </motion.div>
          )}
        </div>

        <QrPanel getToken={getToken} />

        <QrVisibilityCard getToken={getToken} />

        <AuditLogPanel getToken={getToken} />

        <div className="p-5 rounded-2xl bg-card border border-border">
          <h3 className="text-sm font-semibold text-foreground mb-3">{t("settings.system.title")}</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <p className="text-muted-foreground">{t("settings.system.system")}</p>
              <p className="text-foreground font-medium mt-0.5">{t("settings.system.systemValue")}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("settings.system.taxRate")}</p>
              <p className="text-foreground font-medium mt-0.5">{t("settings.system.taxValue")}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("settings.system.currency")}</p>
              <p className="text-foreground font-medium mt-0.5">{t("settings.system.currencyValue")}</p>
            </div>
            <div>
              <p className="text-muted-foreground">{t("settings.system.mode")}</p>
              <p className="text-emerald-400 font-medium mt-0.5">{t("settings.system.online")}</p>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle>{t("settings.categories.addCategory")}</DialogTitle></DialogHeader>
          <CategoryForm onSubmit={handleCreate} loading={createCategory.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editCat} onOpenChange={(o) => !o && setEditCat(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle>{t("settings.categories.editTitle")}</DialogTitle></DialogHeader>
          {editCat && <CategoryForm initial={editCat} onSubmit={handleUpdate} loading={updateCategory.isPending} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle>{t("settings.categories.delete.title")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("settings.categories.delete.message")}</p>
          <div className="flex gap-2 mt-2">
            <button data-testid="button-cancel-delete-cat" onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm font-medium">{t("settings.categories.delete.cancel")}</button>
            <button data-testid="button-confirm-delete-cat" onClick={handleDelete} disabled={deleteCategory.isPending} className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-semibold">{t("settings.categories.delete.confirm")}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
