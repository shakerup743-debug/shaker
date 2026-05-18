import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useAuth as useClerkAuth, useUser } from "@/lib/clerk-shim";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  FileEdit, Ban, Tag, RotateCcw, Clock, CheckCircle2,
  User, Search, RefreshCw, Receipt, AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { AmendmentDialog, type AmendmentOrder } from "@/components/amendment-dialog";
import { useCurrency } from "@/contexts/currency";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type OrderStatus = "pending" | "preparing" | "ready" | "completed" | "cancelled";

interface Order {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  total: number | null;
  paymentMethod: string | null;
  createdAt: string;
  type?: string;
}

interface Amendment {
  id: number;
  orderId: number;
  orderNumber?: string;
  type: string;
  reason: string;
  customerName: string;
  customerPhone?: string;
  cashierName: string;
  discountAmount?: number | null;
  printedAt?: string | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  cancel:   Ban,
  discount: Tag,
  return:   RotateCcw,
  edit:     FileEdit,
};

const TYPE_COLOR: Record<string, string> = {
  cancel:   "text-red-400 bg-red-500/10 border-red-500/30",
  discount: "text-primary bg-primary/10 border-primary/30",
  return:   "text-amber-400 bg-amber-500/10 border-amber-500/30",
  edit:     "text-blue-400 bg-blue-500/10 border-blue-500/30",
};

const STATUS_AMENDABLE: OrderStatus[] = ["pending", "preparing", "ready"];

const STATUS_CONFIG: Record<OrderStatus, { labelAr: string; labelEn: string; cls: string }> = {
  pending:   { labelAr: "قيد الانتظار", labelEn: "Pending",   cls: "text-amber-400 bg-amber-400/10" },
  preparing: { labelAr: "قيد التحضير", labelEn: "Preparing", cls: "text-blue-400 bg-blue-400/10" },
  ready:     { labelAr: "جاهز",         labelEn: "Ready",     cls: "text-emerald-400 bg-emerald-400/10" },
  completed: { labelAr: "مكتمل",        labelEn: "Completed", cls: "text-muted-foreground bg-muted/40" },
  cancelled: { labelAr: "ملغي",         labelEn: "Cancelled", cls: "text-red-400 bg-red-400/10" },
};

function TypeLabel({ type, isAr }: { type: string; isAr: boolean }) {
  const labels: Record<string, { ar: string; en: string }> = {
    cancel:   { ar: "إلغاء",      en: "Cancel" },
    discount: { ar: "خصم",        en: "Discount" },
    return:   { ar: "مرتجع",      en: "Return" },
    edit:     { ar: "تعديل بيانات",en: "Data Edit" },
  };
  const Icon = TYPE_ICON[type] ?? FileEdit;
  const cls  = TYPE_COLOR[type] ?? "text-muted-foreground bg-muted/10 border-border";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${cls}`}>
      <Icon size={9} />
      {isAr ? (labels[type]?.ar ?? type) : (labels[type]?.en ?? type)}
    </span>
  );
}

export default function CashierAmendmentsPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { getToken } = useClerkAuth();
  const { user } = useUser();
  const { format } = useCurrency();
  const queryClient = useQueryClient();

  const [amendOrder, setAmendOrder] = useState<AmendmentOrder | null>(null);
  const [searchOrders, setSearchOrders] = useState("");
  const [searchLog, setSearchLog] = useState("");

  const cashierName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? (isAr ? "الكاشير" : "Cashier");
  const cashierInitial = cashierName.charAt(0).toUpperCase();

  const fetchOrders = useCallback(async (): Promise<Order[]> => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api/orders`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed to fetch orders");
    const data = await res.json() as { data: Order[] } | Order[];
    return Array.isArray(data) ? data : (data.data ?? []);
  }, [getToken]);

  const fetchAmendments = useCallback(async (): Promise<Amendment[]> => {
    const token = await getToken();
    const res = await fetch(`${BASE}/api/amendments`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error("Failed to fetch amendments");
    const data = await res.json() as { data: Amendment[] } | Amendment[];
    return Array.isArray(data) ? data : (data.data ?? []);
  }, [getToken]);

  const { data: orders = [], isLoading: loadingOrders, refetch: refetchOrders } = useQuery({
    queryKey: ["amendments-page-orders"],
    queryFn: fetchOrders,
    refetchInterval: 30_000,
  });

  const { data: amendments = [], isLoading: loadingLog, refetch: refetchLog } = useQuery({
    queryKey: ["amendments-page-log"],
    queryFn: fetchAmendments,
    refetchInterval: 30_000,
  });

  const amendableOrders = orders.filter(o => STATUS_AMENDABLE.includes(o.status));
  const filteredOrders = amendableOrders.filter(o =>
    !searchOrders || o.orderNumber.toLowerCase().includes(searchOrders.toLowerCase())
  );
  const filteredLog = amendments.filter(a =>
    !searchLog ||
    (a.orderNumber ?? String(a.orderId)).toLowerCase().includes(searchLog.toLowerCase()) ||
    a.customerName.toLowerCase().includes(searchLog.toLowerCase()) ||
    a.reason.toLowerCase().includes(searchLog.toLowerCase())
  );

  const refresh = () => {
    void refetchOrders();
    void refetchLog();
    void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">

      {/* ── Header ── */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
              <Receipt size={20} className="text-primary" />
              {isAr ? "تعديلات الفواتير" : "Invoice Amendments"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isAr
                ? "إلغاء الطلبات، إضافة خصومات، تسجيل المرتجعات وتعديل البيانات"
                : "Cancel orders, apply discounts, record returns and edit invoice data"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Cashier identity badge */}
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                {cashierInitial}
              </div>
              <div>
                <p className="text-[10px] text-muted-foreground">{isAr ? "الكاشير الحالي" : "Logged-in Cashier"}</p>
                <p className="text-xs font-semibold text-foreground">{cashierName}</p>
              </div>
            </div>

            <button
              onClick={refresh}
              className="w-9 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
              title={isAr ? "تحديث" : "Refresh"}
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">

        {/* ══ SECTION 1: Active orders to amend ══ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock size={14} className="text-amber-400" />
                {isAr ? "الطلبات النشطة — قابلة للتعديل" : "Active Orders — Amendable"}
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-md bg-amber-400/10 text-amber-400">
                  {amendableOrders.length}
                </span>
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isAr
                  ? "اضغط على «تعديل» لفتح نافذة تعديل الفاتورة الإلزامية"
                  : "Press «Amend» to open the mandatory invoice amendment form"}
              </p>
            </div>
            <div className="relative w-48">
              <Search size={12} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchOrders}
                onChange={e => setSearchOrders(e.target.value)}
                placeholder={isAr ? "رقم الطلب..." : "Order number..."}
                className="ps-8 h-8 text-xs bg-background border-border"
              />
            </div>
          </div>

          {loadingOrders ? (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center gap-2 text-muted-foreground rounded-2xl border border-dashed border-border">
              <CheckCircle2 size={24} className="text-emerald-400/50" />
              <p className="text-sm">{isAr ? "لا توجد طلبات نشطة حالياً" : "No active orders at the moment"}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredOrders.map((order, i) => {
                const sc = STATUS_CONFIG[order.status];
                return (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center gap-4 p-4 rounded-2xl bg-card border border-border hover:border-primary/30 transition-all"
                  >
                    {/* Order info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-foreground text-sm">#{order.orderNumber}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${sc.cls}`}>
                          {isAr ? sc.labelAr : sc.labelEn}
                        </span>
                        {order.type && (
                          <span className="text-[10px] text-muted-foreground">{order.type}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span>{new Date(order.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                        <span>·</span>
                        <span>{format(order.total ?? 0)}</span>
                        {order.paymentMethod && (
                          <>
                            <span>·</span>
                            <span className="capitalize">{order.paymentMethod}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Amend button — prominent */}
                    <button
                      onClick={() => setAmendOrder({
                        id: order.id,
                        orderNumber: order.orderNumber,
                        total: order.total,
                        status: order.status,
                      })}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-xs font-semibold hover:bg-primary/90 active:scale-95 transition-all shrink-0"
                    >
                      <FileEdit size={13} />
                      {isAr ? "تعديل الفاتورة" : "Amend Invoice"}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>

        {/* ══ SECTION 2: Amendment log ══ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertCircle size={14} className="text-primary" />
                {isAr ? "سجل التعديلات" : "Amendment Log"}
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">
                  {amendments.length}
                </span>
              </h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {isAr ? "جميع عمليات التعديل موثّقة تلقائياً مع هوية الكاشير" : "All amendments auto-logged with cashier identity"}
              </p>
            </div>
            <div className="relative w-56">
              <Search size={12} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchLog}
                onChange={e => setSearchLog(e.target.value)}
                placeholder={isAr ? "بحث بالفاتورة / العميل / السبب..." : "Search by invoice / customer / reason..."}
                className="ps-8 h-8 text-xs bg-background border-border"
              />
            </div>
          </div>

          {loadingLog ? (
            <div className="h-32 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredLog.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center gap-2 text-muted-foreground rounded-2xl border border-dashed border-border">
              <Receipt size={24} className="opacity-30" />
              <p className="text-sm">{isAr ? "لا توجد تعديلات مسجّلة بعد" : "No amendments recorded yet"}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-start px-4 py-3 text-muted-foreground font-medium">{isAr ? "الفاتورة" : "Invoice"}</th>
                    <th className="text-start px-4 py-3 text-muted-foreground font-medium">{isAr ? "النوع" : "Type"}</th>
                    <th className="text-start px-4 py-3 text-muted-foreground font-medium">{isAr ? "الكاشير" : "Cashier"}</th>
                    <th className="text-start px-4 py-3 text-muted-foreground font-medium">{isAr ? "العميل" : "Customer"}</th>
                    <th className="text-start px-4 py-3 text-muted-foreground font-medium">{isAr ? "السبب" : "Reason"}</th>
                    <th className="text-start px-4 py-3 text-muted-foreground font-medium">{isAr ? "التاريخ" : "Date"}</th>
                    <th className="text-start px-4 py-3 text-muted-foreground font-medium">{isAr ? "الطباعة" : "Print"}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLog.map((a, i) => (
                    <tr
                      key={a.id}
                      className={`border-b border-border last:border-0 transition-colors hover:bg-accent/40 ${i % 2 === 0 ? "" : "bg-muted/10"}`}
                    >
                      <td className="px-4 py-3 font-semibold text-foreground">
                        #{a.orderNumber ?? a.orderId}
                      </td>
                      <td className="px-4 py-3">
                        <TypeLabel type={a.type} isAr={isAr} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[9px] shrink-0">
                            {(a.cashierName ?? "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="text-foreground truncate max-w-[100px]">{a.cashierName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-foreground">
                        <div>
                          <p>{a.customerName}</p>
                          {a.customerPhone && <p className="text-muted-foreground" dir="ltr">{a.customerPhone}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground max-w-[180px]">
                        <p className="truncate" title={a.reason}>{a.reason}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {new Date(a.createdAt).toLocaleDateString(isAr ? "ar-SA" : "en-US", {
                          day: "2-digit", month: "short", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        {a.printedAt ? (
                          <span className="flex items-center gap-1 text-emerald-400 text-[10px] font-medium">
                            <CheckCircle2 size={11} />
                            {isAr ? "تمت" : "Done"}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-[10px]">{isAr ? "—" : "—"}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Amendment dialog */}
      <AmendmentDialog
        open={amendOrder !== null}
        order={amendOrder}
        onClose={() => setAmendOrder(null)}
        onSuccess={() => {
          setAmendOrder(null);
          refresh();
        }}
      />
    </div>
  );
}
