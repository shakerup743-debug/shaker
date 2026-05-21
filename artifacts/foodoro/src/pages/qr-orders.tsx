/**
 * /qr-orders — Cashier view of all QR/table orders.
 * Polls every 30s; opens a modal to choose payment method and close the bill.
 */
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  QrCode, Search, Loader2, X, CreditCard, Wallet,
  Banknote, Download, Filter, Clock,
} from "lucide-react";

const TOKEN_KEY = "foodoro-token";
function authHeaders(): HeadersInit {
  const token = localStorage.getItem(TOKEN_KEY);
  return token
    ? { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
    : { "Content-Type": "application/json" };
}

interface QrOrderItem {
  id: number; product_name: string; quantity: number;
  unit_price: string; subtotal: string; item_note: string | null;
}
interface QrOrder {
  id: number; table_number: string | null; status: string;
  created_at: string; kitchen_ready_at: string | null;
  customer_name: string | null; customer_phone: string | null;
  general_note: string | null;
  subtotal: string; tax: string; total: string;
  payment_method: string | null;
  items: QrOrderItem[];
}

const STATUS_BADGE: Record<string, { ar: string; cls: string }> = {
  pending:    { ar: "بانتظار",     cls: "bg-gray-500/15 text-gray-300 border-gray-500/30" },
  preparing:  { ar: "تجهيز",       cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ready:      { ar: "جاهز",        cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  completed:  { ar: "مكتمل",       cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
};

export default function QrOrdersPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("");
  const [picked, setPicked] = useState<QrOrder | null>(null);
  const [method, setMethod] = useState<"cash" | "card" | "wallet" | "">("");

  const { data, isLoading } = useQuery<{ orders: QrOrder[] }>({
    queryKey: ["qr-orders"],
    queryFn: async () => {
      const r = await fetch("/api/qr-orders", { headers: authHeaders() });
      return r.json();
    },
    refetchInterval: 30_000,
  });

  // WebSocket live updates
  useEffect(() => {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws`);
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { type?: string };
        if (msg.type === "qr_order_updated" || msg.type === "order:paid" || msg.type === "order:created") {
          void qc.invalidateQueries({ queryKey: ["qr-orders"] });
        }
      } catch { /* ignore */ }
    };
    ws.onerror = () => {};
    return () => ws.close();
  }, [qc]);

  const filtered = useMemo(() => {
    let list = data?.orders ?? [];
    if (filter) list = list.filter((o) => o.status === filter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter((o) =>
        (o.table_number?.toString().includes(s) ?? false) ||
        (o.customer_name?.toLowerCase().includes(s) ?? false),
      );
    }
    return list;
  }, [data, filter, search]);

  const pay = useMutation({
    mutationFn: async ({ id, payment_method }: { id: number; payment_method: string }) => {
      const r = await fetch(`/api/qr-orders/${id}/pay`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ payment_method }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "تم إغلاق الفاتورة" });
      setPicked(null); setMethod("");
      void qc.invalidateQueries({ queryKey: ["qr-orders"] });
    },
    onError: (e: Error) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  const exportXlsx = async () => {
    const token = localStorage.getItem(TOKEN_KEY);
    const r = await fetch("/api/qr-orders/export", { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) { toast({ title: "تعذّر التصدير", variant: "destructive" }); return; }
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `qr-orders-${Date.now()}.xlsx`;
    a.click();
  };

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6" data-testid="qr-orders-page">
        <header className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <QrCode className="w-6 h-6 text-primary" /> فواتير QR
            </h1>
            <p className="text-sm text-muted-foreground mt-1">إدارة طلبات الطاولات الواردة من قائمة QR</p>
          </div>
          <button onClick={exportXlsx} data-testid="qr-export-btn"
            className="inline-flex items-center gap-2 text-sm font-bold text-white bg-primary px-4 py-2.5 rounded-xl hover:opacity-90">
            <Download className="w-4 h-4" /> تصدير Excel
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الطاولة أو اسم العميل…"
              className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-card border border-border text-sm focus:outline-none focus:border-primary"
              data-testid="qr-search-input"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}
              className="text-sm py-2.5 px-3 rounded-xl bg-card border border-border focus:outline-none">
              <option value="">جميع الحالات</option>
              <option value="pending">بانتظار</option>
              <option value="preparing">تجهيز</option>
              <option value="ready">جاهز</option>
              <option value="completed">مكتمل</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="grid place-items-center py-20"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">لا توجد فواتير QR بعد.</div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-start px-3 py-3">#</th>
                  <th className="text-start px-3 py-3">طاولة</th>
                  <th className="text-start px-3 py-3">العميل</th>
                  <th className="text-start px-3 py-3">وقت الطلب</th>
                  <th className="text-start px-3 py-3">الحالة</th>
                  <th className="text-start px-3 py-3">المجموع</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-t border-border hover:bg-muted/20 cursor-pointer"
                      onClick={() => setPicked(o)} data-testid={`qr-order-row-${o.id}`}>
                    <td className="px-3 py-3 font-mono text-xs">{o.id}</td>
                    <td className="px-3 py-3">{o.table_number ?? "—"}</td>
                    <td className="px-3 py-3">{o.customer_name ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-3 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {new Date(o.created_at).toLocaleString("ar-EG", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_BADGE[o.status]?.cls ?? ""}`}>
                        {STATUS_BADGE[o.status]?.ar ?? o.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-bold">{Number(o.total).toFixed(2)} <span className="text-xs text-muted-foreground">ر.س</span></td>
                    <td className="px-3 py-3 text-end">
                      {o.status !== "completed" && (
                        <button onClick={(e) => { e.stopPropagation(); setPicked(o); }}
                          className="text-xs font-bold text-primary border border-primary/30 rounded-lg px-3 py-1 hover:bg-primary/10">
                          إتمام الدفع
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Order detail modal */}
      {picked && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm grid place-items-center p-3" onClick={() => setPicked(null)}>
          <div className="bg-card rounded-3xl border border-border shadow-2xl max-w-md w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="qr-order-modal">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-extrabold">طلب #{picked.id} — طاولة {picked.table_number}</h3>
              <button onClick={() => setPicked(null)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto p-5 space-y-3 text-sm">
              {picked.customer_name && (
                <div className="text-xs text-muted-foreground">
                  العميل: <span className="text-foreground font-semibold">{picked.customer_name}</span>
                  {picked.customer_phone && <> · {picked.customer_phone}</>}
                </div>
              )}
              <div className="space-y-2">
                {picked.items.map((it) => (
                  <div key={it.id} className="bg-muted/30 rounded-xl p-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">{it.product_name} × {it.quantity}</span>
                      <span>{Number(it.subtotal).toFixed(2)} ر.س</span>
                    </div>
                    {it.item_note && (
                      <div className="text-xs text-amber-400 mt-1 pl-3 border-l-2 border-amber-500/40">└─ {it.item_note}</div>
                    )}
                  </div>
                ))}
              </div>
              {picked.general_note && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm">
                  <span className="font-bold text-red-400">ملاحظة عامة:</span> {picked.general_note}
                </div>
              )}
              <div className="border-t border-border pt-3 text-sm space-y-1">
                <div className="flex justify-between text-muted-foreground"><span>المجموع الفرعي</span><span>{Number(picked.subtotal).toFixed(2)}</span></div>
                <div className="flex justify-between text-muted-foreground"><span>الضريبة</span><span>{Number(picked.tax).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-lg"><span>الإجمالي</span><span>{Number(picked.total).toFixed(2)} ر.س</span></div>
              </div>
              {picked.status !== "completed" && (
                <>
                  <div>
                    <p className="font-semibold mb-2">طريقة الدفع</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: "cash" as const,   label: "نقدي",   icon: Banknote },
                        { v: "card" as const,   label: "بطاقة",  icon: CreditCard },
                        { v: "wallet" as const, label: "محفظة",  icon: Wallet },
                      ].map((m) => (
                        <button key={m.v} onClick={() => setMethod(m.v)} data-testid={`pay-method-${m.v}`}
                          className={`py-3 rounded-xl border-2 flex flex-col items-center gap-1 text-xs font-semibold transition ${
                            method === m.v ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/40"
                          }`}>
                          <m.icon className="w-4 h-4" /> {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={() => method && pay.mutate({ id: picked.id, payment_method: method })}
                    disabled={!method || pay.isPending} data-testid="qr-confirm-pay"
                    className="w-full py-3.5 rounded-xl bg-primary text-white font-bold disabled:opacity-50">
                    {pay.isPending ? "جاري..." : "إتمام الدفع"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
