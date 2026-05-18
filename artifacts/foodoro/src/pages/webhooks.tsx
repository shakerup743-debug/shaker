import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Webhook, Plus, Trash2, Pencil, Play, CheckCircle2, XCircle,
  Clock, ToggleLeft, ToggleRight, ChevronDown, ChevronUp,
  Globe, Key, Zap, AlertTriangle,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const WEBHOOK_EVENTS = [
  { value: "order:created",   labelEn: "Order Created",   labelAr: "طلب جديد",      icon: "🛒" },
  { value: "order:updated",   labelEn: "Order Updated",   labelAr: "طلب محدّث",     icon: "📝" },
  { value: "order:completed", labelEn: "Order Completed", labelAr: "طلب مكتمل",    icon: "✅" },
  { value: "ticket:updated",  labelEn: "Ticket Updated",  labelAr: "تذكرة محدّثة",  icon: "🍳" },
  { value: "inventory:low",   labelEn: "Low Stock Alert", labelAr: "تنبيه مخزون",  icon: "📦" },
  { value: "payment:received",labelEn: "Payment Received",labelAr: "دفعة واردة",    icon: "💳" },
  { value: "*",               labelEn: "All Events",      labelAr: "جميع الأحداث", icon: "⚡" },
];

interface WebhookRow {
  id: number;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  isActive: boolean;
  lastTriggeredAt: string | null;
  failCount: number;
  createdAt: string;
}

interface WebhookLog {
  id: number;
  event: string;
  statusCode: number | null;
  success: boolean;
  durationMs: number | null;
  createdAt: string;
}

function WebhookForm({
  initial,
  onSubmit,
  loading,
  isEdit,
}: {
  initial?: Partial<WebhookRow>;
  onSubmit: (d: Partial<WebhookRow>) => void;
  loading: boolean;
  isEdit: boolean;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [secret, setSecret] = useState(initial?.secret ?? "");
  const [events, setEvents] = useState<string[]>(initial?.events ?? []);

  const toggleEvent = (v: string) => {
    if (v === "*") { setEvents(["*"]); return; }
    setEvents(prev => {
      const without = prev.filter(e => e !== "*");
      return without.includes(v) ? without.filter(e => e !== v) : [...without, v];
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{isAr ? "الاسم" : "Name"}</Label>
        <Input className="bg-background border-border" value={name} onChange={e => setName(e.target.value)} placeholder={isAr ? "طلبات جديدة" : "New Orders Hook"} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground flex items-center gap-1"><Globe size={11} />{isAr ? "الرابط" : "Endpoint URL"}</Label>
        <Input className="bg-background border-border font-mono text-xs" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-app.com/webhooks" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground flex items-center gap-1"><Key size={11} />{isAr ? "المفتاح السري" : "Secret"} <span className="opacity-50">({isAr ? "اختياري" : "optional"})</span></Label>
        <Input className="bg-background border-border font-mono text-xs" value={secret} onChange={e => setSecret(e.target.value)} placeholder="whsec_..." />
      </div>
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1"><Zap size={11} />{isAr ? "الأحداث" : "Events to subscribe"}</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {WEBHOOK_EVENTS.map(ev => (
            <button key={ev.value} type="button" onClick={() => toggleEvent(ev.value)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all text-start
                ${events.includes(ev.value) ? "bg-primary/10 border-primary/40 text-primary" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
              <span>{ev.icon}</span>
              {isAr ? ev.labelAr : ev.labelEn}
            </button>
          ))}
        </div>
      </div>
      <button onClick={() => onSubmit({ name, url, events, secret: secret || undefined })}
        disabled={loading || !name || !url || !events.length}
        className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
        {loading ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isEdit ? (isAr ? "تحديث" : "Update") : (isAr ? "إضافة Webhook" : "Add Webhook")}
      </button>
    </div>
  );
}

function LogsPanel({ webhookId }: { webhookId: number }) {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  const { data: logs, isLoading } = useQuery<WebhookLog[]>({
    queryKey: ["webhook-logs", webhookId],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`/api/webhooks/${webhookId}/logs`, { headers: { Authorization: `Bearer ${token}` } });
      return res.json() as Promise<WebhookLog[]>;
    },
    refetchInterval: 5000,
  });

  if (isLoading) return <div className="h-20 bg-muted/10 animate-pulse rounded-xl" />;

  return (
    <div className="mt-3 space-y-1.5">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{isAr ? "آخر الطلبات" : "Recent Deliveries"}</p>
      {(logs ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">{isAr ? "لا توجد سجلات بعد" : "No deliveries yet"}</p>
      ) : (logs ?? []).slice(0, 5).map(log => (
        <div key={log.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-xs
          ${log.success ? "border-emerald-400/20 bg-emerald-400/5" : "border-red-400/20 bg-red-400/5"}`}>
          {log.success ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" /> : <XCircle size={12} className="text-red-400 shrink-0" />}
          <span className="font-mono text-muted-foreground">{log.event}</span>
          {log.statusCode && <span className={`px-1.5 py-0.5 rounded font-mono ${log.success ? "text-emerald-400 bg-emerald-400/10" : "text-red-400 bg-red-400/10"}`}>{log.statusCode}</span>}
          {log.durationMs && <span className="text-muted-foreground ms-auto">{log.durationMs}ms</span>}
        </div>
      ))}
    </div>
  );
}

export default function WebhooksPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [editHook, setEditHook] = useState<WebhookRow | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const fetcher = async (path: string, opts?: RequestInit) => {
    const token = await getToken();
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) } });
    if (!res.ok) throw new Error(await res.text());
    if (opts?.method === "DELETE") return null;
    return res.json() as Promise<unknown>;
  };

  const { data: hooks, isLoading } = useQuery<WebhookRow[]>({
    queryKey: ["webhooks"],
    queryFn: () => fetcher("/api/webhooks") as Promise<WebhookRow[]>,
  });

  const createMut = useMutation({
    mutationFn: (body: object) => fetcher("/api/webhooks", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["webhooks"] }); setCreateOpen(false); toast({ title: isAr ? "تم إضافة Webhook" : "Webhook added" }); },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => fetcher(`/api/webhooks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["webhooks"] }); setEditHook(null); toast({ title: isAr ? "تم التحديث" : "Updated" }); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => fetcher(`/api/webhooks/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["webhooks"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetcher(`/api/webhooks/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["webhooks"] }); setDeleteId(null); toast({ title: isAr ? "تم الحذف" : "Deleted" }); },
  });

  const handleTest = async (hook: WebhookRow) => {
    setTestingId(hook.id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/webhooks/${hook.id}/test`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { success: boolean; statusCode: number; durationMs: number };
      void qc.invalidateQueries({ queryKey: ["webhook-logs", hook.id] });
      toast({
        title: data.success ? (isAr ? "✅ نجح الاختبار" : "✅ Test passed") : (isAr ? "❌ فشل الاختبار" : "❌ Test failed"),
        description: `HTTP ${data.statusCode} — ${data.durationMs}ms`,
      });
    } catch {
      toast({ title: isAr ? "خطأ في الاختبار" : "Test error", variant: "destructive" });
    } finally {
      setTestingId(null);
    }
  };

  const activeCount = (hooks ?? []).filter(h => h.isActive).length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background p-5 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Webhook size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "Webhooks" : "Webhooks"}</h1>
            <p className="text-xs text-muted-foreground">{activeCount}/{(hooks ?? []).length} {isAr ? "نشط" : "active"}</p>
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={14} />
          {isAr ? "إضافة Webhook" : "Add Webhook"}
        </button>
      </div>

      {/* Info banner */}
      <div className="shrink-0 p-3 rounded-xl bg-blue-400/5 border border-blue-400/20 text-xs text-blue-300 flex items-start gap-2">
        <Zap size={13} className="mt-0.5 shrink-0 text-blue-400" />
        <p>{isAr ? "يتم إرسال الإشعارات تلقائياً إلى روابطك عند حدوث الأحداث المحددة. يتضمن الطلب ترويسة X-Foodoro-Event وX-Foodoro-Signature للتحقق." : "Events are automatically POST-ed to your endpoints. Each request includes X-Foodoro-Event and X-Foodoro-Signature headers for verification."}</p>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-2xl" />)
        ) : (hooks ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Webhook size={32} className="mb-2 opacity-30" />
            <p className="text-sm">{isAr ? "لا توجد Webhooks" : "No webhooks yet"}</p>
            <button onClick={() => setCreateOpen(true)} className="mt-3 text-xs text-primary hover:underline">{isAr ? "أضف أول Webhook" : "Add your first webhook"}</button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {(hooks ?? []).map(hook => {
              const expanded = expandedId === hook.id;
              return (
                <motion.div key={hook.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`p-4 rounded-2xl bg-card border transition-all ${hook.isActive ? "border-border" : "border-border/40 opacity-60"}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${hook.failCount > 3 ? "bg-red-400/10 border border-red-400/20" : "bg-emerald-400/10 border border-emerald-400/20"}`}>
                      {hook.failCount > 3 ? <AlertTriangle size={14} className="text-red-400" /> : <Webhook size={14} className="text-emerald-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{hook.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{hook.url}</p>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(hook.events).map(ev => {
                          const meta = WEBHOOK_EVENTS.find(e => e.value === ev);
                          return (
                            <span key={ev} className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] text-primary">
                              {meta ? (isAr ? meta.labelAr : meta.labelEn) : ev}
                            </span>
                          );
                        })}
                      </div>
                      {hook.lastTriggeredAt && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                          <Clock size={9} />
                          {isAr ? "آخر إرسال:" : "Last sent:"} {new Date(hook.lastTriggeredAt).toLocaleString()}
                          {hook.failCount > 0 && <span className="text-red-400 ms-2">• {hook.failCount} {isAr ? "فشل" : "failures"}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => handleTest(hook)} disabled={testingId === hook.id}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-blue-400 hover:bg-blue-400/10 transition-colors disabled:opacity-50"
                        title={isAr ? "اختبار" : "Test"}>
                        {testingId === hook.id ? <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Play size={12} />}
                      </button>
                      <button onClick={() => toggleMut.mutate({ id: hook.id, isActive: !hook.isActive })}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        {hook.isActive ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => setEditHook(hook)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteId(hook.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                      <button onClick={() => setExpandedId(expanded ? null : hook.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>
                  <AnimatePresence>
                    {expanded && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                        <LogsPanel webhookId={hook.id} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Create */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Webhook size={16} className="text-primary" />{isAr ? "إضافة Webhook جديد" : "Add New Webhook"}</DialogTitle></DialogHeader>
          <WebhookForm isEdit={false} onSubmit={d => createMut.mutate(d)} loading={createMut.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editHook} onOpenChange={o => !o && setEditHook(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil size={16} className="text-primary" />{isAr ? "تعديل Webhook" : "Edit Webhook"}</DialogTitle></DialogHeader>
          {editHook && <WebhookForm isEdit initial={editHook} onSubmit={d => updateMut.mutate({ id: editHook.id, body: d })} loading={updateMut.isPending} />}
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 size={16} />{isAr ? "حذف Webhook" : "Delete Webhook"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{isAr ? "هل تريد حذف هذا الـ Webhook وجميع سجلاته؟" : "Delete this webhook and all its delivery logs?"}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl bg-secondary text-sm">{isAr ? "إلغاء" : "Cancel"}</button>
            <button onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending} className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-semibold disabled:opacity-50">{isAr ? "حذف" : "Delete"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
