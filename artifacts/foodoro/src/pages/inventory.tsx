import { useState } from "react";
import { motion } from "framer-motion";
import { Package, Plus, AlertTriangle, Minus, FlameKindling, Trash2, BarChart2 } from "lucide-react";
import {
  useListInventory,
  useCreateInventoryItem,
  useAdjustInventory,
  getListInventoryQueryKey,
  useGetWasteAnalytics,
  useListWasteLogs,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import type { InventoryItem } from "@workspace/api-client-react";

const WASTE_REASONS: Record<string, { en: string; ar: string }> = {
  spoilage:   { en: "Spoilage",          ar: "تلف" },
  burning:    { en: "Burning",           ar: "احتراق" },
  expiry:     { en: "Expiry",            ar: "انتهاء صلاحية" },
  prep_error: { en: "Prep Error",        ar: "خطأ في التحضير" },
  theft:      { en: "Theft",             ar: "سرقة" },
  other:      { en: "Other",             ar: "أخرى" },
};

function AdjustDialog({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const adjust = useAdjustInventory();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSubmit = async (direction: 1 | -1) => {
    const val = parseFloat(amount);
    if (!val || !reason) return;
    try {
      await adjust.mutateAsync({ id: item.id, data: { adjustment: direction * val, reason } });
      queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      onClose();
      toast({ title: t("inventory.toast.adjusted") });
    } catch {
      toast({ title: t("inventory.toast.error"), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 p-3 rounded-xl bg-background">
        <Package size={16} className="text-primary" />
        <div>
          <p className="text-sm font-semibold">{item.name}</p>
          <p className="text-xs text-muted-foreground">{item.quantity} {item.unit}</p>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("inventory.adjustForm.amount")}</Label>
        <Input type="number" placeholder={t("inventory.adjustForm.amount")} className="bg-background border-border" value={amount} onChange={(e) => setAmount(e.target.value)} data-testid="input-adjust-amount" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("inventory.adjustForm.reason")}</Label>
        <Input placeholder={t("inventory.adjustForm.reasonPlaceholder")} className="bg-background border-border" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="input-adjust-reason" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          data-testid="button-adjust-decrease"
          disabled={adjust.isPending || !amount || !reason}
          onClick={() => handleSubmit(-1)}
          className="flex items-center justify-center gap-2 h-10 rounded-xl bg-destructive/20 text-destructive hover:bg-destructive/30 text-sm font-semibold disabled:opacity-40"
        >
          <Minus size={14} />
          {t("inventory.adjustForm.remove")}
        </button>
        <button
          data-testid="button-adjust-increase"
          disabled={adjust.isPending || !amount || !reason}
          onClick={() => handleSubmit(1)}
          className="flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 text-sm font-semibold disabled:opacity-40"
        >
          <Plus size={14} />
          {t("inventory.adjustForm.add")}
        </button>
      </div>
    </div>
  );
}

/* ─── Waste Analytics Tab ────────────────────────────────────────────── */
function WasteAnalyticsTab() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [range, setRange] = useState<"today" | "week" | "month">("week");

  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const from =
    range === "today"
      ? today
      : range === "week"
      ? new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0]
      : new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split("T")[0];

  const { data: analytics, isLoading } = useGetWasteAnalytics({ from, to: today });
  const { data: logs, isLoading: logsLoading } = useListWasteLogs({ from, to: today });

  const SAR = "ر.س";

  if (isLoading) {
    return (
      <div className="p-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  const byReason = analytics?.byReason ?? {};
  const topItems = analytics?.topWastedItems ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* Range selector */}
      <div className="flex gap-1 p-1 bg-card border border-border rounded-xl w-fit">
        {(["today", "week", "month"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              range === r ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {r === "today" ? (isAr ? "اليوم" : "Today") : r === "week" ? (isAr ? "أسبوع" : "Week") : (isAr ? "شهر" : "Month")}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-card border border-red-500/20">
          <p className="text-xs text-muted-foreground mb-1">{isAr ? "تكلفة الهدر" : "Total Waste Cost"}</p>
          <p className="text-xl font-bold text-red-400">{SAR} {(analytics?.totalWasteCost ?? 0).toFixed(2)}</p>
        </div>
        <div className="p-4 rounded-2xl bg-card border border-border">
          <p className="text-xs text-muted-foreground mb-1">{isAr ? "إجمالي إدخالات الهدر" : "Total Waste Entries"}</p>
          <p className="text-xl font-bold text-foreground">{analytics?.totalEntries ?? 0}</p>
        </div>
      </div>

      {/* Top wasted items */}
      {topItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isAr ? "أكثر الأصناف هدراً" : "Top Wasted Items"}
          </h3>
          <div className="space-y-2">
            {topItems.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-[10px] font-bold text-red-400">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.inventoryName}</p>
                    <p className="text-xs text-muted-foreground">{item.count} {isAr ? "مرة" : "entries"}</p>
                  </div>
                </div>
                <div className="text-end">
                  <p className="text-sm font-bold text-red-400">{item.totalWasted.toFixed(2)} {item.unit}</p>
                  {item.totalCost > 0 && (
                    <p className="text-xs text-muted-foreground">{SAR} {item.totalCost.toFixed(2)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Waste by reason */}
      {Object.keys(byReason).length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isAr ? "الهدر حسب السبب (ر.س)" : "Waste by Reason (SAR)"}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(byReason).map(([reason, cost]) => (
              <div key={reason} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                <span className="text-xs text-muted-foreground capitalize">
                  {isAr ? WASTE_REASONS[reason]?.ar : WASTE_REASONS[reason]?.en ?? reason}
                </span>
                <span className="text-xs font-bold text-red-400">{SAR} {(cost as number).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent log entries */}
      {(logs?.length ?? 0) > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {isAr ? "سجل الهدر" : "Waste Log"}
          </h3>
          <div className="space-y-1.5">
            {logsLoading ? (
              <Skeleton className="h-12 rounded-xl" />
            ) : (
              logs!.slice(0, 15).map((log) => (
                <div key={log.id} className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border">
                  <Trash2 size={13} className="text-red-400/70 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{log.inventoryName}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {log.quantity} {log.unit} · {isAr ? WASTE_REASONS[log.reason]?.ar : WASTE_REASONS[log.reason]?.en ?? log.reason}
                    </p>
                  </div>
                  <div className="text-end shrink-0">
                    {log.costEstimate && (
                      <p className="text-[11px] text-red-400">{SAR} {(log.costEstimate as number).toFixed(2)}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/50">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {!isLoading && (analytics?.totalEntries ?? 0) === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Trash2 size={32} className="mb-3 opacity-20" />
          <p className="text-sm">{isAr ? "لا توجد بيانات هدر لهذه الفترة" : "No waste data for this period"}</p>
          <p className="text-xs mt-1">{isAr ? "سجّل الهدر من صفحة المطبخ" : "Log waste from the kitchen page"}</p>
        </div>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [activeTab, setActiveTab] = useState<"stock" | "waste">("stock");
  const [createOpen, setCreateOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [form, setForm] = useState({ name: "", quantity: "", unit: "pcs", lowStockThreshold: "10", notes: "" });

  const { data: inventory, isLoading } = useListInventory(showLowOnly ? { lowStock: true } : {});
  const createItem = useCreateInventoryItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const lowStockCount = inventory?.filter((i) => i.isLowStock).length ?? 0;

  const handleCreate = async () => {
    try {
      await createItem.mutateAsync({
        data: {
          name: form.name,
          quantity: parseFloat(form.quantity),
          unit: form.unit,
          lowStockThreshold: parseFloat(form.lowStockThreshold),
          notes: form.notes || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
      setCreateOpen(false);
      setForm({ name: "", quantity: "", unit: "pcs", lowStockThreshold: "10", notes: "" });
      toast({ title: t("inventory.toast.added") });
    } catch {
      toast({ title: t("inventory.toast.error"), variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <Package size={18} className="text-primary" />
          <h1 className="text-base font-semibold">{t("inventory.title")}</h1>
          {lowStockCount > 0 && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/20 text-destructive">
              <AlertTriangle size={11} />
              {lowStockCount} {t("inventory.lowStockBadge")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {activeTab === "stock" && (
            <>
              <button
                data-testid="button-filter-low-stock"
                onClick={() => setShowLowOnly(!showLowOnly)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors
                  ${showLowOnly ? "bg-destructive/20 text-destructive" : "bg-card text-muted-foreground hover:text-foreground border border-border"}`}
              >
                <AlertTriangle size={12} />
                {t("inventory.lowStockOnly")}
              </button>
              <button
                data-testid="button-add-inventory"
                onClick={() => setCreateOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
              >
                <Plus size={15} />
                {t("inventory.addItem")}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-2 bg-card border-b border-border">
        <button
          onClick={() => setActiveTab("stock")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
            activeTab === "stock" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Package size={13} />
          {isAr ? "المخزون" : "Stock"}
        </button>
        <button
          onClick={() => setActiveTab("waste")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
            activeTab === "waste" ? "bg-red-600 text-white" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trash2 size={13} />
          {isAr ? "تحليل الهدر" : "Waste Analytics"}
        </button>
      </div>

      {activeTab === "waste" ? (
        <div className="flex-1 overflow-y-auto">
          <WasteAnalyticsTab />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-card border-b border-border">
                <tr>
                  <th className="text-start text-xs text-muted-foreground font-medium px-6 py-3">{t("inventory.table.item")}</th>
                  <th className="text-start text-xs text-muted-foreground font-medium px-4 py-3">{t("inventory.table.currentStock")}</th>
                  <th className="text-start text-xs text-muted-foreground font-medium px-4 py-3">
                    <span className="flex items-center gap-1">
                      <FlameKindling size={11} className="text-orange-400" />
                      {t("inventory.table.consumedToday")}
                    </span>
                  </th>
                  <th className="text-start text-xs text-muted-foreground font-medium px-4 py-3">{t("inventory.table.lowStockAlert")}</th>
                  <th className="text-start text-xs text-muted-foreground font-medium px-4 py-3">{t("inventory.table.status")}</th>
                  <th className="text-end text-xs text-muted-foreground font-medium px-6 py-3">{t("inventory.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {inventory?.map((item) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    data-testid={`row-inventory-${item.id}`}
                    className={`border-b border-border hover:bg-card/50 transition-colors ${item.isLowStock ? "bg-destructive/5" : ""}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.isLowStock ? "bg-destructive/20" : "bg-primary/10"}`}>
                          <Package size={14} className={item.isLowStock ? "text-destructive" : "text-primary"} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{item.name}</p>
                          {item.notes && <p className="text-xs text-muted-foreground">{item.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-sm font-bold ${item.isLowStock ? "text-destructive" : "text-foreground"}`} data-testid={`text-quantity-${item.id}`}>
                        {item.quantity} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {(item.consumedToday ?? 0) > 0 ? (
                        <span className="text-sm font-medium text-orange-400" data-testid={`text-consumed-${item.id}`}>
                          {item.consumedToday} {item.unit}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-muted-foreground">{item.lowStockThreshold} {item.unit}</span>
                    </td>
                    <td className="px-4 py-4">
                      {item.isLowStock ? (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertTriangle size={11} />
                          {t("inventory.status.lowStock")}
                        </span>
                      ) : (
                        <span className="text-xs text-emerald-400">{t("inventory.status.inStock")}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-end">
                      <button
                        data-testid={`button-adjust-${item.id}`}
                        onClick={() => setAdjustItem(item)}
                        className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium transition-colors"
                      >
                        {t("inventory.adjust")}
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle>{t("inventory.addItem")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("inventory.form.name")}</Label>
              <Input className="bg-background border-border" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("inventory.form.namePlaceholder")} data-testid="input-inventory-name" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("inventory.form.quantity")}</Label>
                <Input type="number" className="bg-background border-border" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} placeholder="0" data-testid="input-inventory-quantity" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("inventory.form.unit")}</Label>
                <Input className="bg-background border-border" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={t("inventory.form.unitPlaceholder")} data-testid="input-inventory-unit" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("inventory.form.threshold")}</Label>
              <Input type="number" className="bg-background border-border" value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} data-testid="input-inventory-threshold" />
            </div>
            <button
              data-testid="button-save-inventory"
              disabled={!form.name || !form.quantity || createItem.isPending}
              onClick={handleCreate}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm disabled:opacity-40 transition-colors"
            >
              {createItem.isPending ? t("inventory.form.adding") : t("inventory.form.save")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustItem} onOpenChange={(o) => !o && setAdjustItem(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle>{t("inventory.adjustTitle")}</DialogTitle></DialogHeader>
          {adjustItem && <AdjustDialog item={adjustItem} onClose={() => setAdjustItem(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
