import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid3X3, Plus, Edit3, Trash2, Users, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

type TableStatus = "available" | "occupied" | "reserved" | "dirty";

interface Table {
  id: number;
  name: string;
  capacity: number;
  status: TableStatus;
  section?: string;
  currentOrderId?: number | null;
  occupiedSince?: string | null;
}

const STATUS_COLOR: Record<TableStatus, string> = {
  available: "border-emerald-500/40 bg-emerald-500/5 text-emerald-400",
  occupied:  "border-primary/50 bg-primary/5 text-primary",
  reserved:  "border-amber-500/40 bg-amber-500/5 text-amber-400",
  dirty:     "border-red-500/40 bg-red-500/5 text-red-400",
};

const STATUS_ICON: Record<TableStatus, React.ElementType> = {
  available: CheckCircle2,
  occupied:  Users,
  reserved:  Clock,
  dirty:     XCircle,
};

const STATUS_LABELS_EN: Record<TableStatus, string> = { available: "Available", occupied: "Occupied", reserved: "Reserved", dirty: "Dirty" };
const STATUS_LABELS_AR: Record<TableStatus, string> = { available: "متاحة", occupied: "مشغولة", reserved: "محجوزة", dirty: "تحتاج تنظيف" };

export default function FloorPlanPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Table | null>(null);
  const [filterStatus, setFilterStatus] = useState<TableStatus | "all">("all");

  const { data: tables = [], isLoading } = useQuery<Table[]>({
    queryKey: ["tables-floor"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/tables", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return [];
      return res.json() as Promise<Table[]>;
    },
    refetchInterval: 15000,
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: TableStatus }) => {
      const token = await getToken();
      await fetch(`/api/tables/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["tables-floor"] }); setSelected(null); },
  });

  const counts: Record<string, number> = {
    all: tables.length,
    available: tables.filter(t => t.status === "available").length,
    occupied:  tables.filter(t => t.status === "occupied").length,
    reserved:  tables.filter(t => t.status === "reserved").length,
    dirty:     tables.filter(t => t.status === "dirty").length,
  };

  const filtered = filterStatus === "all" ? tables : tables.filter(t => t.status === filterStatus);

  function timeSince(iso: string) {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    return isAr ? `${m} دقيقة` : `${m}m`;
  }

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Grid3X3 size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">{isAr ? "خريطة الطاولات" : "Floor Plan"}</h1>
          <p className="text-xs text-muted-foreground">{isAr ? "إدارة الطاولات والجلسات" : "Table & seating management"}</p>
        </div>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-5 gap-2">
        {(["all", "available", "occupied", "reserved", "dirty"] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`p-2.5 rounded-2xl border text-center transition-all ${
              filterStatus === s ? "border-primary/50 bg-primary/10" : "border-border bg-card hover:border-primary/30"
            }`}>
            <p className={`text-lg font-bold ${filterStatus === s ? "text-primary" : "text-foreground"}`}>
              {counts[s] ?? 0}
            </p>
            <p className={`text-[9px] capitalize ${filterStatus === s ? "text-primary" : "text-muted-foreground"}`}>
              {s === "all" ? (isAr ? "الكل" : "All") : (isAr ? STATUS_LABELS_AR[s as TableStatus] : STATUS_LABELS_EN[s as TableStatus])}
            </p>
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-card border border-border animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 border border-dashed border-border rounded-2xl text-muted-foreground">
          <Grid3X3 size={28} className="mb-2 opacity-30" />
          <p className="text-sm">{isAr ? "لا توجد طاولات" : "No tables found"}</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          <AnimatePresence mode="popLayout">
            {filtered.map(table => {
              const Icon = STATUS_ICON[table.status];
              return (
                <motion.button key={table.id} layout
                  initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                  onClick={() => setSelected(table)}
                  className={`p-3 rounded-2xl border text-start transition-all hover:scale-[1.02] ${STATUS_COLOR[table.status]}`}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-bold text-foreground">{table.name}</p>
                    <Icon size={13} />
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Users size={9} /> {table.capacity}
                  </p>
                  {table.status === "occupied" && table.occupiedSince && (
                    <p className="text-[10px] text-primary mt-1 flex items-center gap-1">
                      <Clock size={9} /> {timeSince(table.occupiedSince)}
                    </p>
                  )}
                  {table.section && (
                    <p className="text-[9px] text-muted-foreground mt-1">{table.section}</p>
                  )}
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Table detail panel */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelected(null)} />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className="fixed inset-x-0 bottom-0 bg-card border-t border-border z-50 rounded-t-3xl p-5 space-y-4">
              <div className="w-10 h-1 rounded-full bg-border mx-auto mb-2" />
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${STATUS_COLOR[selected.status]}`}>
                  {(() => { const Icon = STATUS_ICON[selected.status]; return <Icon size={20} />; })()}
                </div>
                <div>
                  <h3 className="text-base font-bold text-foreground">{selected.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    {isAr ? `سعة: ${selected.capacity} أشخاص` : `Capacity: ${selected.capacity} persons`}
                    {selected.section ? ` · ${selected.section}` : ""}
                  </p>
                </div>
              </div>

              <p className="text-xs font-semibold text-muted-foreground">{isAr ? "تغيير الحالة" : "Change Status"}</p>
              <div className="grid grid-cols-4 gap-2">
                {(["available", "occupied", "reserved", "dirty"] as const).map(s => {
                  const Icon = STATUS_ICON[s];
                  return (
                    <button key={s} onClick={() => updateStatus.mutate({ id: selected.id, status: s })}
                      disabled={selected.status === s || updateStatus.isPending}
                      className={`p-3 rounded-2xl border text-center transition-all ${
                        selected.status === s ? STATUS_COLOR[s] + " opacity-100" : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                      } disabled:cursor-not-allowed`}>
                      <Icon size={16} className="mx-auto mb-1" />
                      <p className="text-[9px] font-medium">{isAr ? STATUS_LABELS_AR[s] : STATUS_LABELS_EN[s]}</p>
                    </button>
                  );
                })}
              </div>

              {selected.currentOrderId && (
                <div className="p-3 rounded-xl bg-background border border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{isAr ? "الطلب النشط" : "Active Order"}</span>
                  <span className="text-xs font-bold text-primary">#{selected.currentOrderId}</span>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
