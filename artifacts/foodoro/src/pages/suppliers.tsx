import { useState } from "react";
import { motion } from "framer-motion";
import { Truck, Plus, Phone, Mail, MapPin, Clock, Star, Package, ChevronRight, Trash2, ShoppingBag } from "lucide-react";
import {
  useListSuppliers,
  useCreateSupplier,
  useUpdateSupplier,
  useDeleteSupplier,
  useListSupplierOrders,
  useCreateSupplierOrder,
  useUpdateSupplierOrderStatus,
  getListSuppliersQueryKey,
  getListSupplierOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400 bg-yellow-400/10",
  confirmed: "text-blue-400 bg-blue-400/10",
  in_transit: "text-purple-400 bg-purple-400/10",
  delivered: "text-green-400 bg-green-400/10",
  cancelled: "text-red-400 bg-red-400/10",
};

type Supplier = { id: number; name: string; contactName?: string | null; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null; leadTimeDays: number; paymentTerms: string; rating?: number | null; isActive: boolean };

export default function SuppliersPage() {
  const { t } = useTranslation();
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Supplier | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [tab, setTab] = useState<"suppliers" | "orders">("suppliers");

  const [form, setForm] = useState({ name: "", contactName: "", phone: "", email: "", address: "", notes: "", leadTimeDays: "1", paymentTerms: "cash", rating: "5" });
  const [orderForm, setOrderForm] = useState({ supplierId: "", itemName: "", quantity: "1", unit: "pcs", unitCost: "0", expectedDelivery: "", notes: "" });

  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: suppliers, isLoading } = useListSuppliers({ query: { refetchInterval: 60_000 } as never });
  const { data: orders } = useListSupplierOrders({} as never);
  const createSupplier = useCreateSupplier();
  const deleteSupplier = useDeleteSupplier();
  const createOrder = useCreateSupplierOrder();
  const updateOrderStatus = useUpdateSupplierOrderStatus();

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: getListSuppliersQueryKey() });
    qc.invalidateQueries({ queryKey: getListSupplierOrdersQueryKey({}) });
  };

  const handleCreate = async () => {
    if (!form.name) return;
    try {
      await createSupplier.mutateAsync({ data: { name: form.name, contactName: form.contactName || undefined, phone: form.phone || undefined, email: form.email || undefined, address: form.address || undefined, notes: form.notes || undefined, leadTimeDays: parseInt(form.leadTimeDays), paymentTerms: form.paymentTerms, rating: parseFloat(form.rating) } });
      invalidateAll();
      setAddOpen(false);
      setForm({ name: "", contactName: "", phone: "", email: "", address: "", notes: "", leadTimeDays: "1", paymentTerms: "cash", rating: "5" });
      toast({ title: t("suppliers.toast.created") });
    } catch {
      toast({ title: t("suppliers.toast.error"), variant: "destructive" });
    }
  };

  const handleCreateOrder = async () => {
    if (!orderForm.supplierId || !orderForm.itemName) return;
    try {
      await createOrder.mutateAsync({
        data: {
          supplierId: parseInt(orderForm.supplierId),
          notes: orderForm.notes || undefined,
          expectedDelivery: orderForm.expectedDelivery ? new Date(orderForm.expectedDelivery).toISOString() : undefined,
          items: [{ itemName: orderForm.itemName, quantity: parseFloat(orderForm.quantity), unit: orderForm.unit, unitCost: parseFloat(orderForm.unitCost) }],
        }
      });
      invalidateAll();
      setOrderOpen(false);
      toast({ title: t("suppliers.toast.orderCreated") });
    } catch {
      toast({ title: t("suppliers.toast.error"), variant: "destructive" });
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    await updateOrderStatus.mutateAsync({ id, data: { status } });
    invalidateAll();
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Truck size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{t("suppliers.title")}</h1>
            <p className="text-xs text-muted-foreground">{suppliers?.length ?? 0} {t("suppliers.count")}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOrderOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-card border border-border text-sm font-semibold rounded-xl hover:border-primary/50"
          >
            <ShoppingBag size={16} /> {t("suppliers.newOrder")}
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90"
          >
            <Plus size={16} /> {t("suppliers.add")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-6 shrink-0">
        {(["suppliers", "orders"] as const).map((tb) => (
          <button
            key={tb}
            onClick={() => setTab(tb)}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === tb ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t(`suppliers.tabs.${tb}`)}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2">
        {tab === "suppliers" ? (
          isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 rounded-xl bg-card animate-pulse" />)
          ) : !suppliers?.length ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Truck size={40} className="mb-3 opacity-30" />
              <p>{t("suppliers.noSuppliers")}</p>
            </div>
          ) : (
            suppliers.map((s) => (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setSelected(s as Supplier)}
                className="flex items-start justify-between p-4 rounded-xl bg-card border border-border hover:border-primary/50 cursor-pointer transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Truck size={18} className="text-primary" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{s.name}</p>
                      {!s.isActive && <span className="text-xs bg-red-400/10 text-red-400 px-2 py-0.5 rounded-full">{t("common.inactive")}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {s.phone && <span className="flex items-center gap-1"><Phone size={10} />{s.phone}</span>}
                      {s.email && <span className="flex items-center gap-1"><Mail size={10} />{s.email}</span>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock size={10} />{s.leadTimeDays}d {t("suppliers.leadTime")}</span>
                      <span className="flex items-center gap-1"><Star size={10} className="text-yellow-400" />{s.rating ?? "—"}</span>
                      <span className="bg-card border border-border px-2 py-0.5 rounded-full">{s.paymentTerms}</span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={16} className="text-muted-foreground mt-1" />
              </motion.div>
            ))
          )
        ) : (
          !orders?.length ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <Package size={40} className="mb-3 opacity-30" />
              <p>{t("suppliers.noOrders")}</p>
            </div>
          ) : (
            orders.map((o) => (
              <div key={o.id} className="p-4 rounded-xl bg-card border border-border space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{t("suppliers.order")} #{o.id}</p>
                    <p className="text-xs text-muted-foreground">{o.supplierName}</p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_COLORS[o.status] ?? "text-muted-foreground bg-muted"}`}>
                    {t(`suppliers.status.${o.status}`, { defaultValue: o.status })}
                  </span>
                </div>
                {o.expectedDelivery && (
                  <p className="text-xs text-muted-foreground">{t("suppliers.expectedDelivery")}: {new Date(o.expectedDelivery).toLocaleDateString()}</p>
                )}
                <div className="flex gap-2 flex-wrap">
                  {["confirmed", "in_transit", "delivered", "cancelled"].map((st) => (
                    <button
                      key={st}
                      onClick={() => handleStatusChange(o.id, st)}
                      disabled={o.status === st}
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${o.status === st ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/50"} disabled:opacity-70`}
                    >
                      {t(`suppliers.status.${st}`, { defaultValue: st })}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )
        )}
      </div>

      {/* Add Supplier Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("suppliers.addTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              { key: "name", label: t("suppliers.form.name"), required: true },
              { key: "contactName", label: t("suppliers.form.contact") },
              { key: "phone", label: t("suppliers.form.phone"), type: "tel" },
              { key: "email", label: t("suppliers.form.email"), type: "email" },
              { key: "address", label: t("suppliers.form.address") },
            ].map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{f.label}{f.required ? " *" : ""}</Label>
                <Input type={f.type} value={form[f.key as keyof typeof form]} onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("suppliers.form.leadTime")}</Label>
                <Input type="number" value={form.leadTimeDays} onChange={(e) => setForm((p) => ({ ...p, leadTimeDays: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("suppliers.form.rating")}</Label>
                <Input type="number" min="1" max="5" step="0.1" value={form.rating} onChange={(e) => setForm((p) => ({ ...p, rating: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
            </div>
            <button onClick={handleCreate} disabled={!form.name || createSupplier.isPending} className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {createSupplier.isPending ? "..." : t("common.save")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Order Dialog */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader><DialogTitle>{t("suppliers.newOrder")}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("suppliers.form.supplier")} *</Label>
              <Select value={orderForm.supplierId} onValueChange={(v) => setOrderForm((p) => ({ ...p, supplierId: v }))}>
                <SelectTrigger className="bg-background border-border text-sm"><SelectValue placeholder={t("suppliers.selectSupplier")} /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {suppliers?.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {[
              { key: "itemName", label: t("suppliers.form.itemName"), required: true },
              { key: "quantity", label: t("suppliers.form.quantity"), type: "number" },
              { key: "unit", label: t("suppliers.form.unit") },
              { key: "unitCost", label: t("suppliers.form.unitCost"), type: "number" },
              { key: "expectedDelivery", label: t("suppliers.form.expectedDelivery"), type: "date" },
            ].map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{f.label}{f.required ? " *" : ""}</Label>
                <Input type={f.type} value={orderForm[f.key as keyof typeof orderForm]} onChange={(e) => setOrderForm((p) => ({ ...p, [f.key]: e.target.value }))} className="bg-background border-border text-sm" />
              </div>
            ))}
            <button onClick={handleCreateOrder} disabled={!orderForm.supplierId || !orderForm.itemName || createOrder.isPending} className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {createOrder.isPending ? "..." : t("suppliers.createOrder")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
