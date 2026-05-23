import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, Plus, Minus, Trash2, ChefHat,
  CheckCircle2, Loader2, UtensilsCrossed, Languages, QrCode,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import "@/i18n";
import { OrderAttachmentInput } from "@/components/order-attachment-input";
import { ProductOptionsPicker, type ResolvedSelection } from "@/components/product-options-picker";
import type { ProductOptionGroup } from "@/components/product-options-editor";
import { buildFingerprintPayload, isValidSaudiPhone, maskPhone } from "@/lib/device-fingerprint";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface CartItem {
  lineId: string;
  productId: number;
  name: string;
  price: number;
  quantity: number;
  note?: string;
  selectedOptions?: ResolvedSelection[];
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
  optionGroups?: ProductOptionGroup[];
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
  notes: string,
  customer: { name: string; phone: string },
  qrToken: string | null,
  attachmentUrl: string | null,
  fingerprint: ReturnType<typeof buildFingerprintPayload>,
  scanId: number | null,
) {
  const res = await fetch(`${BASE}/api/public/orders?tenantId=${tenantId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tableNumber,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        notes: i.note?.trim() || undefined,
        ...(i.selectedOptions && i.selectedOptions.length > 0
          ? { selectedOptions: i.selectedOptions.map((s) => ({ groupId: s.groupId, itemId: s.itemId })) }
          : {}),
      })),
      notes: notes || undefined,
      generalNote: notes || undefined,
      customerName: customer.name.trim(),
      customerPhone: customer.phone.trim() || undefined,
      qrToken: qrToken ?? undefined,
      attachmentUrl: attachmentUrl ?? undefined,
      // Security signals for fraud scoring (backend re-hashes server-side)
      timezone: fingerprint.timezone,
      screenResolution: fingerprint.screenResolution,
      clientHints: fingerprint.clientHints,
      scanId: scanId ?? undefined,
    }),
  });
  const body = (await res.json()) as {
    orderId?: number; orderNumber?: string; total?: number;
    error?: string; code?: string;
    requiresOtp?: boolean; requiresApproval?: boolean;
    orderSecId?: number; otpExpiresAt?: string;
    fraudScore?: number; riskLevel?: string;
  };
  if (!res.ok) {
    const err = new Error(body.error ?? "Failed to place order") as Error & { code?: string };
    err.code = body.code;
    throw err;
  }
  return body as Required<Pick<typeof body, "orderId" | "orderNumber" | "total">> & typeof body;
}

async function verifyOtp(orderSecId: number, code: string, phoneNumber: string) {
  const r = await fetch(`${BASE}/api/public/qr/otp/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderSecId, code, phoneNumber }),
  });
  const body = (await r.json()) as { ok?: boolean; error?: string; status?: string };
  if (!r.ok || !body.ok) throw new Error(body.error ?? "OTP failed");
  return body;
}

async function resendOtp(orderSecId: number) {
  const r = await fetch(`${BASE}/api/public/qr/otp/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderSecId }),
  });
  if (!r.ok) {
    const b = (await r.json()) as { error?: string };
    throw new Error(b.error ?? "Resend failed");
  }
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
  const tenantName = ctx?.tenantName ?? "FOODPRO";
  const currency = ctx?.currency ?? "SAR";
  const currencyLabel = isAr ? "ر.س" : currency;

  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ orderNumber: string; total: number } | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  // Customer registration step (after cart confirmation, before order is sent)
  const [showCustomerStep, setShowCustomerStep] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [optionPickerProduct, setOptionPickerProduct] = useState<MenuItem | null>(null);

  // ── QR security state ────────────────────────────────────────────────────
  const [scanId, setScanId] = useState<number | null>(null);
  const [otpStage, setOtpStage] = useState<null | {
    orderSecId: number; orderNumber: string; total: number;
    requiresApproval: boolean; fraudScore: number;
  }>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  // Trigger one scan-record per QR session (gives backend the device fingerprint).
  useEffect(() => {
    if (!token || !tenantId || scanId !== null) return;
    const fp = buildFingerprintPayload();
    fetch(`${BASE}/api/public/qr/scan?tenantId=${tenantId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qrToken: token, ...fp }),
    })
      .then((r) => r.json())
      .then((d: { scanId?: number }) => { if (d.scanId) setScanId(d.scanId); })
      .catch(() => { /* non-fatal */ });
  }, [token, tenantId, scanId]);

  const categories = Array.from(
    new Map(
      menu
        .filter((p) => p.categoryId != null)
        .map((p) => [p.categoryId, { id: p.categoryId!, name: p.categoryName ?? "Other", color: p.categoryColor ?? "#E67E22" }])
    ).values()
  );

  const filtered = activeCategory == null ? menu : menu.filter((p) => p.categoryId === activeCategory);

  const addToCart = useCallback((product: MenuItem) => {
    if (product.optionGroups && product.optionGroups.length > 0) {
      setOptionPickerProduct(product);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id && (!c.selectedOptions || c.selectedOptions.length === 0));
      if (existing) return prev.map((c) => c.lineId === existing.lineId ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, { lineId: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, productId: product.id, name: product.name, price: product.price, quantity: 1 }];
    });
  }, []);

  const addLineToCart = useCallback((product: MenuItem, finalUnitPrice: number, selections: ResolvedSelection[]) => {
    setCart((prev) => {
      const sig = selections.map((s) => `${s.groupId}:${s.itemId}`).sort().join("|");
      const existing = prev.find((c) =>
        c.productId === product.id &&
        (c.selectedOptions ?? []).map((s) => `${s.groupId}:${s.itemId}`).sort().join("|") === sig
      );
      if (existing) return prev.map((c) => c.lineId === existing.lineId ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, {
        lineId: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        productId: product.id, name: product.name,
        price: finalUnitPrice, quantity: 1,
        selectedOptions: selections,
      }];
    });
  }, []);

  const updateQty = useCallback((lineId: string, delta: number) => {
    setCart((prev) => prev.map((c) => c.lineId === lineId ? { ...c, quantity: c.quantity + delta } : c).filter((c) => c.quantity > 0));
  }, []);

  const removeItem = useCallback((lineId: string) => {
    setCart((prev) => prev.filter((c) => c.lineId !== lineId));
  }, []);

  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  // Prices stored & displayed are TAX-INCLUSIVE (VAT already in the sticker price).
  // We extract the base subtotal and VAT portion from the total.
  const taxRate = Number(ctx?.taxRate ?? 15) / 100;
  const total = cart.reduce((s, c) => s + c.price * c.quantity, 0);
  const subtotal = taxRate > 0 ? total / (1 + taxRate) : total;
  const tax = total - subtotal;

  const handleOrder = async () => {
    if (!tenantId || !tableNumber || cart.length === 0) return;
    if (!showCustomerStep) {
      setShowCustomerStep(true);
      return;
    }
    if (customerName.trim().length < 2) {
      setOrderError(isAr ? "الرجاء كتابة اسمك للفاتورة." : "Please enter your name for the bill.");
      return;
    }
    // Saudi phone is now mandatory for QR orders (fraud protection)
    if (!isValidSaudiPhone(customerPhone.trim())) {
      setOrderError(isAr ? "رقم جوال سعودي صحيح مطلوب (05xxxxxxxx)" : "Valid Saudi phone required (05xxxxxxxx)");
      return;
    }
    setSubmitting(true);
    setOrderError(null);
    try {
      const fingerprint = buildFingerprintPayload();
      const result = await submitGuestOrder(
        tenantId, tableNumber, cart, notes,
        { name: customerName, phone: customerPhone }, token, attachmentUrl,
        fingerprint, scanId,
      );
      // OTP required by the backend → switch to verify stage instead of showing success.
      if (result.requiresOtp && result.orderSecId) {
        setOtpStage({
          orderSecId: result.orderSecId,
          orderNumber: result.orderNumber,
          total: result.total,
          requiresApproval: !!result.requiresApproval,
          fraudScore: result.fraudScore ?? 0,
        });
        setCartOpen(false);
        setShowCustomerStep(false);
        return;
      }
      setSuccess({ orderNumber: result.orderNumber, total: result.total });
      setCart([]);
      setCartOpen(false);
      setShowCustomerStep(false);
    } catch (e: unknown) {
      const err = e as Error & { code?: string };
      if (err.code === "FRAUD_BLOCKED") {
        setOrderError(isAr
          ? "⚠️ تم رفض الطلب لأسباب أمنية. الرجاء التواصل مع موظفي المطعم."
          : "⚠️ Order blocked for security reasons. Please contact restaurant staff.");
      } else {
        setOrderError(err.message ?? "Failed to place order");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleOtpSubmit = async () => {
    if (!otpStage) return;
    setOtpSubmitting(true);
    setOtpError(null);
    try {
      await verifyOtp(otpStage.orderSecId, otpCode.trim(), customerPhone.trim());
      setSuccess({ orderNumber: otpStage.orderNumber, total: otpStage.total });
      setCart([]);
      setOtpStage(null);
      setOtpCode("");
    } catch (e: unknown) {
      setOtpError(e instanceof Error ? e.message : "OTP failed");
    } finally {
      setOtpSubmitting(false);
    }
  };

  const handleOtpResend = async () => {
    if (!otpStage) return;
    setOtpError(null);
    try {
      await resendOtp(otpStage.orderSecId);
    } catch (e: unknown) {
      setOtpError(e instanceof Error ? e.message : "Resend failed");
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
                    <div key={item.lineId} className="py-2 border-b border-white/5 space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{item.name}</p>
                          <p className="text-gray-400 text-xs">{item.price.toFixed(2)} {isAr ? "ر.س" : currency} × {item.quantity}</p>
                          {item.selectedOptions && item.selectedOptions.length > 0 && (
                            <p className="text-[10px] text-[#E67E22]/90 mt-0.5 truncate" data-testid={`qr-cart-options-${item.lineId}`}>
                              {item.selectedOptions.map((s) => s.itemName).join(" • ")}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1 bg-[#111827] rounded-xl px-2 py-1">
                            <button onClick={() => updateQty(item.lineId, -1)} className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-white"><Minus size={11} /></button>
                            <span className="text-white text-sm font-semibold w-5 text-center">{item.quantity}</span>
                            <button onClick={() => updateQty(item.lineId, 1)} className="w-6 h-6 flex items-center justify-center text-[#E67E22] hover:text-[#d4701e]"><Plus size={11} /></button>
                          </div>
                          <button onClick={() => removeItem(item.lineId)} className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-red-400"><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <input
                        type="text"
                        value={item.note ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setCart((prev) => prev.map((c) => c.lineId === item.lineId ? { ...c, note: v } : c));
                        }}
                        placeholder={isAr ? "ملاحظات على هذا الصنف (اختياري)" : "Notes on this item (optional)"}
                        maxLength={200}
                        className="w-full bg-[#111827]/70 rounded-lg px-3 py-1.5 text-xs text-white placeholder-gray-600 border border-white/5 focus:outline-none focus:border-[#E67E22]/40"
                        data-testid={`qr-item-note-${item.lineId}`}
                      />
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
                  {showCustomerStep && (
                    <div className="space-y-2 bg-[#111827]/60 border border-[#E67E22]/30 rounded-2xl p-3" data-testid="qr-customer-step">
                      <p className="text-white font-semibold text-sm flex items-center gap-1.5">
                        {isAr ? "بياناتك (إجبارية للحماية من الاحتيال)" : "Your details (required for fraud protection)"}
                      </p>
                      <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder={isAr ? "اسمك *" : "Your name *"}
                        required
                        className="w-full bg-[#0B0F19] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 border border-white/10 focus:outline-none focus:border-[#E67E22]"
                        data-testid="qr-customer-name"
                      />
                      <input
                        type="tel"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        placeholder={isAr ? "رقم الجوال السعودي 05xxxxxxxx *" : "Saudi phone 05xxxxxxxx *"}
                        required
                        pattern="(05|\+9665|009665)[0-9]{8}"
                        className="w-full bg-[#0B0F19] rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-500 border border-white/10 focus:outline-none focus:border-[#E67E22] [direction:ltr] text-start"
                        data-testid="qr-customer-phone"
                      />
                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        💬 {isAr
                          ? "إذا اكتُشف نشاط مريب على هذا الطلب، سنرسل لك رمز تحقق عبر واتساب."
                          : "If suspicious activity is detected, we will send a WhatsApp verification code."}
                      </p>
                      <div className="pt-1">
                        <OrderAttachmentInput
                          value={attachmentUrl}
                          onChange={setAttachmentUrl}
                          publicMode
                          testIdPrefix="qr-order-attach"
                        />
                      </div>
                    </div>
                  )}
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

      {/* Customer product-options picker */}
      {optionPickerProduct && (
        <ProductOptionsPicker
          open={true}
          productName={optionPickerProduct.name}
          basePrice={optionPickerProduct.price}
          currency={isAr ? "ر.س" : currency}
          optionGroups={optionPickerProduct.optionGroups ?? []}
          onCancel={() => setOptionPickerProduct(null)}
          onConfirm={(sels, finalPrice) => {
            addLineToCart(optionPickerProduct, finalPrice, sels);
            setOptionPickerProduct(null);
          }}
        />
      )}

      {/* WhatsApp OTP verification stage — appears when fraud score ≥ 40 */}
      <AnimatePresence>
        {otpStage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            data-testid="qr-otp-modal"
          >
            <motion.div
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4"
            >
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[#25D366]/10 flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">💬</span>
                </div>
                <h2 className="text-white text-lg font-bold">
                  {isAr ? "التحقق عبر واتساب" : "WhatsApp Verification"}
                </h2>
                <p className="text-gray-400 text-xs mt-1">
                  {isAr ? `تم إرسال رمز إلى ${maskPhone(customerPhone)}` : `Code sent to ${maskPhone(customerPhone)}`}
                </p>
              </div>

              <input
                type="text"
                inputMode="numeric"
                value={otpCode}
                onChange={(e) => { setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setOtpError(null); }}
                placeholder="••••••"
                maxLength={6}
                className="w-full bg-[#111827] border border-white/10 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.6em] font-bold focus:outline-none focus:border-[#25D366]"
                data-testid="qr-otp-input"
                autoFocus
              />

              {otpError && (
                <p className="text-red-400 text-xs text-center" data-testid="qr-otp-error">{otpError}</p>
              )}

              <button
                onClick={handleOtpSubmit}
                disabled={otpCode.length !== 6 || otpSubmitting}
                className="w-full bg-[#25D366] hover:bg-[#1ebb55] disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
                data-testid="qr-otp-submit"
              >
                {otpSubmitting ? "..." : (isAr ? "تحقق وأكد الطلب" : "Verify & Confirm")}
              </button>

              <div className="flex items-center justify-between text-xs text-gray-500">
                <button onClick={handleOtpResend} className="hover:text-white transition-colors" data-testid="qr-otp-resend">
                  {isAr ? "إعادة الإرسال" : "Resend code"}
                </button>
                <button
                  onClick={() => { setOtpStage(null); setOtpCode(""); setOtpError(null); }}
                  className="hover:text-white transition-colors"
                  data-testid="qr-otp-cancel"
                >
                  {isAr ? "إلغاء" : "Cancel"}
                </button>
              </div>

              {otpStage.requiresApproval && (
                <p className="text-amber-400 text-[10px] text-center">
                  {isAr
                    ? "⚠️ سيخضع طلبك أيضاً لمراجعة الكاشير بعد التحقق."
                    : "⚠️ Your order will also be reviewed by the cashier after verification."}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
