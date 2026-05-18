import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, Plus, Minus, Trash2, ChefHat,
  CheckCircle2, Loader2, UtensilsCrossed, Languages, QrCode,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import "@/i18n";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CartItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
}

interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  price: number;
  isActive: boolean;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  imageUrl: string | null;
  kitchenAvailable?: boolean;
  unavailabilityReason?: string | null;
}

interface QrContext {
  tenantId: number;
  tableNumber: string;
  menu: MenuItem[];
  tenantName: string;
  currency: string;
}

function useQrContext(token: string) {
  const [ctx, setCtx] = useState<QrContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setIsLoading(false); return; }
    fetch(`${BASE}/api/public/qr/${encodeURIComponent(token)}`)
      .then((r) => {
        if (!r.ok) return r.json().then((b: { error?: string }) => { throw new Error(b.error ?? "Invalid QR"); });
        return r.json() as Promise<QrContext>;
      })
      .then(setCtx)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setIsLoading(false));
  }, [token]);

  return { ctx, isLoading, error };
}

async function submitGuestOrder(
  tenantId: number,
  tableNumber: string,
  items: CartItem[],
  notes: string
) {
  const res = await fetch(`${BASE}/api/public/orders?tenantId=${tenantId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableNumber,
      items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      notes: notes || undefined,
    }),
  });
  if (!res.ok) {
    const body = (await res.json()) as { error?: string };
    throw new Error(body.error ?? "Failed to place order");
  }
  return res.json() as Promise<{ orderId: number; orderNumber: string; total: number }>;
}

/* ──────────────────────────────────────
   Bilingual text helper (inline fallback)
────────────────────────────────────── */
const TX = {
  invalidQr:    { en: "Invalid QR Code",             ar: "رمز QR غير صالح" },
  invalidHint:  { en: "Please scan a valid table QR code.", ar: "يرجى مسح رمز QR صالح للطاولة." },
  expired:      { en: "QR Code Expired",             ar: "انتهت صلاحية رمز QR" },
  expiredHint:  { en: "This QR code is no longer valid. Please ask for a new one.", ar: "انتهت صلاحية هذا الرمز. يرجى طلب رمز جديد." },
  loading:      { en: "Loading menu…",               ar: "جارٍ تحميل القائمة…" },
  table:        { en: "Table",                       ar: "طاولة" },
  cart:         { en: "Cart",                        ar: "السلة" },
  all:          { en: "All",                         ar: "الكل" },
  add:          { en: "Add",                         ar: "أضف" },
  orderPlaced:  { en: "Order Placed!",               ar: "تم تقديم الطلب!" },
  kitchenSent:  { en: "Your order has been sent to the kitchen.", ar: "تم إرسال طلبك إلى المطبخ." },
  orderMore:    { en: "Order More",                  ar: "طلب المزيد" },
  yourOrder:    { en: "Your Order",                  ar: "طلبك" },
  noItems:      { en: "No items added yet",          ar: "لم تُضف أي منتجات بعد" },
  requests:     { en: "Any special requests or notes…", ar: "أي طلبات خاصة أو ملاحظات…" },
  subtotal:     { en: "Subtotal",                    ar: "المجموع الفرعي" },
  vat:          { en: "VAT (15%)",                   ar: "ضريبة القيمة المضافة (15%)" },
  total:        { en: "Total",                       ar: "الإجمالي" },
  placeOrder:   { en: "Place Order",                 ar: "تأكيد الطلب" },
  placing:      { en: "Placing Order…",              ar: "جارٍ تقديم الطلب…" },
  switchToAr:   { en: "عربي",                        ar: "English" },
};

export default function OrderPage() {
  const { i18n } = useTranslation();
  const [location] = useLocation();
  const params = new URLSearchParams(
    typeof window !== "undefined"
      ? window.location.search
      : location.split("?")[1] ?? ""
  );
  const token = params.get("token") ?? "";

  const [lang, setLang] = useState<"en" | "ar">(() => {
    const saved = localStorage.getItem("foodoro-order-lang");
    if (saved === "ar" || saved === "en") return saved;
    return i18n.language === "ar" ? "ar" : "en";
  });
  const isAr = lang === "ar";
  const tx = (key: keyof typeof TX) => TX[key][lang];

  const toggleLang = () => {
    const next: "en" | "ar" = isAr ? "en" : "ar";
    setLang(next);
    localStorage.setItem("foodoro-order-lang", next);
  };

  const { ctx, isLoading, error } = useQrContext(token);

  const menu = ctx?.menu ?? [];
  const tableNumber = ctx?.tableNumber ?? "";
  const tenantId = ctx?.tenantId ?? 0;
  const tenantName = ctx?.tenantName ?? "FOODORO";
  const currency = ctx?.currency ?? "SAR";
  const currencyLabel = isAr ? "ر.س" : currency;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ orderNumber: string; total: number } | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);

  const categories = Array.from(
    new Map(
      menu
        .filter((p) => p.categoryId != null)
        .map((p) => [p.categoryId, { id: p.categoryId!, name: p.categoryName ?? "Other", color: p.categoryColor ?? "#E67E22" }])
    ).values()
  );

  const filtered = activeCategory == null ? menu : menu.filter((p) => p.categoryId === activeCategory);

  const addToCart = useCallback((product: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) return prev.map((c) => c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  }, []);

  const updateQty = useCallback((productId: number, delta: number) => {
    setCart((prev) => prev.map((c) => c.productId === productId ? { ...c, quantity: c.quantity + delta } : c).filter((c) => c.quantity > 0));
  }, []);

  const removeItem = useCallback((productId: number) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }, []);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const tax = subtotal * 0.15;
  const total = subtotal + tax;

  const handleOrder = async () => {
    if (!tenantId || !tableNumber || cart.length === 0) return;
    setSubmitting(true);
    setOrderError(null);
    try {
      const result = await submitGuestOrder(tenantId, tableNumber, cart, notes);
      setSuccess({ orderNumber: result.orderNumber, total: result.total });
      setCart([]);
      setCartOpen(false);
    } catch (e: unknown) {
      setOrderError(e instanceof Error ? e.message : "Failed to place order");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── No token ────────────────────────────── */
  if (!token) {
    return (
      <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#111827] flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center">
          <QrCode size={48} className="mx-auto text-[#E67E22] mb-4" />
          <h1 className="text-white text-xl font-bold mb-2">{tx("invalidQr")}</h1>
          <p className="text-gray-400 text-sm">{tx("invalidHint")}</p>
        </div>
        <button onClick={toggleLang} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-gray-400 text-xs hover:text-white transition-colors">
          <Languages size={12} />
          {tx("switchToAr")}
        </button>
      </div>
    );
  }

  /* ── Loading ─────────────────────────────── */
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111827] flex flex-col items-center justify-center gap-4">
        <Loader2 size={36} className="text-[#E67E22] animate-spin" />
        <p className="text-gray-400 text-sm">{tx("loading")}</p>
      </div>
    );
  }

  /* ── Error / Expired ─────────────────────── */
  if (error || !ctx) {
    const isExpired = error?.includes("انتهت") || error?.includes("expired");
    return (
      <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#111827] flex flex-col items-center justify-center p-6 gap-6">
        <div className="text-center">
          <UtensilsCrossed size={48} className="mx-auto text-red-400 mb-4" />
          <h1 className="text-white text-xl font-bold mb-2">{isExpired ? tx("expired") : tx("invalidQr")}</h1>
          <p className="text-gray-400 text-sm">{isExpired ? tx("expiredHint") : tx("invalidHint")}</p>
        </div>
        <button onClick={toggleLang} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 text-gray-400 text-xs hover:text-white transition-colors">
          <Languages size={12} />
          {tx("switchToAr")}
        </button>
      </div>
    );
  }

  /* ── Order success ───────────────────────── */
  if (success) {
    return (
      <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#111827] flex items-center justify-center p-6">
        <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm w-full">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 size={40} className="text-emerald-400" />
          </div>
          <h1 className="text-white text-2xl font-bold mb-2">{tx("orderPlaced")}</h1>
          <p className="text-gray-400 mb-1">{tx("kitchenSent")}</p>
          <p className="text-[#E67E22] font-semibold text-lg mb-1">{success.orderNumber}</p>
          <p className="text-gray-300 text-sm mb-6">
            {isAr ? `طاولة ${tableNumber} · الإجمالي: ${success.total.toFixed(2)} ${currencyLabel}` : `Table ${tableNumber} · Total: ${success.total.toFixed(2)} ${currency}`}
          </p>
          <button onClick={() => setSuccess(null)} className="w-full h-12 rounded-2xl bg-[#E67E22] text-white font-semibold hover:bg-[#d4701e] transition-colors">
            {tx("orderMore")}
          </button>
        </motion.div>
      </div>
    );
  }

  /* ── Main menu ───────────────────────────── */
  return (
    <div dir={isAr ? "rtl" : "ltr"} className="min-h-screen bg-[#111827] flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-[#1F2937] border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-[#E67E22] flex items-center justify-center shrink-0">
            <ChefHat size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-none truncate">{tenantName}</p>
            <p className="text-gray-400 text-xs mt-0.5">{tx("table")} {tableNumber}</p>
          </div>
        </div>
        <button onClick={toggleLang} className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 text-gray-300 text-xs font-semibold hover:bg-white/20 transition-colors shrink-0">
          <Languages size={12} />
          {tx("switchToAr")}
        </button>
        <button onClick={() => setCartOpen(true)} className="relative flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E67E22] text-white text-sm font-semibold shrink-0">
          <ShoppingCart size={16} />
          {cartCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-bold">{cartCount}</span>
          )}
          {cartCount > 0 ? `${total.toFixed(2)} ${currency}` : tx("cart")}
        </button>
      </div>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto scrollbar-none border-b border-white/5 shrink-0">
          <button onClick={() => setActiveCategory(null)} className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory == null ? "bg-[#E67E22] text-white" : "bg-[#1F2937] text-gray-400 hover:text-white"}`}>
            {tx("all")}
          </button>
          {categories.map((cat) => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${activeCategory === cat.id ? "text-white" : "bg-[#1F2937] text-gray-400 hover:text-white"}`}
              style={activeCategory === cat.id ? { backgroundColor: cat.color } : {}}>
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Menu grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {menu.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-gray-500 text-sm">No items available</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filtered.map((product) => {
              const cartItem = cart.find((c) => c.productId === product.id);
              const catColor = categories.find((c) => c.id === product.categoryId)?.color ?? "#E67E22";
              const unavailable = product.kitchenAvailable === false;
              return (
                <motion.div key={product.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={`bg-[#1F2937] rounded-2xl overflow-hidden border flex flex-col relative ${unavailable ? "border-red-500/30 opacity-75" : "border-white/5"}`}>
                  {unavailable && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-black/60 pointer-events-none">
                      <UtensilsCrossed size={24} className="text-red-400 mb-1.5" />
                      <span className="text-red-300 text-xs font-bold px-2 text-center">
                        {isAr ? "غير متوفر حاليًا" : "Not Available"}
                      </span>
                      {product.unavailabilityReason && (
                        <span className="text-red-400/70 text-[10px] mt-0.5 px-2 text-center">
                          {isAr
                            ? { out_of_stock: "نفد المخزون", temp_unavailable: "متوقف مؤقتًا", ended_today: "انتهى اليوم", ingredient_out: "نفدت المكونات", paused: "موقوف" }[product.unavailabilityReason] ?? product.unavailabilityReason
                            : product.unavailabilityReason.replace(/_/g, " ")
                          }
                        </span>
                      )}
                    </div>
                  )}
                  <div className="h-28 overflow-hidden relative" style={{ background: `linear-gradient(135deg, ${catColor}22, ${catColor}11)` }}>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover"
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; (e.currentTarget.nextElementSibling as HTMLElement | null)?.removeAttribute("hidden"); }} />
                    ) : null}
                    <div hidden={!!product.imageUrl} className="absolute inset-0 flex items-center justify-center">
                      <UtensilsCrossed size={32} className="text-white/20" />
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <p className="text-white text-sm font-semibold leading-tight">{product.name}</p>
                    {product.description && <p className="text-gray-500 text-xs leading-tight line-clamp-2">{product.description}</p>}
                    <p className={`font-bold text-sm mt-auto ${unavailable ? "text-gray-500" : "text-[#E67E22]"}`}>{isAr ? `${product.price.toFixed(2)} ${currencyLabel}` : `${product.price.toFixed(2)} ${currency}`}</p>
                    {!unavailable && (cartItem ? (
                      <div className="flex items-center justify-between bg-[#111827] rounded-xl px-2 py-1">
                        <button onClick={() => updateQty(product.id, -1)} className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"><Minus size={12} /></button>
                        <span className="text-white font-semibold text-sm">{cartItem.quantity}</span>
                        <button onClick={() => updateQty(product.id, 1)} className="w-7 h-7 rounded-lg bg-[#E67E22] flex items-center justify-center text-white hover:bg-[#d4701e] transition-colors"><Plus size={12} /></button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(product)} className="w-full h-8 rounded-xl bg-[#E67E22]/20 text-[#E67E22] text-xs font-semibold hover:bg-[#E67E22]/30 transition-colors flex items-center justify-center gap-1">
                        <Plus size={12} />
                        {tx("add")}
                      </button>
                    ))}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart drawer */}
      <AnimatePresence>
        {cartOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-40" onClick={() => setCartOpen(false)} />
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-[#1F2937] rounded-t-3xl max-h-[85vh] flex flex-col" dir={isAr ? "rtl" : "ltr"}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <h2 className="text-white font-bold text-base flex items-center gap-2">
                  <ShoppingCart size={16} className="text-[#E67E22]" />
                  {tx("yourOrder")} · {tx("table")} {tableNumber}
                </h2>
                <button onClick={() => setCartOpen(false)} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:text-white">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                {cart.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">{tx("noItems")}</p>
                ) : (
                  cart.map((item) => (
                    <div key={item.productId} className="flex items-center gap-3 py-2 border-b border-white/5">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{item.name}</p>
                        <p className="text-gray-400 text-xs">{item.price.toFixed(2)} {isAr ? "ر.س" : currency} × {item.quantity}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center gap-1 bg-[#111827] rounded-xl px-2 py-1">
                          <button onClick={() => updateQty(item.productId, -1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white"><Minus size={11} /></button>
                          <span className="text-white text-sm font-semibold w-5 text-center">{item.quantity}</span>
                          <button onClick={() => updateQty(item.productId, 1)} className="w-6 h-6 flex items-center justify-center text-[#E67E22] hover:text-[#d4701e]"><Plus size={11} /></button>
                        </div>
                        <button onClick={() => removeItem(item.productId)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  ))
                )}
                {cart.length > 0 && (
                  <div className="pt-2">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tx("requests")}
                      className="w-full bg-[#111827] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 border border-white/10 resize-none focus:outline-none focus:border-[#E67E22]/50" rows={2} />
                  </div>
                )}
              </div>
              {cart.length > 0 && (
                <div className="px-5 py-4 border-t border-white/10 space-y-3">
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>{tx("subtotal")}</span>
                    <span>{subtotal.toFixed(2)} {isAr ? "ر.س" : currency}</span>
                  </div>
                  <div className="flex justify-between text-sm text-gray-400">
                    <span>{tx("vat")}</span>
                    <span>{tax.toFixed(2)} {isAr ? "ر.س" : currency}</span>
                  </div>
                  <div className="flex justify-between text-white font-bold">
                    <span>{tx("total")}</span>
                    <span className="text-[#E67E22]">{total.toFixed(2)} {isAr ? "ر.س" : currency}</span>
                  </div>
                  {orderError && <p className="text-red-400 text-xs text-center">{orderError}</p>}
                  <button onClick={handleOrder} disabled={submitting}
                    className="w-full h-12 rounded-2xl bg-[#E67E22] text-white font-bold text-sm hover:bg-[#d4701e] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {submitting ? (
                      <><Loader2 size={16} className="animate-spin" />{tx("placing")}</>
                    ) : (
                      <>{tx("placeOrder")} · {total.toFixed(2)} {isAr ? "ر.س" : currency}</>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
