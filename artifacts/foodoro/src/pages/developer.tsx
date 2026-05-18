import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2, Plus, Trash2, Copy, Eye, EyeOff, ToggleLeft, ToggleRight,
  Key, Shield, CheckCircle2, AlertTriangle, Globe, Zap,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const SCOPES = [
  { value: "read",              labelEn: "Read (all)",       labelAr: "قراءة (كل شيء)",    color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  { value: "write",             labelEn: "Write (all)",      labelAr: "كتابة (كل شيء)",   color: "text-red-400 bg-red-400/10 border-red-400/20" },
  { value: "orders:read",       labelEn: "Orders Read",      labelAr: "قراءة الطلبات",     color: "text-primary bg-primary/10 border-primary/20" },
  { value: "orders:write",      labelEn: "Orders Write",     labelAr: "كتابة الطلبات",    color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  { value: "reports:read",      labelEn: "Reports Read",     labelAr: "قراءة التقارير",    color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  { value: "inventory:read",    labelEn: "Inventory Read",   labelAr: "قراءة المخزون",     color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
  { value: "inventory:write",   labelEn: "Inventory Write",  labelAr: "كتابة المخزون",    color: "text-teal-400 bg-teal-400/10 border-teal-400/20" },
  { value: "webhooks:manage",   labelEn: "Webhooks",         labelAr: "إدارة Webhooks",    color: "text-pink-400 bg-pink-400/10 border-pink-400/20" },
];

interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  is_active: boolean;
  last_used_at: string | null;
  expires_at: string | null;
  created_at: string;
}

function ScopeBadge({ scope, isAr }: { scope: string; isAr: boolean }) {
  const meta = SCOPES.find(s => s.value === scope);
  if (!meta) return <span className={`px-1.5 py-0.5 rounded text-[10px] border border-border text-muted-foreground`}>{scope}</span>;
  return <span className={`px-1.5 py-0.5 rounded-full text-[10px] border ${meta.color}`}>{isAr ? meta.labelAr : meta.labelEn}</span>;
}

export default function DeveloperPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["read"]);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetcher = async (path: string, opts?: RequestInit) => {
    const token = await getToken();
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) } });
    if (!res.ok) throw new Error(await res.text());
    if (opts?.method === "DELETE") return null;
    return res.json() as Promise<unknown>;
  };

  const { data: keys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => fetcher("/api/developer/api-keys") as Promise<ApiKey[]>,
  });

  const createMut = useMutation({
    mutationFn: (body: object) => fetcher("/api/developer/api-keys", { method: "POST", body: JSON.stringify(body) }) as Promise<{ key: string; message: string }>,
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["api-keys"] });
      setCreateOpen(false);
      setRevealedKey(data.key);
      setNewKeyName("");
      setNewKeyScopes(["read"]);
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetcher(`/api/developer/api-keys/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["api-keys"] }); setDeleteId(null); toast({ title: isAr ? "تم الإلغاء" : "Key revoked" }); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => fetcher(`/api/developer/api-keys/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  const toggleScope = (s: string) => {
    setNewKeyScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const copyKey = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast({ title: isAr ? "تم النسخ" : "Copied!" });
  };

  const baseUrl = typeof window !== "undefined" ? `${window.location.protocol}//${window.location.host}/api` : "https://your-domain.com/api";

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Code2 size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "منصة المطورين" : "Developer Platform"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "مفاتيح API والتوثيق" : "API Keys & Documentation"}</p>
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={14} />
          {isAr ? "مفتاح جديد" : "New Key"}
        </button>
      </div>

      {/* Base URL card */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{isAr ? "نقطة الدخول" : "API Base URL"}</h3>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-xl bg-background border border-border font-mono text-xs text-muted-foreground">
          <span className="flex-1 truncate">{baseUrl}</span>
          <button onClick={() => copyKey(baseUrl)} className="shrink-0 w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary">
            <Copy size={11} />
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">{isAr ? "أضف التوثيق: Authorization: Bearer <api_key>" : "Authentication header: Authorization: Bearer <api_key>"}</p>
      </div>

      {/* Quick reference */}
      <div className="p-4 rounded-2xl bg-card border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-primary" />
          <h3 className="text-sm font-semibold text-foreground">{isAr ? "مرجع سريع" : "Quick Reference"}</h3>
        </div>
        <div className="space-y-1.5">
          {[
            { method: "GET",    path: "/api/orders",        desc: isAr ? "قائمة الطلبات" : "List orders" },
            { method: "POST",   path: "/api/orders",        desc: isAr ? "إنشاء طلب" : "Create order" },
            { method: "GET",    path: "/api/products",      desc: isAr ? "قائمة المنتجات" : "List products" },
            { method: "GET",    path: "/api/inventory",     desc: isAr ? "المخزون" : "Inventory" },
            { method: "GET",    path: "/api/reports/dashboard", desc: isAr ? "لوحة الإحصاء" : "Dashboard stats" },
            { method: "GET",    path: "/api/events",        desc: isAr ? "تدفق SSE للأحداث" : "SSE event stream" },
          ].map(e => (
            <div key={e.path} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent/30 transition-colors">
              <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${e.method === "GET" ? "text-emerald-400 bg-emerald-400/10" : "text-primary bg-primary/10"}`}>{e.method}</span>
              <span className="font-mono text-xs text-muted-foreground flex-1 truncate">{e.path}</span>
              <span className="text-[11px] text-muted-foreground shrink-0">{e.desc}</span>
              <button onClick={() => copyKey(`${baseUrl}${e.path.replace("/api", "")}`)} className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary">
                <Copy size={10} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* API Keys */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Key size={14} className="text-primary" />
          {isAr ? "مفاتيح API" : "API Keys"} ({(keys ?? []).length})
        </h3>
        <div className="space-y-3">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
          ) : (keys ?? []).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-muted-foreground border border-dashed border-border rounded-2xl">
              <Key size={24} className="mb-2 opacity-30" />
              <p className="text-sm">{isAr ? "لا توجد مفاتيح" : "No API keys yet"}</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {(keys ?? []).map(k => (
                <motion.div key={k.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`p-4 rounded-2xl bg-card border transition-all ${k.is_active ? "border-border" : "border-border/40 opacity-60"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-foreground">{k.name}</p>
                        {k.is_active ? <span className="text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">{isAr ? "نشط" : "Active"}</span>
                          : <span className="text-[10px] text-muted-foreground border border-border px-2 py-0.5 rounded-full">{isAr ? "معطّل" : "Revoked"}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5 font-mono text-xs text-muted-foreground bg-background border border-border rounded-lg px-2.5 py-1.5 w-fit">
                        <span>{k.key_prefix}••••••••••••••••••••••••••••</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(k.scopes ?? []).map(s => <ScopeBadge key={s} scope={s} isAr={isAr} />)}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1.5">
                        {isAr ? "أُنشئ:" : "Created:"} {new Date(k.created_at).toLocaleDateString()}
                        {k.last_used_at && <> · {isAr ? "آخر استخدام:" : "Last used:"} {new Date(k.last_used_at).toLocaleDateString()}</>}
                        {k.expires_at && <> · {isAr ? "ينتهي:" : "Expires:"} {new Date(k.expires_at).toLocaleDateString()}</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleMut.mutate({ id: k.id, isActive: !k.is_active })}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                        {k.is_active ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} />}
                      </button>
                      <button onClick={() => setDeleteId(k.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>

      {/* Create Key Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Key size={16} className="text-primary" />{isAr ? "إنشاء مفتاح API" : "Create API Key"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isAr ? "الاسم" : "Name"}</Label>
              <Input className="bg-background border-border" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder={isAr ? "تطبيق Mobile" : "Mobile App"} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1"><Shield size={11} />{isAr ? "الصلاحيات" : "Scopes"}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {SCOPES.map(s => (
                  <button key={s.value} type="button" onClick={() => toggleScope(s.value)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all text-start
                      ${newKeyScopes.includes(s.value) ? s.color + " ring-1 ring-current" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
                    {isAr ? s.labelAr : s.labelEn}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-400/5 border border-amber-400/20 text-xs text-amber-300 flex items-start gap-2">
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              {isAr ? "احفظ المفتاح فور ظهوره — لن يُعرض مرة أخرى." : "Save the key immediately after creation — it won't be shown again."}
            </div>
            <button onClick={() => createMut.mutate({ name: newKeyName, scopes: newKeyScopes })}
              disabled={createMut.isPending || !newKeyName || !newKeyScopes.length}
              className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50">
              {createMut.isPending ? (isAr ? "جارٍ الإنشاء..." : "Creating...") : (isAr ? "إنشاء المفتاح" : "Create Key")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reveal Key Dialog */}
      <Dialog open={!!revealedKey} onOpenChange={o => !o && setRevealedKey(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-emerald-400"><CheckCircle2 size={16} />{isAr ? "تم إنشاء المفتاح" : "Key Created"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-xl p-3 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              {isAr ? "هذا المفتاح لن يظهر مرة أخرى. انسخه الآن." : "This key will never be shown again. Copy it now."}
            </p>
            <div className="relative">
              <div className="p-3 rounded-xl bg-background border border-border font-mono text-xs break-all text-foreground">{revealedKey}</div>
            </div>
            <button onClick={() => copyKey(revealedKey ?? "")} className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2">
              <Copy size={14} />
              {isAr ? "نسخ المفتاح" : "Copy Key"}
            </button>
            <button onClick={() => setRevealedKey(null)} className="w-full h-10 rounded-xl bg-secondary text-sm text-foreground">
              {isAr ? "حسناً، لقد نسخته" : "Done, I've copied it"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 size={16} />{isAr ? "إلغاء المفتاح" : "Revoke Key"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{isAr ? "سيُلغى هذا المفتاح ولا يمكن استخدامه." : "This key will be permanently revoked and cannot be used."}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl bg-secondary text-sm">{isAr ? "إلغاء" : "Cancel"}</button>
            <button onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending} className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-semibold disabled:opacity-50">{isAr ? "إلغاء المفتاح" : "Revoke"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
