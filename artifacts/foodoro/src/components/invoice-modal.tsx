import { useRef, useEffect, useState } from "react";
import { X, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";

interface InvoiceItem {
  name: string;
  nameAr?: string;
  quantity: number;
  unitPrice: number;
  itemNote?: string;
  selectedOptions?: Array<{ groupName: string; itemName: string; priceMode?: "delta" | "full"; priceDelta: number; price?: number }>;
}

export interface InvoiceData {
  orderId: number;
  orderType: "dine_in" | "takeaway" | "delivery";
  tableNumber?: number | null;
  items: InvoiceItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: string;
  createdAt?: string;
  generalNote?: string;
  priority?: "low" | "medium" | "high";
  isSpecial?: boolean;
}

interface Props {
  data: InvoiceData;
  onClose: () => void;
}

interface InvoiceSettings {
  logoUrl?: string | null;
  restaurantName?: string | null;
  paperSize?: string;
  invoiceType?: string;
  welcomeMessage?: string | null;
  showTax?: boolean;
  showLogo?: boolean;
  footerText?: string | null;
}

const ORDER_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
  dine_in: { en: "Dine In", ar: "داخل المطعم" },
  takeaway: { en: "Takeaway", ar: "طلب خارجي" },
  delivery: { en: "Delivery", ar: "توصيل" },
};

const PAYMENT_LABELS: Record<string, { en: string; ar: string }> = {
  cash: { en: "Cash", ar: "نقداً" },
  card: { en: "Card", ar: "بطاقة" },
  mixed: { en: "Mixed", ar: "مختلط" },
};

function fmt(n: number) { return n.toFixed(2); }

/** Paper-size → CSS width + @page rule. Thermal sizes have no margins. */
function paperCss(size: string): { bodyWidth: string; pageRule: string; basePadding: string } {
  switch (size) {
    case "58mm": return { bodyWidth: "58mm",  pageRule: "@page { size: 58mm auto; margin: 0; }",  basePadding: "4mm" };
    case "A5":   return { bodyWidth: "148mm", pageRule: "@page { size: A5; margin: 10mm; }",       basePadding: "0" };
    case "A4":   return { bodyWidth: "210mm", pageRule: "@page { size: A4; margin: 15mm; }",       basePadding: "0" };
    case "80mm":
    default:     return { bodyWidth: "80mm",  pageRule: "@page { size: 80mm auto; margin: 0; }",  basePadding: "5mm" };
  }
}

export function InvoiceModal({ data, onClose }: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const printRef = useRef<HTMLDivElement>(null);

  // ── Fetch tenant invoice customization (logo, paper size, welcome, footer, QR)
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("foodoro-token");
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
    void (async () => {
      try {
        const [sRes, qRes] = await Promise.all([
          fetch("/api/invoice-settings", { headers }),
          fetch("/api/invoice-settings/qr", { headers }),
        ]);
        if (sRes.ok) {
          const sJson = (await sRes.json()) as { settings: InvoiceSettings | null };
          setSettings(sJson.settings);
        }
        if (qRes.ok) {
          const qJson = (await qRes.json()) as { dataUrl?: string };
          setQrDataUrl(qJson.dataUrl ?? null);
        }
      } catch { /* offline / new tenant → fall back to defaults */ }
    })();
  }, []);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open("", "_blank", "width=400,height=900");
    if (!w) return;
    const paperSize = settings?.paperSize ?? "80mm";
    const { bodyWidth, pageRule, basePadding } = paperCss(paperSize);
    const isThermal = paperSize === "58mm" || paperSize === "80mm";
    const fontSize = paperSize === "58mm" ? 11 : paperSize === "80mm" ? 13 : 14;

    w.document.write(`<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}" lang="${isAr ? "ar" : "en"}">
<head>
<meta charset="UTF-8">
<title>Invoice #${data.orderId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: ${isThermal ? "'Courier New', monospace" : "Arial, sans-serif"};
         font-size: ${fontSize}px; color: #111; background: #fff;
         padding: ${basePadding}; width: ${bodyWidth}; margin: 0 auto; }
  .logo-img { display: block; margin: 0 auto 6px auto; max-width: 60%; max-height: ${isThermal ? "70px" : "100px"}; object-fit: contain; }
  .restaurant-name { font-size: ${fontSize + 5}px; font-weight: 900; text-align: center; letter-spacing: 1px; margin-bottom: 4px; }
  .welcome { text-align: center; font-size: ${fontSize - 1}px; color: #333; margin-bottom: 6px; padding: 0 4px; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #999; margin: 6px 0; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0; }
  .bold { font-weight: 700; }
  .total-row { font-size: ${fontSize + 3}px; font-weight: 900; padding: 4px 0; border-top: 2px solid #000; border-bottom: 2px solid #000; }
  .meta { color: #555; font-size: ${fontSize - 2}px; }
  .qr-wrap { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 10px 0 6px 0; }
  .qr-wrap img { width: ${isThermal ? "70px" : "100px"}; height: ${isThermal ? "70px" : "100px"}; }
  .qr-caption { font-size: ${fontSize - 3}px; color: #444; }
  .footer { text-align: center; font-size: ${fontSize - 2}px; color: #444; margin-top: 8px; padding: 4px 8px; line-height: 1.4; }
  .note-general { background: #fff8e7; border: 1px solid #f0c040; padding: 6px 8px; margin: 6px 0; font-size: ${fontSize - 2}px; border-radius: 4px; }
  .note-item { font-size: ${fontSize - 3}px; color: #b45309; margin-top: 2px; padding-inline-start: 8px; }
  .urgent { background: #fee2e2; border: 1px solid #f87171; color: #b91c1c; }
  ${pageRule}
  @media print {
    body { padding: ${basePadding}; }
  }
</style>
</head>
<body>
${content.innerHTML}
</body>
</html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 400);
  };

  const now = data.createdAt ? new Date(data.createdAt) : new Date();
  const dateStr = now.toLocaleDateString(isAr ? "ar-SA" : "en-US");
  const timeStr = now.toLocaleTimeString(isAr ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" });
  const orderTypeLabel = ORDER_TYPE_LABELS[data.orderType]?.[isAr ? "ar" : "en"] ?? data.orderType;
  const paymentLabel = PAYMENT_LABELS[data.paymentMethod]?.[isAr ? "ar" : "en"] ?? data.paymentMethod;
  const currency = isAr ? "ر.س" : "SAR";

  const restaurantName = settings?.restaurantName?.trim() || "FOODPRO";
  const welcome = settings?.welcomeMessage?.trim() ?? "";
  const footer = settings?.footerText?.trim() ?? (isAr ? "شكراً لزيارتكم • Powered by FOODPRO" : "Thank you for your visit • Powered by FOODPRO");
  const showLogo = settings?.showLogo !== false;
  const showTax = settings?.showTax !== false;
  const logoUrl = showLogo ? settings?.logoUrl ?? "" : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">
            {isAr ? `فاتورة رقم #${data.orderId}` : `Invoice #${data.orderId}`}
            <span className="text-[10px] text-muted-foreground ms-2">{settings?.paperSize ?? "80mm"}</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              data-testid="invoice-print-btn"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-primary text-white rounded-lg px-3 py-1.5 text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Printer size={13} />
              {isAr ? "طباعة" : "Print"}
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-white">
          {/* The on-screen preview mirrors EXACTLY what gets printed. The
              ref captures innerHTML and dumps it into a print window with
              identical CSS — so what-you-see-is-what-you-print. */}
          <div ref={printRef} dir={isAr ? "rtl" : "ltr"} className="text-black" style={{ fontFamily: "'Courier New', monospace", fontSize: 13 }}>
            {/* Logo */}
            {logoUrl && (
              <img src={logoUrl} alt="logo" className="logo-img"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            )}
            <div className="restaurant-name">{restaurantName}</div>
            {welcome && <div className="welcome">{welcome}</div>}
            <div className="divider" />

            <div className="row meta">
              <span>{isAr ? "رقم الطلب" : "Order #"}</span>
              <span className="bold">#{data.orderId}</span>
            </div>
            <div className="row meta">
              <span>{isAr ? "النوع" : "Type"}</span>
              <span>{orderTypeLabel}{data.tableNumber ? ` — ${isAr ? "طاولة" : "Table"} ${data.tableNumber}` : ""}</span>
            </div>
            <div className="row meta">
              <span>{isAr ? "التاريخ" : "Date"}</span>
              <span>{dateStr} {timeStr}</span>
            </div>
            <div className="row meta">
              <span>{isAr ? "الدفع" : "Payment"}</span>
              <span>{paymentLabel}</span>
            </div>

            {data.isSpecial && (
              <div className="note-general urgent" style={{ marginTop: 6 }}>
                ⚠ {isAr ? "طلب عاجل — انتبه!" : "URGENT ORDER — Pay attention!"}
              </div>
            )}
            {data.generalNote && !data.isSpecial && (
              <div className="note-general">📝 {data.generalNote}</div>
            )}

            <div className="divider" />

            <div className="row meta bold">
              <span style={{ flex: 1 }}>{isAr ? "الصنف" : "Item"}</span>
              <span style={{ width: 32, textAlign: "center" }}>{isAr ? "كمية" : "Qty"}</span>
              <span style={{ width: 72, textAlign: isAr ? "left" : "right" }}>{isAr ? "السعر" : "Price"}</span>
            </div>

            {data.items.map((item, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <div className="row">
                  <span style={{ flex: 1 }}>{isAr && item.nameAr ? item.nameAr : item.name}</span>
                  <span style={{ width: 32, textAlign: "center" }}>{item.quantity}</span>
                  <span style={{ width: 72, textAlign: isAr ? "left" : "right" }}>{fmt(item.unitPrice * item.quantity)}</span>
                </div>
                {item.selectedOptions && item.selectedOptions.length > 0 && (
                  <div className="note-item" style={{ color: "#666" }}>
                    {item.selectedOptions.map((s, k) => {
                      const isFull = s.priceMode === "full";
                      const valueLabel = isFull
                        ? ` (= ${fmt(s.price ?? 0)})`
                        : s.priceDelta
                          ? ` (+${fmt(s.priceDelta)})`
                          : "";
                      return (
                        <span key={k}>↳ {s.groupName}: {s.itemName}{valueLabel}{k < item.selectedOptions!.length - 1 ? " · " : ""}</span>
                      );
                    })}
                  </div>
                )}
                {item.itemNote && <div className="note-item">↳ {item.itemNote}</div>}
              </div>
            ))}

            <div className="divider" />

            <div className="row">
              <span className="meta">{isAr ? "المجموع الفرعي" : "Subtotal"}</span>
              <span className="meta">{currency} {fmt(data.subtotal)}</span>
            </div>
            {data.discount > 0 && (
              <div className="row">
                <span className="meta">{isAr ? "الخصم" : "Discount"}</span>
                <span className="meta" style={{ color: "#ef4444" }}>− {currency} {fmt(data.discount)}</span>
              </div>
            )}
            {showTax && (
              <div className="row">
                <span className="meta">{isAr ? "ضريبة القيمة المضافة (15%)" : "VAT (15%)"}</span>
                <span className="meta">{currency} {fmt(data.tax)}</span>
              </div>
            )}

            <div className="row total-row" style={{ marginTop: 6 }}>
              <span>{isAr ? "الإجمالي" : "Total"}</span>
              <span>{currency} {fmt(data.total)}</span>
            </div>

            {/* QR Code (auto-generated from /api/invoice-settings/qr) */}
            {qrDataUrl && (
              <div className="qr-wrap">
                <img src={qrDataUrl} alt="qr" />
                <div className="qr-caption">{isAr ? "امسح للقائمة الرقمية" : "Scan for digital menu"}</div>
              </div>
            )}

            <div className="divider" />
            <div className="footer">{footer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
