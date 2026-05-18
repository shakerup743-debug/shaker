import { useState } from "react";
import { motion } from "framer-motion";
import { Tag, Plus, Percent, DollarSign, Calendar, CheckCircle, XCircle, Trash2, Copy } from "lucide-react";
import {
  useListCoupons,
  useCreateCoupon,
  useUpdateCoupon,
  useDeleteCoupon,
  getListCouponsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

type Coupon = {
  id: number; code: string; description?: string | null; type: string; value: number | string;
  minOrderAmount?: number | string | null; maxUses?: number | null; usedCount: number;
  validFrom?: string | null; validUntil?: string | null; isActive: boolean; createdAt: string;
};

function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString();
}

export default function CouponsPage() {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [form, setForm] = useState({
    code: "", description: "", type: "percentage", value: "",
    minOrderAmount: "", maxUses: "", validFrom: "", validUntil: "",
  });

  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: coupons, isLoading } = useListCoupons({ query: { refetchInterval: 60_000 } as never });
  const createCoupon = useCreateCoupon();
  const updateCoupon = useUpdateCoupon();
  const deleteCoupon = useDeleteCoupon();

  const invalidate = () => qc.invalidateQueries({ queryKey: getListCouponsQueryKey() });

  const handleCreate = async () => {
    if (!form.code || !form.value) return;
    try {
      await createCoupon.mutateAsync({
        data: {
          code: form.code.toUpperCase(),
          description: form.description || undefined,
          type: form.type as "percentage" | "fixed",
          value: parseFloat(form.value),
          minOrderAmount: form.minOrderAmount ? parseFloat(form.minOrderAmount) : undefined,
          maxUses: form.maxUses ? parseInt(form.maxUses) : undefined,
          validFrom: form.validFrom || undefined,
          validUntil: form.validUntil || undefined,
        }
      });
      invalidate();
      setAddOpen(false);
      setForm({ code: "", description: "", type: "percentage", value: "", minOrderAmount: "", maxUses: "", validFrom: "", validUntil: "" });
      toast({ title: t("coupons.toast.created") });
    } catch {
      toast({ title: t("coupons.toast.codeTaken"), variant: "destructive" });
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    await updateCoupon.mutateAsync({
      id: coupon.id,
      data: {
        code: coupon.code,
        type: coupon.type as "percentage" | "fixed",
        value: Number(coupon.value),
        isActive: !coupon.isActive,
      }
    });
    invalidate();
  };

  const handleDelete = async (id: number) => {
    await deleteCoupon.mutateAsync({ id });
    invalidate();
    setSelected(null);
    toast({ title: t("coupons.toast.deleted") });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: t("coupons.toast.copied") });
  };

  const isExpired = (c: Coupon) => c.validUntil && new Date(c.validUntil) < new Date();
  const isExhausted = (c: Coupon) => c.maxUses != null && c.usedCount >= c.maxUses;

  const stats = {
    total: coupons?.length ?? 0,
    active: coupons?.filter((c) => c.isActive && !isExpired(c) && !isExhausted(c)).length ?? 0,
    used: coupons?.reduce((s, c) => s + c.usedCount, 0) ?? 0,
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Tag size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{t("coupons.title")}</h1>
            <p className="text-xs text-muted-foreground">{stats.active} {t("coupons.active")} · {stats.used} {t("coupons.totalUsed")}</p>
          </div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90"
        >
          <Plus size={16} /> {t("coupons.add")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 px-6 py-3 shrink-0">
        {[
          { label: t("coupons.stats.total"), value: stats.total, color: "text-primary" },
          { label: t("coupons.stats.active"), value: stats.active, color: "text-green-400" },
          { label: t("coupons.stats.used"), value: stats.used, color: "text-yellow-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-xl bg-card border border-border p-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />)
        ) : !coupons?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Tag size={40} className="mb-3 opacity-30" />
            <p>{t("coupons.noCoupons")}</p>
          </div>
        ) : (
          coupons.map((c) => {
            const expired = isExpired(c);
            const exhausted = isExhausted(c);
            const valid = c.isActive && !expired && !exhausted;

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelected(c as Coupon)}
                className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-primary/50 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${valid ? "bg-green-400/10" : "bg-muted"}`}>
                    {c.type === "percentage" ? (
                      <Percent size={18} className={valid ? "text-green-400" : "text-muted-foreground"} />
                    ) : (
                      <DollarSign size={18} className={valid ? "text-green-400" : "text-muted-foreground"} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono font-bold tracking-wider text-sm">{c.code}</p>
                      <button onClick={(e) => { e.stopPropagation(); copyCode(c.code); }} className="text-muted-foreground hover:text-primary transition-colors">
                        <Copy size={12} />
                      </button>
                      {expired && <span className="text-xs bg-red-400/10 text-red-400 px-1.5 py-0.5 rounded">{t("coupons.expired")}</span>}
                      {exhausted && <span className="text-xs bg-orange-400/10 text-orange-400 px-1.5 py-0.5 rounded">{t("coupons.exhausted")}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      <span className="text-primary font-semibold">
                        {c.type === "percentage" ? `${c.value}%` : `${c.value} ر.س`} {t("coupons.off")}
                      </span>
                      <span>{c.usedCount}{c.maxUses ? `/${c.maxUses}` : ""} {t("coupons.uses")}</span>
                      {c.validUntil && <span className="flex items-center gap-1"><Calendar size={10} />{formatDate(c.validUntil)}</span>}
                    </div>
                  </div>
                </div>
                <div onClick={(e) => { e.stopPropagation(); toggleActive(c as Coupon); }} className="cursor-pointer">
                  {valid ? (
                    <CheckCircle size={20} className="text-green-400" />
                  ) : (
                    <XCircle size={20} className="text-muted-foreground" />
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("coupons.addTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("coupons.form.code")} *</Label>
              <Input value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="SUMMER20" className="bg-background border-border font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("coupons.form.description")}</Label>
              <Input value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className="bg-background border-border text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("coupons.form.type")} *</Label>
                <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                  <SelectTrigger className="bg-background border-border text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    <SelectItem value="percentage">{t("coupons.type.percentage")}</SelectItem>
                    <SelectItem value="fixed">{t("coupons.type.fixed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("coupons.form.value")} * {form.type === "percentage" ? "%" : "ر.س"}</Label>
                <Input type="number" value={form.value} onChange={(e) => setForm((p) => ({ ...p, value: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("coupons.form.minOrder")} ر.س</Label>
                <Input type="number" value={form.minOrderAmount} onChange={(e) => setForm((p) => ({ ...p, minOrderAmount: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("coupons.form.maxUses")}</Label>
                <Input type="number" value={form.maxUses} onChange={(e) => setForm((p) => ({ ...p, maxUses: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("coupons.form.validFrom")}</Label>
                <Input type="date" value={form.validFrom} onChange={(e) => setForm((p) => ({ ...p, validFrom: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("coupons.form.validUntil")}</Label>
                <Input type="date" value={form.validUntil} onChange={(e) => setForm((p) => ({ ...p, validUntil: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
            </div>
            <button onClick={handleCreate} disabled={!form.code || !form.value || createCoupon.isPending} className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {createCoupon.isPending ? "..." : t("common.save")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader><DialogTitle className="font-mono">{selected.code}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-background p-3 text-center">
                  <p className="text-xl font-bold text-primary">
                    {selected.type === "percentage" ? `${selected.value}%` : `${selected.value} ر.س`}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("coupons.discount")}</p>
                </div>
                <div className="rounded-xl bg-background p-3 text-center">
                  <p className="text-xl font-bold text-yellow-400">{selected.usedCount}</p>
                  <p className="text-xs text-muted-foreground">{t("coupons.uses")}</p>
                </div>
              </div>
              <div className="rounded-xl bg-background p-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t("coupons.form.minOrder")}</span><span>{selected.minOrderAmount ?? 0} ر.س</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("coupons.form.maxUses")}</span><span>{selected.maxUses ?? "∞"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("coupons.form.validFrom")}</span><span>{formatDate(selected.validFrom)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("coupons.form.validUntil")}</span><span>{formatDate(selected.validUntil)}</span></div>
              </div>
              <button onClick={() => handleDelete(selected.id)} className="w-full py-2 border border-red-500/50 text-red-400 rounded-xl text-sm hover:bg-red-500/10 flex items-center justify-center gap-2">
                <Trash2 size={14} /> {t("common.delete")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
