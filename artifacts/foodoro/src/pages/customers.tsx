import { useState } from "react";
import { motion } from "framer-motion";
import {
  Users, Plus, Search, Star, Phone, Mail, StickyNote, Award, TrendingUp, X, ChevronRight, Trash2,
} from "lucide-react";
import {
  useListCustomers,
  useCreateCustomer,
  useUpdateCustomer,
  useDeleteCustomer,
  useGetCustomerStats,
  useAddCustomerNote,
  useAdjustLoyaltyPoints,
  getListCustomersQueryKey,
  getGetCustomerStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

const TIER_CONFIG = {
  bronze:   { label: "Bronze",   color: "text-orange-400",  bg: "bg-orange-400/10",   pts: "0–499" },
  silver:   { label: "Silver",   color: "text-slate-300",   bg: "bg-slate-300/10",    pts: "500–1499" },
  gold:     { label: "Gold",     color: "text-yellow-400",  bg: "bg-yellow-400/10",   pts: "1500–2999" },
  platinum: { label: "Platinum", color: "text-cyan-400",    bg: "bg-cyan-400/10",     pts: "3000+" },
};

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_CONFIG[tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG.bronze;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function formatSAR(n: number | string) {
  return `${Number(n).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`;
}

type Customer = { id: number; name: string; phone: string; email?: string | null; notes?: string | null; loyaltyPoints: number; loyaltyTier: string; totalOrders: number; totalSpent: number | string; isActive: boolean; createdAt: string };

export default function CustomersPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [noteText, setNoteText] = useState("");
  const [loyaltyDelta, setLoyaltyDelta] = useState("");
  const [loyaltyReason, setLoyaltyReason] = useState("");

  // form state
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });

  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: customers, isLoading } = useListCustomers(
    { search: search || undefined, tier: tierFilter === "all" ? undefined : tierFilter },
    { query: { refetchInterval: 30_000 } as never }
  );
  const { data: stats } = useGetCustomerStats();
  const createCustomer = useCreateCustomer();
  const updateCustomer = useUpdateCustomer();
  const deleteCustomer = useDeleteCustomer();
  const addNote = useAddCustomerNote();
  const adjustPoints = useAdjustLoyaltyPoints();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: getListCustomersQueryKey() });
    qc.invalidateQueries({ queryKey: getGetCustomerStatsQueryKey() });
  };

  const handleCreate = async () => {
    if (!form.name || !form.phone) return;
    try {
      await createCustomer.mutateAsync({ data: form });
      invalidate();
      setAddOpen(false);
      setForm({ name: "", phone: "", email: "", notes: "" });
      toast({ title: t("customers.toast.created") });
    } catch {
      toast({ title: t("customers.toast.error"), variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    await deleteCustomer.mutateAsync({ id });
    invalidate();
    setSelected(null);
    toast({ title: t("customers.toast.deleted") });
  };

  const handleAddNote = async () => {
    if (!selected || !noteText) return;
    await addNote.mutateAsync({ id: selected.id, data: { note: noteText } });
    setNoteText("");
    toast({ title: t("customers.toast.noteAdded") });
  };

  const handleAdjustPoints = async (type: "earn" | "redeem") => {
    if (!selected || !loyaltyDelta) return;
    await adjustPoints.mutateAsync({ id: selected.id, data: { points: parseInt(loyaltyDelta), type, reason: loyaltyReason || undefined } });
    invalidate();
    setLoyaltyDelta("");
    setLoyaltyReason("");
    toast({ title: t("customers.toast.pointsUpdated") });
  };

  const statCards = [
    { label: t("customers.stats.total"), value: stats?.total ?? 0, color: "text-primary" },
    { label: t("customers.stats.silver"), value: stats?.silver ?? 0, color: "text-slate-300" },
    { label: t("customers.stats.gold"), value: stats?.gold ?? 0, color: "text-yellow-400" },
    { label: t("customers.stats.platinum"), value: stats?.platinum ?? 0, color: "text-cyan-400" },
  ];

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{t("customers.title")}</h1>
            <p className="text-xs text-muted-foreground">{t("customers.subtitle")}</p>
          </div>
        </div>
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90"
        >
          <Plus size={16} /> {t("customers.add")}
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 py-3 shrink-0">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl bg-card border border-border p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 px-6 py-2 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("customers.search")}
            className="ps-9 bg-background border-border h-9 text-sm"
          />
        </div>
        <Select value={tierFilter} onValueChange={setTierFilter}>
          <SelectTrigger className="w-36 h-9 bg-background border-border text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="all">{t("customers.allTiers")}</SelectItem>
            {Object.entries(TIER_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-2 space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-card animate-pulse" />
          ))
        ) : !customers?.length ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Users size={40} className="mb-3 opacity-30" />
            <p>{t("customers.noCustomers")}</p>
          </div>
        ) : (
          customers.map((c) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setSelected(c as Customer)}
              className="flex items-center justify-between p-4 rounded-xl bg-card border border-border hover:border-primary/50 cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                  {c.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm">{c.name}</p>
                    <TierBadge tier={c.loyaltyTier} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone size={10} /> {c.phone}
                    </span>
                    <span className="text-xs text-muted-foreground">{c.totalOrders} {t("customers.orders")}</span>
                    <span className="text-xs text-primary font-medium">{formatSAR(c.totalSpent)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-center">
                  <p className="text-sm font-bold text-yellow-400">{c.loyaltyPoints}</p>
                  <p className="text-[10px] text-muted-foreground">{t("customers.points")}</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground" />
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{t("customers.addTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {[
              { key: "name", label: t("customers.form.name"), type: "text", required: true },
              { key: "phone", label: t("customers.form.phone"), type: "tel", required: true },
              { key: "email", label: t("customers.form.email"), type: "email" },
            ].map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{f.label}{f.required && " *"}</Label>
                <Input
                  type={f.type}
                  value={form[f.key as keyof typeof form]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="bg-background border-border"
                />
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("customers.form.notes")}</Label>
              <Input
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="bg-background border-border"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={!form.name || !form.phone || createCustomer.isPending}
              className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {createCustomer.isPending ? "..." : t("common.save")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Detail Dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  {selected.name}
                  <TierBadge tier={selected.loyaltyTier} />
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4 mt-2">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-background p-3 text-center">
                  <p className="text-xl font-bold text-primary">{selected.totalOrders}</p>
                  <p className="text-[10px] text-muted-foreground">{t("customers.orders")}</p>
                </div>
                <div className="rounded-xl bg-background p-3 text-center">
                  <p className="text-lg font-bold text-green-400">{formatSAR(selected.totalSpent)}</p>
                  <p className="text-[10px] text-muted-foreground">{t("customers.spent")}</p>
                </div>
                <div className="rounded-xl bg-background p-3 text-center">
                  <p className="text-xl font-bold text-yellow-400">{selected.loyaltyPoints}</p>
                  <p className="text-[10px] text-muted-foreground">{t("customers.points")}</p>
                </div>
              </div>

              {/* Contact */}
              <div className="rounded-xl bg-background p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Phone size={14} className="text-muted-foreground" />
                  <span>{selected.phone}</span>
                </div>
                {selected.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={14} className="text-muted-foreground" />
                    <span>{selected.email}</span>
                  </div>
                )}
                {selected.notes && (
                  <div className="flex items-start gap-2 text-sm">
                    <StickyNote size={14} className="text-muted-foreground mt-0.5" />
                    <span className="text-muted-foreground">{selected.notes}</span>
                  </div>
                )}
              </div>

              {/* Add Note */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("customers.addNote")}</Label>
                <div className="flex gap-2">
                  <Input
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder={t("customers.notePlaceholder")}
                    className="bg-background border-border text-sm"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText || addNote.isPending}
                    className="px-3 py-2 bg-primary text-white rounded-xl text-sm disabled:opacity-50"
                  >
                    {t("common.add")}
                  </button>
                </div>
              </div>

              {/* Loyalty Adjustment */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Award size={12} /> {t("customers.adjustPoints")}
                </Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={loyaltyDelta}
                    onChange={(e) => setLoyaltyDelta(e.target.value)}
                    placeholder={t("customers.pointsAmount")}
                    className="bg-background border-border text-sm w-24"
                  />
                  <Input
                    value={loyaltyReason}
                    onChange={(e) => setLoyaltyReason(e.target.value)}
                    placeholder={t("customers.pointsReason")}
                    className="bg-background border-border text-sm flex-1"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAdjustPoints("earn")}
                    disabled={!loyaltyDelta || adjustPoints.isPending}
                    className="flex-1 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    + {t("customers.earnPoints")}
                  </button>
                  <button
                    onClick={() => handleAdjustPoints("redeem")}
                    disabled={!loyaltyDelta || adjustPoints.isPending}
                    className="flex-1 py-1.5 bg-orange-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                  >
                    - {t("customers.redeemPoints")}
                  </button>
                </div>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(selected.id)}
                className="w-full py-2 border border-red-500/50 text-red-400 rounded-xl text-sm hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> {t("customers.delete")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
