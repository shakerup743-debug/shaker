import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, AlertTriangle, Tag, RotateCcw, FileEdit, Ban,
  User, Phone, FileText, ChevronRight, Printer, Check,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/contexts/currency";
import { useAuth, useUser } from "@/lib/clerk-shim";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export type AmendmentType = "cancel" | "discount" | "return" | "edit";

export interface AmendmentOrder {
  id: number;
  orderNumber: string;
  total?: number | null;
  status: string;
}

interface Props {
  open: boolean;
  order: AmendmentOrder | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const TYPE_META: Record<AmendmentType, { icon: React.ElementType; colorCls: string; labelEn: string; labelAr: string; descEn: string; descAr: string }> = {
  cancel:   { icon: Ban,      colorCls: "border-red-500/40 bg-red-500/10 text-red-400",     labelEn: "Cancel Invoice",    labelAr: "إلغاء الفاتورة",    descEn: "Cancel the entire order",          descAr: "إلغاء الطلب بالكامل" },
  discount: { icon: Tag,      colorCls: "border-primary/40 bg-primary/10 text-primary",     labelEn: "Apply Discount",    labelAr: "إضافة خصم",          descEn: "Apply additional discount",        descAr: "إضافة خصم إضافي على الفاتورة" },
  return:   { icon: RotateCcw,colorCls: "border-amber-500/40 bg-amber-500/10 text-amber-400",labelEn: "Record Return",    labelAr: "تسجيل مرتجع",       descEn: "Process a partial or full refund", descAr: "معالجة استرداد جزئي أو كامل" },
  edit:     { icon: FileEdit, colorCls: "border-blue-500/40 bg-blue-500/10 text-blue-400",  labelEn: "Edit Invoice Data", labelAr: "تعديل بيانات الفاتورة", descEn: "Correct invoice information",     descAr: "تصحيح بيانات الفاتورة" },
};

export function AmendmentDialog({ open, order, onClose, onSuccess }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { format } = useCurrency();
  const { toast } = useToast();
  const { getToken } = useAuth();
  const { user } = useUser();

  const cashierDisplayName = user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? (isAr ? "الكاشير الحالي" : "Current Cashier");
  const cashierInitial = (cashierDisplayName.charAt(0) ?? "C").toUpperCase();

  const [step, setStep] = useState<"type" | "form" | "success">("type");
  const [selectedType, setSelectedType] = useState<AmendmentType | null>(null);
  const [reason, setReason] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountAmount, setDiscountAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [amendmentId, setAmendmentId] = useState<number | null>(null);
  const [printed, setPrinted] = useState(false);

  const reset = () => {
    setStep("type");
    setSelectedType(null);
    setReason("");
    setCustomerName("");
    setCustomerPhone("");
    setDiscountAmount("");
    setLoading(false);
    setAmendmentId(null);
    setPrinted(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const needsAmount = selectedType === "discount" || selectedType === "return";

  const canSubmit =
    selectedType !== null &&
    reason.trim().length >= 3 &&
    customerName.trim().length >= 1 &&
    (!needsAmount || (parseFloat(discountAmount) > 0));

  const handleSubmit = async () => {
    if (!order || !selectedType || !canSubmit) return;
    setLoading(true);
    try {
      const token = await getToken();
      const body: Record<string, unknown> = {
        type: selectedType,
        reason: reason.trim(),
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim() || undefined,
      };
      if (needsAmount && discountAmount) body.discountAmount = parseFloat(discountAmount);

      const res = await fetch(`${BASE}/api/orders/${order.id}/amend`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" })) as { error: string };
        throw new Error(err.error ?? "Failed");
      }
      const data = await res.json() as { id: number };
      setAmendmentId(data.id);
      setStep("success");
      onSuccess?.();
    } catch (e: unknown) {
      toast({ title: isAr ? "فشل التعديل" : "Amendment failed", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!amendmentId) return;
    try {
      const token = await getToken();
      await fetch(`${BASE}/api/amendments/${amendmentId}/print`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* silent */ }
    setPrinted(true);
    window.print();
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md bg-card border-border" dir={isAr ? "rtl" : "ltr"} aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle size={16} className="text-primary" />
              {isAr ? "تعديل الفاتورة" : "Amend Invoice"}
              <span className="text-xs font-normal text-muted-foreground">#{order.orderNumber}</span>
            </DialogTitle>
          </div>
        </DialogHeader>

        <AnimatePresence mode="wait">

          {/* ── STEP 1: Type selection ── */}
          {step === "type" && (
            <motion.div key="type" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {isAr ? "اختر نوع التعديل المطلوب" : "Select the type of amendment"}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.entries(TYPE_META) as [AmendmentType, typeof TYPE_META[AmendmentType]][]).map(([key, meta]) => {
                  const Icon = meta.icon;
                  const disabled = key === "cancel" && (order.status === "completed" || order.status === "cancelled");
                  return (
                    <button
                      key={key}
                      disabled={disabled}
                      onClick={() => { setSelectedType(key); setStep("form"); }}
                      className={`flex flex-col items-start gap-2 p-3 rounded-xl border text-start transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] ${meta.colorCls}`}
                    >
                      <Icon size={18} />
                      <div>
                        <p className="text-xs font-semibold">{isAr ? meta.labelAr : meta.labelEn}</p>
                        <p className="text-[10px] opacity-75">{isAr ? meta.descAr : meta.descEn}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Cashier identity — visible from first step */}
              <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                  {cashierInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">{isAr ? "الكاشير المسؤول (مسجّل تلقائياً)" : "Responsible Cashier (auto-identified)"}</p>
                  <p className="text-xs font-semibold text-foreground truncate">{cashierDisplayName}</p>
                </div>
                <User size={14} className="text-primary/60 shrink-0" />
              </div>

              <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground border-t border-border">
                <span>{isAr ? "إجمالي الفاتورة:" : "Invoice total:"}</span>
                <span className="font-semibold text-foreground">{format(order.total ?? 0)}</span>
              </div>
            </motion.div>
          )}

          {/* ── STEP 2: Form ── */}
          {step === "form" && selectedType && (
            <motion.div key="form" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="space-y-4">
              {/* Type header */}
              {(() => {
                const meta = TYPE_META[selectedType];
                const Icon = meta.icon;
                return (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${meta.colorCls} text-sm font-medium`}>
                    <Icon size={15} />
                    {isAr ? meta.labelAr : meta.labelEn}
                    <button onClick={() => setStep("type")} className="ms-auto text-xs opacity-60 hover:opacity-100">
                      {isAr ? "تغيير" : "Change"}
                    </button>
                  </div>
                );
              })()}

              {/* Cashier identity — read-only in form step */}
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20">
                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs shrink-0">
                  {cashierInitial}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground">{isAr ? "الكاشير المنفّذ (تلقائي)" : "Executing Cashier (auto)"}</p>
                  <p className="text-xs font-semibold text-foreground truncate">{cashierDisplayName}</p>
                </div>
              </div>

              {/* Discount/Return amount */}
              {needsAmount && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Tag size={11} />
                    {selectedType === "return"
                      ? (isAr ? "مبلغ المرتجع *" : "Return Amount *")
                      : (isAr ? "مبلغ الخصم *" : "Discount Amount *")}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="bg-background border-border"
                    value={discountAmount}
                    onChange={e => setDiscountAmount(e.target.value)}
                    placeholder="0.00"
                    dir="ltr"
                  />
                </div>
              )}

              {/* Reason */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <FileText size={11} />
                  {isAr ? "سبب التعديل *" : "Reason *"}
                </Label>
                <Input
                  className="bg-background border-border"
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={isAr ? "اذكر السبب بوضوح (إلزامي)" : "State reason clearly (required)"}
                />
              </div>

              {/* Customer Name */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <User size={11} />
                  {isAr ? "اسم العميل *" : "Customer Name *"}
                </Label>
                <Input
                  className="bg-background border-border"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder={isAr ? "اسم العميل" : "Customer name"}
                />
              </div>

              {/* Customer Phone */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone size={11} />
                  {isAr ? "رقم العميل" : "Customer Phone"}
                  <span className="text-muted-foreground/50">{isAr ? "(اختياري)" : "(optional)"}</span>
                </Label>
                <Input
                  type="tel"
                  className="bg-background border-border"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  placeholder="+966 5X XXX XXXX"
                  dir="ltr"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setStep("type")}
                  className="flex-1 h-10 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isAr ? "رجوع" : "Back"}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit || loading}
                  className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <span className="text-xs">{isAr ? "جارٍ التنفيذ..." : "Processing..."}</span>
                  ) : (
                    <>
                      {isAr ? "تنفيذ التعديل" : "Apply Amendment"}
                      <ChevronRight size={14} />
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: Success + Print ── */}
          {step === "success" && selectedType && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center gap-5 py-4">
              <div className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <Check size={32} className="text-emerald-400" />
              </div>
              <div className="text-center space-y-1">
                <p className="font-semibold text-foreground">
                  {isAr ? "تم تنفيذ التعديل بنجاح" : "Amendment Applied Successfully"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isAr
                    ? `تم تسجيل ${TYPE_META[selectedType].labelAr} على الفاتورة #${order.orderNumber}`
                    : `${TYPE_META[selectedType].labelEn} recorded for invoice #${order.orderNumber}`}
                </p>
              </div>

              {/* Summary card */}
              <div className="w-full space-y-2 p-4 rounded-xl bg-background border border-border text-xs">
                <div className="flex justify-between text-muted-foreground">
                  <span>{isAr ? "النوع" : "Type"}</span>
                  <span className="font-medium text-foreground">{isAr ? TYPE_META[selectedType].labelAr : TYPE_META[selectedType].labelEn}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{isAr ? "السبب" : "Reason"}</span>
                  <span className="font-medium text-foreground truncate max-w-[60%] text-end">{reason}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{isAr ? "الكاشير" : "Cashier"}</span>
                  <span className="font-semibold text-primary">{cashierDisplayName}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>{isAr ? "العميل" : "Customer"}</span>
                  <span className="font-medium text-foreground">{customerName}</span>
                </div>
                {customerPhone && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{isAr ? "الهاتف" : "Phone"}</span>
                    <span className="font-medium text-foreground" dir="ltr">{customerPhone}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted-foreground border-t border-border pt-2">
                  <span>{isAr ? "الحالة" : "Status"}</span>
                  <span className="font-semibold text-emerald-400 flex items-center gap-1">
                    <Check size={10} /> {isAr ? "تم التسجيل" : "Logged"}
                    {printed && <><Printer size={10} className="ms-1" />{isAr ? "· تمت الطباعة" : "· Printed"}</>}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 w-full">
                <button
                  onClick={handlePrint}
                  disabled={printed}
                  className="flex-1 h-10 rounded-xl border border-border text-sm font-medium flex items-center justify-center gap-2 hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Printer size={14} />
                  {printed ? (isAr ? "تمت الطباعة ✓" : "Printed ✓") : (isAr ? "طباعة الإيصال" : "Print Receipt")}
                </button>
                <button
                  onClick={handleClose}
                  className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  {isAr ? "إغلاق" : "Done"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
