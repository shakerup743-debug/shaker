/**
 * Mandatory Discount Dialog — opened from POS when the cashier clicks
 * the discount button. Implements the owner's strict spec:
 *
 *  • Master switch (tenant-wide) — if off, the dialog refuses to open
 *  • Discount kind is mandatory (5 options: friend / manager / employee / coupon / other)
 *  • "Coupon" branch → code field, validated against /api/coupons/validate
 *  • Manual branches → customer name + phone REQUIRED, max % capped by tenant
 *  • Persisted via /api/orders/:id/discount with full audit trail
 *
 * UI is intentionally heavy: red banner when discounts are off, red "submit"
 * button only when all required fields are valid, and a clear error toast
 * when the backend rejects (e.g. caps exceeded, coupon invalid).
 */
import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Tag, AlertTriangle, Loader2, Check, X, Percent } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Order ID, or 0 for "pre-order" mode where the dialog only validates
   *  and returns audit metadata (POS uses this — the order is created
   *  later with the audit attached via `discountAudit`). */
  orderId: number;
  orderSubtotal: number;
  onApplied: (result: {
    computedDiscount: number;
    orderTotalAfter: number;
    audit: {
      kind: string;
      reason: string;
      customerName?: string;
      customerPhone?: string;
      couponCode?: string;
      discountType: "percent" | "amount";
      discountValue: number;
    };
  }) => void;
}

type Kind = "friend" | "manager" | "employee" | "coupon" | "other";

const KINDS: { value: Kind; label: string; desc: string }[] = [
  { value: "friend",   label: "صديق المطعم",       desc: "عميل مميز أو علاقة خاصة" },
  { value: "manager",  label: "مسؤول (مدير/مالك)", desc: "خصم بناءً على موافقة الإدارة" },
  { value: "employee", label: "خصم موظفين",        desc: "للموظفين أنفسهم" },
  { value: "coupon",   label: "كوبون",             desc: "خصم عبر كود مسبق" },
  { value: "other",    label: "أخرى",              desc: "يجب كتابة السبب يدوياً" },
];

function authHeaders(): HeadersInit {
  const t = localStorage.getItem("foodoro-token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

export function DiscountDialog({ open, onClose, orderId, orderSubtotal, onApplied }: Props): JSX.Element {
  const { toast } = useToast();
  const [config, setConfig] = useState<{ enabled: boolean; maxPercent: number } | null>(null);

  const [kind, setKind] = useState<Kind | "">("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [percent, setPercent] = useState<string>("");
  const [otherReason, setOtherReason] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [couponInfo, setCouponInfo] = useState<{ value: number; type: string; discountAmount: number } | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind(""); setCustomerName(""); setCustomerPhone("");
    setPercent(""); setOtherReason(""); setCouponCode(""); setCouponInfo(null);
    void (async () => {
      const r = await fetch("/api/discounts/config", { headers: authHeaders() });
      if (r.ok) setConfig(await r.json());
    })();
  }, [open]);

  /* ── Coupon validation (real-time) ─────────────────────────────────── */
  const validateCoupon = async () => {
    if (!couponCode.trim()) return;
    setValidatingCoupon(true);
    try {
      const r = await fetch("/api/coupons/validate", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ code: couponCode.trim(), orderAmount: orderSubtotal }),
      });
      const j = await r.json() as { valid?: boolean; coupon?: { type: string; value: string | number }; discountAmount?: number; error?: string };
      if (!r.ok || !j.valid) {
        setCouponInfo(null);
        toast({ title: "كود غير صالح", description: j.error ?? "الكود غير موجود أو منتهي الصلاحية", variant: "destructive" });
        return;
      }
      setCouponInfo({
        value: Number(j.coupon!.value),
        type: j.coupon!.type,
        discountAmount: j.discountAmount ?? 0,
      });
    } finally {
      setValidatingCoupon(false);
    }
  };

  /* ── Submit ─────────────────────────────────────────────────────────── */
  const submit = async () => {
    if (!kind) { toast({ title: "اختر نوع الخصم", variant: "destructive" }); return; }

    // Build payload
    let payload: Record<string, unknown> = { discountKind: kind };
    if (kind === "coupon") {
      if (!couponInfo) {
        toast({ title: "تحقق من الكود أولاً", variant: "destructive" });
        return;
      }
      payload = {
        ...payload,
        reason: "coupon",
        couponCode: couponCode.trim(),
        discountType: couponInfo.type === "percentage" ? "percent" : "amount",
        discountValue: couponInfo.value,
      };
    } else {
      if (!customerName.trim() || !customerPhone.trim()) {
        toast({ title: "بيانات العميل ناقصة", description: "الاسم ورقم الجوال مطلوبان", variant: "destructive" });
        return;
      }
      const pct = Number(percent);
      if (!pct || pct <= 0) { toast({ title: "أدخل نسبة الخصم", variant: "destructive" }); return; }
      const cap = config?.maxPercent ?? 15;
      if (pct > cap) {
        toast({ title: `الحد الأقصى للخصم ${cap}%`, variant: "destructive" });
        return;
      }
      const reasonText = kind === "other" ? otherReason.trim() : kind;
      if (kind === "other" && !reasonText) {
        toast({ title: "اكتب سبب الخصم", variant: "destructive" });
        return;
      }
      payload = {
        ...payload,
        reason: kind,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        discountType: "percent",
        discountValue: pct,
        otherReason: reasonText,
      };
    }

    setSubmitting(true);
    try {
      // Compute discount amount client-side for the cart UX.
      const dtype = payload.discountType as "percent" | "amount";
      const dval = payload.discountValue as number;
      const computed = dtype === "percent"
        ? Math.round((orderSubtotal * dval / 100) * 100) / 100
        : Math.min(dval, orderSubtotal);

      const audit = {
        kind: kind as string,
        reason: (payload.reason as string) ?? kind,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        couponCode: couponCode.trim() || undefined,
        discountType: dtype,
        discountValue: dval,
      };

      // Pre-order mode (POS): just validate + return.
      if (orderId === 0) {
        toast({ title: "تم تجهيز الخصم", description: `${computed.toFixed(2)} ر.س — سيُحفظ مع الطلب` });
        onApplied({ computedDiscount: computed, orderTotalAfter: Math.max(0, orderSubtotal - computed), audit });
        onClose();
        return;
      }

      // Post-order mode: hit the discount endpoint.
      const r = await fetch(`/api/orders/${orderId}/discount`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const j = await r.json() as { ok?: boolean; computedDiscount?: number; orderTotalAfter?: number; error?: string; message?: string };
      if (!r.ok || !j.ok) {
        toast({ title: j.message ?? j.error ?? "فشل تطبيق الخصم", variant: "destructive" });
        return;
      }
      toast({ title: "تم تطبيق الخصم", description: `${j.computedDiscount?.toFixed(2)} ر.س` });
      onApplied({ computedDiscount: j.computedDiscount ?? 0, orderTotalAfter: j.orderTotalAfter ?? 0, audit });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render ─────────────────────────────────────────────────────────── */
  const disabledMaster = config !== null && !config.enabled;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="bg-card border-border max-w-md"
        data-testid="discount-dialog"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Tag size={16} className="text-primary" />
            تطبيق خصم على الطلب #{orderId}
          </DialogTitle>
        </DialogHeader>

        {/* Master switch warning */}
        {disabledMaster && (
          <div data-testid="discount-disabled-banner"
            className="rounded-xl bg-destructive/15 border border-destructive/40 text-destructive px-4 py-3 text-sm flex items-start gap-2">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">الخصومات معطلة حالياً من قبل الإدارة.</p>
              <p className="text-xs opacity-80 mt-1">يمكن للمالك تفعيلها من إعدادات الخصومات.</p>
            </div>
          </div>
        )}

        {!disabledMaster && (
          <div className="space-y-4">
            {/* Kind picker */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">نوع الخصم *</Label>
              <div className="grid grid-cols-1 gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    data-testid={`discount-kind-${k.value}`}
                    className={`text-start rounded-xl border px-3 py-2 transition-all ${
                      kind === k.value
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{k.label}</span>
                      {kind === k.value && <Check size={14} className="text-primary" />}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{k.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Coupon branch */}
            {kind === "coupon" && (
              <div className="space-y-2 p-3 rounded-xl bg-secondary/40 border border-border">
                <Label className="text-xs text-muted-foreground">كود الكوبون *</Label>
                <div className="flex gap-2">
                  <Input
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponInfo(null); }}
                    placeholder="مثال: SAVE15"
                    className="bg-background border-border uppercase"
                    data-testid="input-coupon-code"
                  />
                  <button
                    onClick={() => void validateCoupon()}
                    disabled={validatingCoupon || !couponCode.trim()}
                    data-testid="validate-coupon-btn"
                    className="px-3 rounded-lg bg-primary text-white text-xs font-semibold disabled:opacity-40 inline-flex items-center gap-1"
                  >
                    {validatingCoupon ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    تحقق
                  </button>
                </div>
                {couponInfo && (
                  <div className="text-xs text-emerald-400 flex items-center gap-1">
                    <Check size={12} /> الكود صحيح — خصم {couponInfo.type === "percentage" ? `${couponInfo.value}%` : `${couponInfo.value} ر.س`} ({couponInfo.discountAmount.toFixed(2)} ر.س)
                  </div>
                )}
              </div>
            )}

            {/* Manual branch */}
            {kind && kind !== "coupon" && (
              <div className="space-y-3 p-3 rounded-xl bg-secondary/40 border border-border">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">اسم العميل *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="bg-background border-border h-9"
                      data-testid="input-customer-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">رقم الجوال *</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="05XXXXXXXX"
                      className="bg-background border-border h-9"
                      data-testid="input-customer-phone"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center justify-between">
                    <span>نسبة الخصم * (الحد الأقصى {config?.maxPercent ?? 15}%)</span>
                    <span className="text-[10px] text-muted-foreground">
                      {percent && Number(percent) > 0 && `≈ ${(orderSubtotal * Number(percent) / 100).toFixed(2)} ر.س`}
                    </span>
                  </Label>
                  <div className="flex gap-2 items-center">
                    {[5, 10, 15].filter((p) => p <= (config?.maxPercent ?? 15)).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPercent(String(p))}
                        data-testid={`quick-pct-${p}`}
                        className={`flex-1 h-9 rounded-lg border text-xs font-semibold transition-colors ${
                          percent === String(p) ? "bg-primary text-white border-primary" : "border-border bg-background hover:border-primary/40"
                        }`}
                      >
                        {p}%
                      </button>
                    ))}
                    <div className="relative flex-1">
                      <Input
                        type="number" min={0} max={config?.maxPercent ?? 15} step="0.5"
                        value={percent}
                        onChange={(e) => setPercent(e.target.value)}
                        placeholder="مخصص"
                        className="bg-background border-border h-9 pe-7"
                        data-testid="input-discount-percent"
                      />
                      <Percent size={12} className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    </div>
                  </div>
                  {percent && Number(percent) > (config?.maxPercent ?? 15) && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle size={11} /> الحد الأقصى للخصم {config?.maxPercent ?? 15}%
                    </p>
                  )}
                </div>

                {kind === "other" && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">سبب الخصم *</Label>
                    <Textarea
                      value={otherReason}
                      onChange={(e) => setOtherReason(e.target.value)}
                      placeholder="اكتب سبب الخصم بالتفصيل"
                      className="bg-background border-border h-16 resize-none"
                      data-testid="input-other-reason"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={submitting}
                className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm font-semibold disabled:opacity-40"
              >
                إلغاء
              </button>
              <button
                onClick={() => void submit()}
                disabled={submitting || !kind}
                data-testid="submit-discount-btn"
                className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                تطبيق الخصم
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
