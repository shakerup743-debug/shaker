import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  QrCode, Download, Copy, CheckCheck, RefreshCw, Plus, Trash2,
  ToggleLeft, ToggleRight, Eye, Scan, ShoppingBag, AlertCircle,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useListTables } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface QrToken {
  id: number;
  token: string;
  tableId: number;
  tableNumber: string | null;
  tableSection: string | null;
  tableCapacity: number | null;
  isActive: boolean;
  scansCount: number;
  ordersCount: number;
  lastScannedAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
}

interface GeneratedQr extends QrToken {
  qrImage: string;
  guestUrl: string;
}

function timeAgo(ts: string | null, isAr: boolean): string {
  if (!ts) return isAr ? "لم يُمسح" : "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return isAr ? "الآن" : "Now";
  if (mins < 60) return isAr ? `${mins}د` : `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return isAr ? `${hrs}س` : `${hrs}h`;
  return isAr ? `${Math.floor(hrs / 24)}ي` : `${Math.floor(hrs / 24)}d`;
}

function isExpired(token: QrToken): boolean {
  return !!token.expiresAt && new Date() > new Date(token.expiresAt);
}

function qrStatus(token: QrToken | undefined): "active" | "inactive" | "expired" | "none" {
  if (!token) return "none";
  if (isExpired(token)) return "expired";
  if (!token.isActive) return "inactive";
  return "active";
}

const STATUS_CONFIG = {
  active:   { badge: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  inactive: { badge: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  expired:  { badge: "bg-red-500/20 text-red-400 border-red-500/30" },
  none:     { badge: "bg-white/5 text-gray-500 border-white/10" },
};

type TableRow = { id: number; number: string; section: string; capacity: number };

export default function QrMenuPage() {
  const { getToken } = useAuth();
  const { toast } = useToast();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";

  const { data: rawTables = [], isLoading: tablesLoading } = useListTables({} as never);
  const tables = rawTables as TableRow[];

  const [tokens, setTokens] = useState<QrToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);

  const [genOpen, setGenOpen] = useState(false);
  const [genTableId, setGenTableId] = useState<string>("");
  const [genExpiry, setGenExpiry] = useState<"never" | "30" | "90" | "custom">("never");
  const [genCustomDate, setGenCustomDate] = useState("");
  const [genNotes, setGenNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  const [viewOpen, setViewOpen] = useState(false);
  const [viewQr, setViewQr] = useState<GeneratedQr | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const baseUrl = window.location.origin + BASE;

  async function fetchTokens() {
    const jwt = await getToken();
    const r = await fetch(`${BASE}/api/qr`, {
      headers: { Authorization: `Bearer ${jwt ?? ""}` },
    });
    if (r.ok) setTokens(await r.json() as QrToken[]);
    setTokensLoading(false);
  }

  useEffect(() => { void fetchTokens(); }, []);

  async function generate() {
    if (!genTableId) return;
    setGenerating(true);
    try {
      const jwt = await getToken();
      let expiresAt: string | null = null;
      if (genExpiry === "30") expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
      else if (genExpiry === "90") expiresAt = new Date(Date.now() + 90 * 86400000).toISOString();
      else if (genExpiry === "custom" && genCustomDate) expiresAt = new Date(genCustomDate).toISOString();

      const r = await fetch(`${BASE}/api/qr`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt ?? ""}` },
        body: JSON.stringify({ tableId: parseInt(genTableId, 10), baseUrl, expiresAt, notes: genNotes || null }),
      });
      if (!r.ok) { const b = await r.json() as { error?: string }; throw new Error(b.error ?? "Failed"); }
      const data = await r.json() as GeneratedQr;
      await fetchTokens();
      setGenOpen(false);
      setGenTableId(""); setGenExpiry("never"); setGenCustomDate(""); setGenNotes("");
      setViewQr(data);
      setViewOpen(true);
      toast({ title: isAr ? "تم إنشاء QR بنجاح" : "QR Code generated", description: isAr ? `طاولة ${data.tableNumber}` : `Table ${data.tableNumber}` });
    } catch (e: unknown) {
      toast({ title: isAr ? "خطأ" : "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  }

  async function viewToken(token: QrToken) {
    setViewLoading(true);
    setViewOpen(true);
    setViewQr(null);
    try {
      const jwt = await getToken();
      const r = await fetch(`${BASE}/api/qr/${token.id}/image?baseUrl=${encodeURIComponent(baseUrl)}`, {
        headers: { Authorization: `Bearer ${jwt ?? ""}` },
      });
      if (!r.ok) throw new Error("Failed to load QR image");
      const data = await r.json() as { qrImage: string; guestUrl: string };
      setViewQr({ ...token, qrImage: data.qrImage, guestUrl: data.guestUrl });
    } catch {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "فشل تحميل الصورة" : "Failed to load QR image", variant: "destructive" });
      setViewOpen(false);
    } finally {
      setViewLoading(false);
    }
  }

  async function toggleActive(token: QrToken) {
    const jwt = await getToken();
    const r = await fetch(`${BASE}/api/qr/${token.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt ?? ""}` },
      body: JSON.stringify({ isActive: !token.isActive }),
    });
    if (r.ok) {
      await fetchTokens();
      if (viewQr?.id === token.id) setViewQr((v) => v ? { ...v, isActive: !v.isActive } : null);
      toast({ title: !token.isActive ? (isAr ? "تم التفعيل" : "Activated") : (isAr ? "تم التعطيل" : "Deactivated") });
    }
  }

  async function deleteToken(token: QrToken) {
    const jwt = await getToken();
    const r = await fetch(`${BASE}/api/qr/${token.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${jwt ?? ""}` },
    });
    if (r.ok) {
      await fetchTokens();
      if (viewQr?.id === token.id) setViewOpen(false);
      toast({ title: isAr ? "تم الحذف" : "Deleted" });
    }
  }

  async function regenerate(tableId: number) {
    const jwt = await getToken();
    const r = await fetch(`${BASE}/api/qr/${tableId}/regenerate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt ?? ""}` },
      body: JSON.stringify({ baseUrl }),
    });
    if (r.ok) {
      const data = await r.json() as GeneratedQr;
      await fetchTokens();
      setViewQr(data);
      setViewOpen(true);
      toast({ title: isAr ? "تم الاستبدال" : "QR Regenerated", description: isAr ? "QR القديم أُبطل" : "Old QR was deactivated" });
    }
  }

  function copyUrl(url: string) {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function downloadQr(img: string, tableNum: string | null) {
    const a = document.createElement("a");
    a.href = img;
    a.download = `qr-table-${tableNum ?? "table"}.png`;
    a.click();
  }

  const tokenByTable = new Map<number, QrToken>();
  tokens.forEach((t) => {
    const existing = tokenByTable.get(t.tableId);
    if (!existing || (t.isActive && !existing.isActive)) tokenByTable.set(t.tableId, t);
  });

  const loading = tablesLoading || tokensLoading;
  const statusLabel = (s: ReturnType<typeof qrStatus>) => ({
    active:   isAr ? "نشط"     : "Active",
    inactive: isAr ? "معطل"    : "Inactive",
    expired:  isAr ? "منتهي"   : "Expired",
    none:     isAr ? "لا يوجد QR" : "No QR",
  }[s]);

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <QrCode size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "إدارة رموز QR" : "QR Code Management"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "أكواد QR للطاولات" : "Per-table QR codes for guest ordering"}</p>
          </div>
        </div>
        <button onClick={() => setGenOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={15} />
          {isAr ? "إنشاء QR" : "Generate QR"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: QrCode,      value: tokens.filter((t) => t.isActive && !isExpired(t)).length, label: isAr ? "QR نشط"           : "Active QRs",    color: "#10B981" },
          { icon: Scan,        value: tokens.reduce((s, t) => s + t.scansCount, 0),              label: isAr ? "إجمالي المسحات"  : "Total Scans",   color: "#E67E22" },
          { icon: ShoppingBag, value: tokens.reduce((s, t) => s + t.ordersCount, 0),             label: isAr ? "إجمالي الطلبات"  : "Total Orders",  color: "#3B82F6" },
        ].map(({ icon: Icon, value, label, color }) => (
          <div key={label} className="p-3 rounded-2xl bg-card border border-border text-center">
            <div className="w-8 h-8 rounded-xl mx-auto mb-1.5 flex items-center justify-center" style={{ backgroundColor: color + "18" }}>
              <Icon size={14} style={{ color }} />
            </div>
            <p className="text-lg font-bold text-foreground">{value}</p>
            <p className="text-[10px] text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Table grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="h-36 rounded-2xl bg-card border border-border animate-pulse" />)}
        </div>
      ) : tables.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <QrCode size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">{isAr ? "لا توجد طاولات بعد" : "No tables yet"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {tables.map((table) => {
            const token = tokenByTable.get(table.id);
            const status = qrStatus(token);
            const badgeClass = STATUS_CONFIG[status].badge;
            return (
              <motion.div key={table.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-2xl bg-card border border-border space-y-3 hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-foreground text-sm">{isAr ? `طاولة ${table.number}` : `Table ${table.number}`}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 capitalize">{table.section}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeClass}`}>
                    {statusLabel(status)}
                  </span>
                </div>

                {token && (
                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div>
                      <p className="text-sm font-bold text-foreground">{token.scansCount}</p>
                      <p className="text-[10px] text-muted-foreground">{isAr ? "مسح" : "Scans"}</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{token.ordersCount}</p>
                      <p className="text-[10px] text-muted-foreground">{isAr ? "طلبات" : "Orders"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-medium text-muted-foreground">{timeAgo(token.lastScannedAt, isAr)}</p>
                      <p className="text-[10px] text-muted-foreground">{isAr ? "آخر مسح" : "Last"}</p>
                    </div>
                  </div>
                )}

                <div className="flex gap-1.5 flex-wrap">
                  {!token ? (
                    <button onClick={() => { setGenTableId(String(table.id)); setGenOpen(true); }}
                      className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
                      <Plus size={12} />
                      {isAr ? "إنشاء QR" : "Generate"}
                    </button>
                  ) : (
                    <>
                      <button onClick={() => void viewToken(token)}
                        className="flex items-center justify-center gap-1 h-8 px-3 rounded-xl bg-primary/10 text-primary text-xs font-semibold hover:bg-primary/20 transition-colors">
                        <Eye size={12} />{isAr ? "عرض" : "View"}
                      </button>
                      <button onClick={() => void regenerate(table.id)}
                        className="flex items-center justify-center gap-1 h-8 px-3 rounded-xl bg-white/5 text-muted-foreground text-xs font-semibold hover:bg-white/10 transition-colors">
                        <RefreshCw size={11} />{isAr ? "تجديد" : "Regen"}
                      </button>
                      <button onClick={() => void toggleActive(token)}
                        className="flex items-center justify-center h-8 px-2 rounded-xl bg-white/5 text-muted-foreground text-xs hover:bg-white/10 transition-colors">
                        {token.isActive ? <ToggleRight size={14} className="text-emerald-400" /> : <ToggleLeft size={14} />}
                      </button>
                      <button onClick={() => void deleteToken(token)}
                        className="flex items-center justify-center h-8 px-2 rounded-xl bg-red-500/10 text-red-400 text-xs hover:bg-red-500/20 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </>
                  )}
                </div>

                {token && token.expiresAt && !isExpired(token) && new Date(token.expiresAt).getTime() - Date.now() < 7 * 86400000 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-yellow-400">
                    <AlertCircle size={10} />{isAr ? "تنتهي قريباً" : "Expires soon"}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Generate Dialog */}
      <Dialog open={genOpen} onOpenChange={setGenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode size={16} className="text-primary" />
              {isAr ? "إنشاء QR Code جديد" : "Generate New QR Code"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>{isAr ? "الطاولة" : "Table"}</Label>
              <Select value={genTableId} onValueChange={setGenTableId}>
                <SelectTrigger><SelectValue placeholder={isAr ? "اختر الطاولة" : "Select table"} /></SelectTrigger>
                <SelectContent>
                  {tables.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>
                      {isAr ? `طاولة ${t.number}` : `Table ${t.number}`} — {t.section}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? "صلاحية الـ QR" : "Expiry"}</Label>
              <Select value={genExpiry} onValueChange={(v) => setGenExpiry(v as typeof genExpiry)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">{isAr ? "لا ينتهي" : "Never"}</SelectItem>
                  <SelectItem value="30">{isAr ? "30 يوم" : "30 days"}</SelectItem>
                  <SelectItem value="90">{isAr ? "90 يوم" : "90 days"}</SelectItem>
                  <SelectItem value="custom">{isAr ? "تاريخ محدد" : "Custom date"}</SelectItem>
                </SelectContent>
              </Select>
              {genExpiry === "custom" && (
                <Input type="date" value={genCustomDate} onChange={(e) => setGenCustomDate(e.target.value)}
                  min={new Date().toISOString().split("T")[0]} />
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
              <Input value={genNotes} onChange={(e) => setGenNotes(e.target.value)}
                placeholder={isAr ? "مثال: بجانب النافذة" : "e.g. Near the window"} />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={() => setGenOpen(false)}
                className="flex-1 h-10 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-white/5 transition-colors">
                {isAr ? "إلغاء" : "Cancel"}
              </button>
              <button onClick={() => void generate()} disabled={!genTableId || generating}
                className="flex-1 h-10 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                {generating
                  ? <><RefreshCw size={13} className="animate-spin" />{isAr ? "جارٍ الإنشاء…" : "Generating…"}</>
                  : <><QrCode size={13} />{isAr ? "إنشاء" : "Generate"}</>}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View QR Dialog */}
      <AnimatePresence>
        {viewOpen && (
          <Dialog open={viewOpen} onOpenChange={setViewOpen}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode size={16} className="text-primary" />
                  {viewQr ? (isAr ? `طاولة ${viewQr.tableNumber}` : `Table ${viewQr.tableNumber}`) : (isAr ? "تحميل QR…" : "Loading QR…")}
                </DialogTitle>
              </DialogHeader>

              {viewLoading ? (
                <div className="flex items-center justify-center py-16">
                  <RefreshCw size={24} className="text-primary animate-spin" />
                </div>
              ) : viewQr ? (
                <div className="space-y-4 pt-2">
                  {/* QR Image */}
                  <div className="bg-white rounded-2xl p-4 flex items-center justify-center mx-auto w-56 h-56">
                    <img src={viewQr.qrImage} alt="QR Code" className="w-full h-full object-contain" />
                  </div>

                  {/* Status badge */}
                  <div className="flex items-center justify-center">
                    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${STATUS_CONFIG[qrStatus(viewQr)].badge}`}>
                      {statusLabel(qrStatus(viewQr))}
                    </span>
                  </div>

                  {/* Info rows */}
                  <div className="space-y-2 text-sm border-t border-border pt-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isAr ? "مسحات" : "Scans"}</span>
                      <span className="font-medium text-foreground">{viewQr.scansCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{isAr ? "طلبات" : "Orders"}</span>
                      <span className="font-medium text-foreground">{viewQr.ordersCount}</span>
                    </div>
                    {viewQr.expiresAt && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{isAr ? "تنتهي" : "Expires"}</span>
                        <span className="font-medium text-foreground">{new Date(viewQr.expiresAt).toLocaleDateString()}</span>
                      </div>
                    )}
                    {viewQr.notes && (
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground shrink-0">{isAr ? "ملاحظات" : "Notes"}</span>
                        <span className="font-medium text-foreground text-right">{viewQr.notes}</span>
                      </div>
                    )}
                  </div>

                  {/* URL row */}
                  <div className="flex gap-2">
                    <div className="flex-1 bg-muted/30 rounded-xl px-3 py-2 text-xs text-muted-foreground truncate font-mono">
                      {viewQr.guestUrl}
                    </div>
                    <button onClick={() => copyUrl(viewQr.guestUrl)}
                      className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
                      {copied ? <CheckCheck size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => downloadQr(viewQr.qrImage, viewQr.tableNumber)}
                      className="h-10 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors flex items-center justify-center gap-2">
                      <Download size={13} />{isAr ? "تحميل PNG" : "Download PNG"}
                    </button>
                    <button onClick={() => void toggleActive(viewQr)}
                      className={`h-10 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
                        viewQr.isActive
                          ? "bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
                          : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                      }`}>
                      {viewQr.isActive
                        ? <><ToggleLeft size={13} />{isAr ? "تعطيل" : "Deactivate"}</>
                        : <><ToggleRight size={13} />{isAr ? "تفعيل" : "Activate"}</>}
                    </button>
                    <button onClick={() => { void regenerate(viewQr.tableId); setViewOpen(false); }}
                      className="h-10 rounded-xl bg-white/5 text-muted-foreground text-sm font-semibold hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                      <RefreshCw size={13} />{isAr ? "إنشاء جديد" : "Regenerate"}
                    </button>
                    <button onClick={() => void deleteToken(viewQr)}
                      className="h-10 rounded-xl bg-red-500/10 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors flex items-center justify-center gap-2">
                      <Trash2 size={13} />{isAr ? "حذف" : "Delete"}
                    </button>
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        )}
      </AnimatePresence>
    </div>
  );
}
