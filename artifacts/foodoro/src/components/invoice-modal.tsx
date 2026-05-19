import { useRef } from "react";
import { X, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";

interface InvoiceItem {
  name: string;
  nameAr?: string;
  quantity: number;
  unitPrice: number;
  itemNote?: string;
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

function fmt(n: number) {
  return n.toFixed(2);
}

export function InvoiceModal({ data, onClose }: Props) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const w = window.open("", "_blank", "width=400,height=750");
    if (!w) return;
    w.document.write(`<!DOCTYPE html>
<html dir="${isAr ? "rtl" : "ltr"}">
<head>
<meta charset="UTF-8">
<title>Invoice #${data.orderId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', monospace; font-size: 13px; color: #111; background: #fff; padding: 16px; max-width: 320px; }
  .logo { font-size: 22px; font-weight: 900; text-align: center; letter-spacing: 2px; }
  .center { text-align: center; }
  .divider { border-top: 1px dashed #999; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; align-items: flex-start; margin: 3px 0; }
  .row .name { flex: 1; }
  .row .qty { width: 32px; text-align: center; }
  .row .price { width: 72px; text-align: end; }
  .bold { font-weight: 700; }
  .total-row { font-size: 15px; font-weight: 900; }
  .meta { color: #555; font-size: 11px; }
  .footer { text-align: center; font-size: 11px; color: #777; margin-top: 12px; }
  .note-general { background: #fff8e7; border: 1px solid #f0c040; padding: 6px 8px; margin: 6px 0; font-size: 11px; border-radius: 4px; }
  .note-item { font-size: 10px; color: #b45309; margin-top: 2px; padding-inline-start: 8px; }
  .urgent { background: #fee2e2; border: 1px solid #f87171; color: #b91c1c; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
${content.innerHTML}
</body>
</html>`);
    w.document.close();
    w.focus();
    setTimeout(() => { w.print(); w.close(); }, 300);
  };

  const now = data.createdAt ? new Date(data.createdAt) : new Date();
  const dateStr = now.toLocaleDateString(isAr ? "ar-SA" : "en-US");
  const timeStr = now.toLocaleTimeString(isAr ? "ar-SA" : "en-US", { hour: "2-digit", minute: "2-digit" });
  const orderTypeLabel = ORDER_TYPE_LABELS[data.orderType]?.[isAr ? "ar" : "en"] ?? data.orderType;
  const paymentLabel = PAYMENT_LABELS[data.paymentMethod]?.[isAr ? "ar" : "en"] ?? data.paymentMethod;
  const currency = isAr ? "ر.س" : "SAR";
  const baseAmount = data.total - data.discount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="font-bold text-foreground text-sm">
            {isAr ? `فاتورة رقم #${data.orderId}` : `Invoice #${data.orderId}`}
          </h2>
          <div className="flex items-center gap-2">
            <button
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

        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef} dir={isAr ? "rtl" : "ltr"}>
            <div className="logo center" style={{ marginBottom: 8 }}>FOODPRO</div>
            <div className="center meta" style={{ marginBottom: 4 }}>
              {isAr ? "نظام نقطة البيع" : "Point of Sale System"}
            </div>
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

            {/* Special / urgent note banner */}
            {data.isSpecial && (
              <div className={`note-general urgent`} style={{ marginTop: 6 }}>
                ⚠️ {isAr ? "طلب عاجل — انتبه!" : "URGENT ORDER — Pay attention!"}
              </div>
            )}

            {/* General note */}
            {data.generalNote && !data.isSpecial && (
              <div className="note-general">
                📝 {data.generalNote}
              </div>
            )}

            <div className="divider" />

            <div className="row meta bold" style={{ marginBottom: 4 }}>
              <span style={{ flex: 1 }}>{isAr ? "الصنف" : "Item"}</span>
              <span style={{ width: 32, textAlign: "center" }}>{isAr ? "كمية" : "Qty"}</span>
              <span style={{ width: 72, textAlign: "end" }}>{isAr ? "السعر" : "Price"}</span>
            </div>

            {data.items.map((item, i) => (
              <div key={i} style={{ marginBottom: 4 }}>
                <div className="row">
                  <span style={{ flex: 1 }}>
                    {isAr && item.nameAr ? item.nameAr : item.name}
                  </span>
                  <span style={{ width: 32, textAlign: "center" }}>{item.quantity}</span>
                  <span style={{ width: 72, textAlign: "end" }}>
                    {fmt(item.unitPrice * item.quantity)}
                  </span>
                </div>
                {item.itemNote && (
                  <div className="note-item">↳ {item.itemNote}</div>
                )}
              </div>
            ))}

            <div className="divider" />

            {/* TAX INCLUSIVE display */}
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
            <div className="row">
              <span className="meta">{isAr ? "منها ضريبة القيمة المضافة (15%)" : "Incl. VAT (15%)"}</span>
              <span className="meta">{currency} {fmt(data.tax)}</span>
            </div>

            <div className="divider" />

            <div className="row total-row">
              <span>{isAr ? "الإجمالي المستحق" : "Total Due"}</span>
              <span>{currency} {fmt(data.total)}</span>
            </div>

            <div className="divider" />
            <div className="footer">
              {isAr ? "شكراً لزيارتكم • Powered by FOODPRO" : "Thank you for your visit • Powered by FOODPRO"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
