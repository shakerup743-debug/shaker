import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Minus, Trash2, ShoppingCart, CreditCard, Banknote, Layers,
  X, Tag, LayoutGrid, StickyNote, ChevronDown, ChevronUp, AlertTriangle, Printer,
  Bell, ChefHat, Clock, FileEdit,
} from "lucide-react";
import { AmendmentDialog, type AmendmentOrder } from "@/components/amendment-dialog";
import { InvoiceModal, type InvoiceData } from "@/components/invoice-modal";
import {
  useListCategories,
  useListProducts,
  useCreateOrder,
  useCompleteOrder,
  useListOrders,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import { useSse } from "@/hooks/use-sse";
import { calcOrderTotals } from "@/lib/pricing";
import { useCurrency } from "@/contexts/currency";
import { useOfflinePos } from "@/hooks/use-offline-pos";

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  itemNote?: string;
}

interface OrderNotesState {
  general: string;
  priority: "low" | "medium" | "high";
  isSpecial: boolean;
  itemNotes: Record<number, string>;
  expandedItems: Record<number, boolean>;
}

export default function PosPage() {
  const { t, i18n } = useTranslation();
  const { format } = useCurrency();
  const isAr = i18n.language === "ar";
  const { isOnline, pendingCount, queueOrder, syncPending } = useOfflinePos();

  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
  const [tableNumber, setTableNumber] = useState("");
  const [discountInput, setDiscountInput] = useState(0);
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "card" | "mixed">("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState<OrderNotesState>({
    general: "",
    priority: "medium",
    isSpecial: false,
    itemNotes: {},
    expandedItems: {},
  });
  const [showActiveOrders, setShowActiveOrders] = useState(false);
  const [amendOrder, setAmendOrder] = useState<AmendmentOrder | null>(null);
  const newOrderIdsRef = useRef<Set<number>>(new Set());

  const today = new Date().toISOString().split("T")[0]!;

  const { data: categories, isLoading: catsLoading } = useListCategories();
  const { data: products, isLoading: prodsLoading } = useListProducts(
    selectedCategory ? { categoryId: selectedCategory, active: true } : { active: true }
  );
  const { data: allOrders } = useListOrders({ date: today });
  const activeOrders = (allOrders ?? [])
    .filter((o) => o.status !== "completed" && o.status !== "cancelled")
    .slice(0, 15);
  const readyOrders = activeOrders.filter((o) => o.status === "ready");

  const createOrder = useCreateOrder();
  const completeOrderMutation = useCompleteOrder();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useSse({
    events: {
      "inventory:low": (data) => {
        const { name, quantity, unit, threshold } = data as { name: string; quantity: number; unit: string; threshold: number };
        toast({
          title: t("pos.toast.lowStock"),
          description: t("pos.toast.lowStockDetail", { name, quantity: quantity.toFixed(2), unit, threshold }),
          variant: "destructive",
          duration: 8000,
        });
      },
      "ticket:updated": (data) => {
        const { status, orderId } = data as { ticketId: number; status: string; orderId: number };
        void queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        if (status === "ready") {
          // Desktop browser notification + in-app toast.
          void import("@/lib/notifications").then((m) => {
            m.showOrderReadyNotification({ orderId, status }, isAr);
          });
          toast({
            title: isAr ? "🔔 الطلب جاهز!" : "🔔 Order Ready!",
            description: isAr ? `الطلب رقم ${orderId} جاهز للاستلام` : `Order #${orderId} is ready for pickup`,
            duration: 10000,
          });
          setShowActiveOrders(true);
        }
      },
      "product:unavailable": () => {
        void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      },
      "product:available": () => {
        void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      },
      "order:created": (data) => {
        void queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        const incoming = data as { orderId?: number };
        if (incoming?.orderId) {
          newOrderIdsRef.current.add(incoming.orderId);
          setTimeout(() => newOrderIdsRef.current.delete(incoming.orderId!), 4000);
        }
        setShowActiveOrders(true);
      },
    },
  });

  const addToCart = useCallback((product: { id: number; name: string; price: number }) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) return prev.map((i) => i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  }, []);

  const updateQty = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => i.productId === productId ? { ...i, quantity: i.quantity + delta } : i)
        .filter((i) => i.quantity > 0)
    );
    if (delta < 0) {
      setNotes((prev) => {
        const remaining = cart.find((i) => i.productId === productId);
        if (remaining && remaining.quantity <= 1) {
          const { [productId]: _n, ...restNotes } = prev.itemNotes;
          const { [productId]: _e, ...restExpanded } = prev.expandedItems;
          return { ...prev, itemNotes: restNotes, expandedItems: restExpanded };
        }
        return prev;
      });
    }
  };

  const removeItem = (productId: number) => {
    setCart((prev) => prev.filter((i) => i.productId !== productId));
    setNotes((prev) => {
      const { [productId]: _n, ...restNotes } = prev.itemNotes;
      const { [productId]: _e, ...restExpanded } = prev.expandedItems;
      return { ...prev, itemNotes: restNotes, expandedItems: restExpanded };
    });
  };

  const rawSubtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const discount = discountType === "percent"
    ? Math.round(rawSubtotal * Math.min(discountInput, 100) / 100 * 100) / 100
    : discountInput;
  const { subtotal, tax, total } = calcOrderTotals(rawSubtotal, discount);
  const change = parseFloat(amountPaid || "0") - total;

  const hasNotes = notes.general.trim() || Object.values(notes.itemNotes).some((n) => n.trim());
  const hasHighPriority = notes.priority === "high";

  // Submit function reused by both online path and offline sync
  const submitOrderPayload = async (payload: unknown) => {
    return createOrder.mutateAsync({ data: payload as Parameters<typeof createOrder.mutateAsync>[0]["data"] });
  };

  const handlePlaceOrder = async (method: "cash" | "card" | "mixed") => {
    if (cart.length === 0) return;

    const generalNote = [
      notes.general.trim(),
      notes.isSpecial ? "⚠️ URGENT / عاجل" : "",
    ].filter(Boolean).join(" | ");

    const paidAmount = method === "cash" && amountPaid ? parseFloat(amountPaid) : undefined;
    const orderPayload = {
      type: orderType,
      items: cart.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        notes: notes.itemNotes[i.productId]?.trim() || undefined,
      })),
      tableNumber: tableNumber || undefined,
      discount: discount || undefined,
      notes: generalNote || undefined,
      paymentMethod: method,
      amountPaid: paidAmount,
    };

    const invoiceItems = cart.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.price,
      itemNote: notes.itemNotes[i.productId]?.trim() || undefined,
    }));

    const resetCart = () => {
      setCart([]);
      setDiscountInput(0);
      setTableNumber("");
      setPaymentOpen(false);
      setNotes({ general: "", priority: "medium", isSpecial: false, itemNotes: {}, expandedItems: {} });
    };

    // ── Offline path: queue for later ──────────────────────────────
    if (!isOnline) {
      try {
        await queueOrder(orderPayload);
        setInvoiceData({
          orderId: 0,
          orderType,
          tableNumber: tableNumber ? Number(tableNumber) : null,
          items: invoiceItems,
          subtotal,
          discount,
          tax,
          total,
          paymentMethod: method,
          createdAt: new Date().toISOString(),
          generalNote: generalNote || undefined,
          priority: notes.priority,
          isSpecial: notes.isSpecial,
        });
        resetCart();
        toast({
          title: isAr ? "محفوظ في الطابور" : "Queued Offline",
          description: isAr ? "سيتم الإرسال عند عودة الاتصال" : "Will sync when connection is restored",
        });
      } catch {
        toast({ title: t("pos.toast.error"), description: t("pos.toast.failedToPlace"), variant: "destructive" });
      }
      return;
    }

    // ── Online path: create order and send to kitchen ──────────────
    try {
      const order = await createOrder.mutateAsync({ data: orderPayload });
      const orderId = order?.id ?? 0;

      // Payment is stored on the order at creation — no immediate completion.
      // The kitchen receives the ticket (status: "new"), prepares it, and marks
      // it "ready". The cashier then clicks "Collected" to complete the order.

      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/api/reports"] });

      // Mark as new for highlight animation, open panel automatically
      newOrderIdsRef.current.add(orderId);
      setTimeout(() => newOrderIdsRef.current.delete(orderId), 4000);
      setShowActiveOrders(true);

      setInvoiceData({
        orderId,
        orderType,
        tableNumber: tableNumber ? Number(tableNumber) : null,
        items: invoiceItems,
        subtotal,
        discount,
        tax,
        total,
        paymentMethod: method,
        createdAt: new Date().toISOString(),
        generalNote: generalNote || undefined,
        priority: notes.priority,
        isSpecial: notes.isSpecial,
      });
      resetCart();
      toast({ title: t("pos.toast.orderPlaced"), description: t("pos.toast.kitchenNotified") });

      // Auto-sync any previously queued offline orders
      if (pendingCount > 0) {
        const { synced, failed } = await syncPending(submitOrderPayload);
        if (synced > 0) {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({
            title: isAr ? "تمت مزامنة الطلبات" : "Offline Orders Synced",
            description: isAr ? `تم إرسال ${synced} طلب محفوظ` : `${synced} queued order${synced > 1 ? "s" : ""} submitted`,
          });
        }
        if (failed > 0) {
          toast({
            title: isAr ? "فشل بعض الطلبات" : "Sync Partial",
            description: isAr ? `فشل ${failed} طلب` : `${failed} order${failed > 1 ? "s" : ""} failed to sync`,
            variant: "destructive",
          });
        }
      }
    } catch {
      toast({ title: t("pos.toast.error"), description: t("pos.toast.failedToPlace"), variant: "destructive" });
    }
  };

  const ORDER_TYPES = [
    { value: "dine_in", label: t("pos.orderType.dine_in") },
    { value: "takeaway", label: t("pos.orderType.takeaway") },
    { value: "delivery", label: t("pos.orderType.delivery") },
  ] as const;

  const PAYMENT_METHODS = [
    { value: "cash", label: t("pos.payment.cash"), bg: "bg-emerald-600 text-white" },
    { value: "card", label: t("pos.payment.card"), bg: "bg-primary text-white" },
    { value: "mixed", label: t("pos.payment.mixed"), bg: "bg-blue-600 text-white" },
  ] as const;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Categories + Products */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card">
          <ShoppingCart size={18} className="text-primary" />
          <h1 className="text-base font-semibold text-foreground">{t("pos.title")}</h1>
          <div className="ms-auto flex items-center gap-2">
            {!isOnline && (
              <span className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {isAr ? `غير متصل${pendingCount > 0 ? ` (${pendingCount} طلب)` : ""}` : `Offline${pendingCount > 0 ? ` (${pendingCount} queued)` : ""}`}
              </span>
            )}
            <Select value={orderType} onValueChange={(v) => setOrderType(v as typeof orderType)}>
              <SelectTrigger className="h-8 w-36 text-sm bg-background border-border" data-testid="select-order-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {ORDER_TYPES.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {orderType === "dine_in" && (
              <Input
                placeholder={t("pos.tableNumber")}
                className="h-8 w-24 text-sm bg-background border-border"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                data-testid="input-table-number"
              />
            )}
          </div>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border overflow-x-auto scrollbar-none">
          <button
            data-testid="filter-all-categories"
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
              ${selectedCategory === null ? "bg-primary text-white" : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent"}`}
          >
            {t("pos.allCategories")}
          </button>
          {catsLoading
            ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-20 shrink-0" />)
            : categories?.map((cat) => (
              <button
                key={cat.id}
                data-testid={`filter-category-${cat.id}`}
                onClick={() => setSelectedCategory(cat.id)}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                  ${selectedCategory === cat.id ? "bg-primary text-white" : "bg-card text-muted-foreground hover:text-foreground hover:bg-accent"}`}
                style={selectedCategory === cat.id ? {} : { borderInlineStart: `3px solid ${cat.color}` }}
              >
                {cat.name}
              </button>
            ))}
        </div>

        {/* Products grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {prodsLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-32 rounded-2xl" />
              ))}
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
              initial="hidden"
              animate="visible"
              variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
            >
              {products?.map((product) => {
                const inCart = cart.find((i) => i.productId === product.id);
                const unavailable = product.kitchenAvailable === false;
                return (
                  <motion.button
                    key={product.id}
                    data-testid={`card-product-${product.id}`}
                    variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
                    onClick={() => !unavailable && addToCart({ id: product.id, name: product.name, price: product.price })}
                    disabled={unavailable}
                    className={`relative flex flex-col items-start p-4 rounded-2xl border transition-all duration-150 text-start
                      ${unavailable
                        ? "bg-card/50 border-destructive/30 opacity-60 cursor-not-allowed"
                        : inCart
                        ? "bg-primary/10 border-primary shadow-lg shadow-primary/10"
                        : "bg-card border-border hover:border-primary/50 hover:shadow-md hover:shadow-primary/5"
                      }`}
                  >
                    {product.imageUrl ? (
                      <div className="w-full aspect-square rounded-lg overflow-hidden bg-muted mb-3">
                        <img src={product.imageUrl} alt={product.name} loading="lazy"
                          className={`w-full h-full object-cover ${unavailable ? "grayscale opacity-60" : ""}`}
                          onError={(e) => {
                            const el = e.currentTarget as HTMLImageElement;
                            el.style.display = 'none';
                            const parent = el.parentElement;
                            if (parent && !parent.querySelector('span.product-fallback')) {
                              parent.classList.add('flex', 'items-center', 'justify-center', 'bg-primary/20');
                              const fb = document.createElement('span');
                              fb.className = 'product-fallback text-primary font-bold text-2xl';
                              fb.textContent = product.name.charAt(0).toUpperCase();
                              parent.appendChild(fb);
                            }
                          }} />
                      </div>
                    ) : (
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${unavailable ? "bg-destructive/10" : "bg-primary/20"}`}>
                        <span className={`text-sm font-bold ${unavailable ? "text-destructive/60" : "text-primary"}`}>
                          {product.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <p className="text-foreground font-semibold text-sm leading-tight line-clamp-2 text-start">{product.name}</p>
                    <p className={`font-bold text-base mt-1 ${unavailable ? "text-muted-foreground" : "text-primary"}`}>
                      {format(product.price)}
                    </p>
                    {unavailable && (
                      <span className="absolute top-2 end-2 px-1.5 py-0.5 bg-destructive text-white text-[9px] font-bold rounded-full leading-none">
                        {isAr ? "غير متوفر" : "Out"}
                      </span>
                    )}
                    {!unavailable && inCart && (
                      <span className="absolute top-2 end-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                        {inCart.quantity}
                      </span>
                    )}
                  </motion.button>
                );
              })}
              {(!products || products.length === 0) && (
                <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <LayoutGrid size={32} className="mb-2 opacity-30" />
                  <p className="text-sm">{t("pos.noProducts")}</p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      {/* Right: Cart panel */}
      <div className="w-80 xl:w-96 flex flex-col border-s border-border bg-card overflow-hidden">

        {/* Active Orders Tracker */}
        <div className="border-b border-border">
          <button
            onClick={() => setShowActiveOrders((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ChefHat size={15} className="text-primary" />
              <span className="text-xs font-semibold text-foreground">
                {isAr ? "الطلبات النشطة" : "Active Orders"}
              </span>
              {activeOrders.length > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  readyOrders.length > 0
                    ? "bg-green-500 text-white animate-pulse"
                    : "bg-primary/20 text-primary"
                }`}>
                  {activeOrders.length}
                </span>
              )}
              {readyOrders.length > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-green-400">
                  <Bell size={10} className="animate-bounce" />
                  {isAr ? `${readyOrders.length} جاهز` : `${readyOrders.length} ready`}
                </span>
              )}
            </div>
            {showActiveOrders ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </button>

          <AnimatePresence>
            {showActiveOrders && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="max-h-52 overflow-y-auto px-3 pb-2 space-y-1">
                  {activeOrders.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-3">
                      {isAr ? "لا توجد طلبات نشطة" : "No active orders"}
                    </p>
                  ) : (
                    activeOrders.map((order) => {
                      const isNew = newOrderIdsRef.current.has(order.id);
                      const statusCfg = {
                        pending:    { label: isAr ? "بانتظار المطبخ" : "Pending",    cls: "bg-secondary text-muted-foreground" },
                        preparing:  { label: isAr ? "قيد التحضير" : "Preparing",   cls: "bg-amber-500/20 text-amber-400" },
                        ready:      { label: isAr ? "جاهز ✓" : "Ready ✓",          cls: "bg-green-500/20 text-green-400 font-bold" },
                      }[order.status as "pending" | "preparing" | "ready"] ?? { label: order.status, cls: "bg-secondary text-muted-foreground" };

                      return (
                        <motion.div
                          key={order.id}
                          layout
                          initial={{ opacity: 0, x: isAr ? 12 : -12, scale: 0.97 }}
                          animate={{ opacity: 1, x: 0, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          transition={{ duration: 0.2, ease: "easeOut" }}
                          className={`flex items-center justify-between px-3 py-1.5 rounded-lg border gap-2 transition-colors ${
                            order.status === "ready"
                              ? "border-green-500/30 bg-green-500/5"
                              : isNew
                              ? "border-primary/40 bg-primary/5"
                              : "border-border bg-background"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Clock size={11} className={isNew ? "text-primary" : "text-muted-foreground"} />
                            <span className="text-xs font-semibold truncate">#{order.orderNumber}</span>
                            <span className="text-[10px] text-muted-foreground capitalize shrink-0">
                              {order.type === "dine_in" ? (isAr ? "داخلي" : "Dine-in") :
                               order.type === "takeaway" ? (isAr ? "خارجي" : "Takeaway") :
                               isAr ? "توصيل" : "Delivery"}
                              {order.tableNumber ? ` · ${isAr ? "طاولة" : "T"}${order.tableNumber}` : ""}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full ${isNew && order.status === "pending" ? "bg-primary/25 text-primary font-semibold animate-pulse" : statusCfg.cls}`}>
                              {isNew && order.status === "pending" ? (isAr ? "⚡ جديد" : "⚡ New") : statusCfg.label}
                            </span>
                            {/* Amend button — always available on active orders */}
                            <button
                              onClick={() => setAmendOrder({ id: order.id, orderNumber: order.orderNumber, total: order.total, status: order.status })}
                              className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title={isAr ? "تعديل الفاتورة" : "Amend invoice"}
                            >
                              <FileEdit size={11} />
                            </button>
                            {order.status === "ready" && (
                              <button
                                onClick={async () => {
                                  try {
                                    await completeOrderMutation.mutateAsync({ id: order.id, data: { paymentMethod: (order.paymentMethod ?? "cash") as "cash" | "card" | "mixed" } });
                                    void queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
                                    void queryClient.invalidateQueries({ queryKey: ["/api/reports"] });
                                  } catch { /* already completed */ }
                                }}
                                disabled={completeOrderMutation.isPending}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-green-600 hover:bg-green-700 text-white font-semibold transition-colors disabled:opacity-50"
                              >
                                {isAr ? "استُلم ✓" : "Collected ✓"}
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Cart header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <ShoppingCart size={16} className="text-primary" />
            <span className="text-sm font-semibold">{t("pos.cart.title")}</span>
          </div>
          {cart.length > 0 && (
            <button
              data-testid="button-clear-cart"
              onClick={() => { setCart([]); setDiscountInput(0); setNotes({ general: "", priority: "medium", isSpecial: false, itemNotes: {}, expandedItems: {} }); }}
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Cart items */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <AnimatePresence>
            {cart.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-40 text-muted-foreground"
              >
                <ShoppingCart size={28} className="mb-2 opacity-20" />
                <p className="text-sm">{t("pos.cart.empty")}</p>
              </motion.div>
            ) : (
              cart.map((item) => (
                <motion.div
                  key={item.productId}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  className="flex items-center gap-2 py-2 px-3 rounded-xl bg-background group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate text-start">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{format(item.price)}</p>
                    {notes.itemNotes[item.productId] && (
                      <p className="text-[10px] text-amber-400 mt-0.5 truncate">
                        📝 {notes.itemNotes[item.productId]}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      data-testid={`button-decrease-${item.productId}`}
                      onClick={() => updateQty(item.productId, -1)}
                      className="w-6 h-6 rounded-lg bg-secondary text-foreground flex items-center justify-center hover:bg-accent transition-colors"
                    >
                      <Minus size={11} />
                    </button>
                    <span className="text-sm font-bold w-6 text-center text-foreground" data-testid={`text-quantity-${item.productId}`}>{item.quantity}</span>
                    <button
                      data-testid={`button-increase-${item.productId}`}
                      onClick={() => updateQty(item.productId, 1)}
                      className="w-6 h-6 rounded-lg bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors"
                    >
                      <Plus size={11} />
                    </button>
                    <button
                      data-testid={`button-remove-${item.productId}`}
                      onClick={() => removeItem(item.productId)}
                      className="w-6 h-6 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors ms-1 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>

        {/* Add Notes button */}
        {cart.length > 0 && (
          <div className="px-3 pb-1">
            <button
              onClick={() => setNotesOpen(true)}
              className={`w-full h-9 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors border
                ${hasNotes
                  ? hasHighPriority
                    ? "bg-red-500/20 border-red-500/60 text-red-400 hover:bg-red-500/30"
                    : "bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30"
                  : "bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
                }`}
            >
              <StickyNote size={14} />
              {hasNotes
                ? isAr ? "✓ تم إضافة ملاحظات" : "✓ Notes Added"
                : isAr ? "إضافة ملاحظات" : "Add Notes"}
              {notes.isSpecial && <AlertTriangle size={13} className="text-red-400" />}
            </button>
          </div>
        )}

        {/* Discount row */}
        {cart.length > 0 && (
          <div className="px-3 py-2 border-t border-border">
            <div className="flex items-center gap-2">
              <Tag size={13} className="text-muted-foreground shrink-0" />
              <div className="flex flex-1 rounded-xl overflow-hidden border border-border bg-background">
                <Input
                  type="number"
                  min={0}
                  max={discountType === "percent" ? 100 : undefined}
                  placeholder={isAr ? "خصم" : "Discount"}
                  className="h-7 text-sm border-0 bg-transparent flex-1 focus-visible:ring-0"
                  value={discountInput || ""}
                  onChange={(e) => setDiscountInput(parseFloat(e.target.value) || 0)}
                  data-testid="input-discount"
                />
                <button
                  type="button"
                  onClick={() => { setDiscountInput(0); setDiscountType(t => t === "percent" ? "fixed" : "percent"); }}
                  className="px-2.5 h-7 text-xs font-semibold border-s border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                  data-testid="button-discount-type"
                  title={discountType === "percent" ? (isAr ? "تبديل لمبلغ ثابت" : "Switch to fixed amount") : (isAr ? "تبديل لنسبة مئوية" : "Switch to percentage")}
                >
                  {discountType === "percent" ? "%" : (isAr ? "ر.س" : "SAR")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary — TAX INCLUSIVE */}
        <div className="border-t border-border px-4 py-3 space-y-1.5">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("pos.cart.subtotal")}</span>
            <span data-testid="text-subtotal">{format(subtotal)}</span>
          </div>
          {discount > 0 && (
            <div className="flex justify-between text-xs text-green-400">
              <span>
                {isAr ? "خصم" : "Discount"}
                {discountType === "percent" && discountInput > 0 && (
                  <span className="ms-1 opacity-70">({discountInput}%)</span>
                )}
              </span>
              <span>-{format(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("pos.cart.taxIncluded")}</span>
            <span data-testid="text-tax">{format(tax)}</span>
          </div>
          <div className="flex justify-between text-sm font-bold text-foreground pt-1 border-t border-border">
            <span>{t("pos.cart.total")}</span>
            <span data-testid="text-total" className="text-primary">{format(total)}</span>
          </div>
        </div>

        {/* Payment buttons */}
        <div className="px-3 pb-3 space-y-2">
          <button
            data-testid="button-charge-cash"
            disabled={cart.length === 0 || createOrder.isPending}
            onClick={() => handlePlaceOrder("cash")}
            className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Banknote size={18} />
            {t("pos.payment.cash")}
          </button>
          <div className="flex gap-2">
            <button
              data-testid="button-charge-card"
              disabled={cart.length === 0 || createOrder.isPending}
              onClick={() => handlePlaceOrder("card")}
              className="flex-1 h-10 rounded-xl bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <CreditCard size={16} />
              {t("pos.payment.card")}
            </button>
            <button
              data-testid="button-charge-mixed"
              disabled={cart.length === 0 || createOrder.isPending}
              onClick={() => setPaymentOpen(true)}
              className="flex-1 h-10 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Layers size={16} />
              {t("pos.payment.mixed")}
            </button>
          </div>
        </div>
      </div>

      {/* Payment dialog */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("pos.payment.title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between text-lg font-bold">
              <span>{t("pos.cart.total")}</span>
              <span className="text-primary">{format(total)}</span>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs">{t("pos.payment.method")}</Label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_METHODS.map(({ value, label }) => (
                  <button
                    key={value}
                    data-testid={`button-payment-${value}`}
                    onClick={() => setPaymentMethod(value)}
                    className={`py-2 rounded-xl text-sm font-semibold transition-colors
                      ${paymentMethod === value
                        ? value === "cash" ? "bg-emerald-600 text-white" : value === "card" ? "bg-primary text-white" : "bg-blue-600 text-white"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                      }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {paymentMethod === "cash" && (
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs">{t("pos.payment.amountReceived")}</Label>
                <Input
                  type="number"
                  placeholder={t("pos.payment.enterAmount")}
                  className="bg-background border-border"
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  data-testid="input-amount-paid"
                />
                {parseFloat(amountPaid || "0") >= total && (
                  <p className="text-sm text-emerald-400 font-medium">
                    {t("pos.payment.change")}: {format(Math.max(0, change))}
                  </p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <button
                data-testid="button-confirm-payment"
                onClick={() => handlePlaceOrder(paymentMethod)}
                disabled={createOrder.isPending}
                className="flex-1 h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold transition-colors disabled:opacity-50"
              >
                {t("pos.payment.confirm")}
              </button>
              <button
                onClick={() => {
                  handlePlaceOrder(paymentMethod);
                }}
                disabled={createOrder.isPending}
                className="h-12 px-4 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                title={isAr ? "تأكيد وطباعة" : "Confirm & Print"}
              >
                <Printer size={16} />
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Notes Modal */}
      <Dialog open={notesOpen} onOpenChange={setNotesOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote size={16} className="text-primary" />
              {isAr ? "ملاحظات الطلب والزبون" : "Order & Customer Notes"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* General note */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {isAr ? "ملاحظة عامة للطلب" : "General Order Note"}
              </Label>
              <textarea
                value={notes.general}
                onChange={(e) => setNotes((p) => ({ ...p, general: e.target.value }))}
                placeholder={isAr ? "مثال: الزبون يحب الطعام بدون توابل..." : "e.g. No spices, extra sauce..."}
                maxLength={500}
                rows={3}
                className="w-full rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 resize-none focus:outline-none focus:border-primary"
              />
              <p className="text-[10px] text-muted-foreground text-end">{notes.general.length}/500</p>
            </div>

            {/* Per-item notes */}
            {cart.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {isAr ? "ملاحظات خاصة بكل منتج" : "Per-Item Notes"}
                </Label>
                {cart.map((item) => (
                  <div key={item.productId} className="rounded-xl bg-background border border-border overflow-hidden">
                    <button
                      onClick={() => setNotes((p) => ({
                        ...p,
                        expandedItems: { ...p.expandedItems, [item.productId]: !p.expandedItems[item.productId] },
                      }))}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                          {item.quantity}
                        </span>
                        <span className="font-medium">{item.name}</span>
                        {notes.itemNotes[item.productId] && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            {isAr ? "بها ملاحظة" : "has note"}
                          </span>
                        )}
                      </div>
                      {notes.expandedItems[item.productId] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    {notes.expandedItems[item.productId] && (
                      <div className="px-3 pb-3">
                        <input
                          type="text"
                          value={notes.itemNotes[item.productId] ?? ""}
                          onChange={(e) => setNotes((p) => ({
                            ...p,
                            itemNotes: { ...p.itemNotes, [item.productId]: e.target.value },
                          }))}
                          placeholder={isAr ? "مثال: بدون جبنة، مع خس زيادة..." : "e.g. No cheese, extra lettuce..."}
                          className="w-full rounded-lg bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground px-3 py-2 focus:outline-none focus:border-primary"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Priority */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {isAr ? "أولوية الملاحظة" : "Note Priority"}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {(["low", "medium", "high"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setNotes((prev) => ({ ...prev, priority: p, isSpecial: p !== "high" ? false : prev.isSpecial }))}
                    className={`py-2 rounded-xl text-xs font-semibold transition-colors border
                      ${notes.priority === p
                        ? p === "high" ? "bg-red-500 border-red-500 text-white"
                          : p === "medium" ? "bg-amber-500 border-amber-500 text-white"
                          : "bg-emerald-600 border-emerald-600 text-white"
                        : "bg-background border-border text-muted-foreground hover:text-foreground"
                      }`}
                  >
                    {p === "high" ? (isAr ? "عالية" : "High") : p === "medium" ? (isAr ? "متوسطة" : "Medium") : (isAr ? "منخفضة" : "Low")}
                  </button>
                ))}
              </div>
            </div>

            {/* Special flag */}
            {notes.priority === "high" && (
              <div
                onClick={() => setNotes((p) => ({ ...p, isSpecial: !p.isSpecial }))}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors
                  ${notes.isSpecial ? "bg-red-500/20 border-red-500/60" : "bg-background border-border hover:border-red-500/40"}`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors
                  ${notes.isSpecial ? "bg-red-500 border-red-500" : "border-border"}`}>
                  {notes.isSpecial && <span className="text-white text-[10px] font-bold">✓</span>}
                </div>
                <span className={`text-sm font-medium ${notes.isSpecial ? "text-red-400" : "text-muted-foreground"}`}>
                  {isAr ? "⚠️ ملاحظة حساسة جداً — انتبه!" : "⚠️ Very urgent — Kitchen alert!"}
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => {
                  setNotes({ general: "", priority: "medium", isSpecial: false, itemNotes: {}, expandedItems: {} });
                }}
                className="px-4 h-10 rounded-xl text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition-colors"
              >
                {isAr ? "مسح الكل" : "Clear All"}
              </button>
              <button
                onClick={() => setNotesOpen(false)}
                className="px-4 h-10 rounded-xl text-sm font-medium bg-background border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => setNotesOpen(false)}
                className="flex-1 h-10 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                {isAr ? "حفظ الملاحظات" : "Save Notes"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {invoiceData && (
        <InvoiceModal data={invoiceData} onClose={() => setInvoiceData(null)} />
      )}

      <AmendmentDialog
        open={amendOrder !== null}
        order={amendOrder}
        onClose={() => setAmendOrder(null)}
        onSuccess={() => void queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() })}
      />
    </div>
  );
}
