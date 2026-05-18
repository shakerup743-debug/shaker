import { useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutGrid, Plus, Users, Clock, Brush, WifiOff, Settings2, CalendarClock, Check, X,
} from "lucide-react";
import {
  useListTables,
  useCreateTable,
  useUpdateTable,
  useDeleteTable,
  useSeatTable,
  useClearTable,
  useListReservations,
  useCreateReservation,
  getListTablesQueryKey,
  getListReservationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTranslation } from "react-i18next";

type Table = {
  id: number; number: string; capacity: number; status: string;
  posX: number; posY: number; shape: string; section: string; isActive: boolean;
  customerName?: string | null; guestCount?: number | null; occupiedSince?: string | null;
};

const STATUS_CONFIG = {
  available:      { label: "tables.status.available",     color: "bg-green-400",  border: "border-green-400/40",  text: "text-green-400" },
  occupied:       { label: "tables.status.occupied",      color: "bg-red-400",    border: "border-red-400/40",    text: "text-red-400" },
  needs_cleaning: { label: "tables.status.needsCleaning", color: "bg-yellow-400", border: "border-yellow-400/40", text: "text-yellow-400" },
  reserved:       { label: "tables.status.reserved",      color: "bg-blue-400",   border: "border-blue-400/40",   text: "text-blue-400" },
  disabled:       { label: "tables.status.disabled",      color: "bg-gray-500",   border: "border-gray-500/40",   text: "text-gray-400" },
};

function minutesSince(ts: string | null | undefined): number {
  if (!ts) return 0;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
}

export default function TablesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [tab, setTab] = useState<"map" | "reservations">("map");
  const [addOpen, setAddOpen] = useState(false);
  const [seatOpen, setSeatOpen] = useState<Table | null>(null);
  const [reserveOpen, setReserveOpen] = useState(false);

  const [newTable, setNewTable] = useState({ number: "", capacity: "4", section: "main", shape: "rectangle" });
  const [seatForm, setSeatForm] = useState({ customerName: "", guestCount: "1" });
  const [resForm, setResForm] = useState({ tableId: "", customerName: "", customerPhone: "", guestCount: "2", reservationTime: "", notes: "" });

  const { data: tables, isLoading } = useListTables({ query: { refetchInterval: 15_000 } as never });
  const { data: reservations } = useListReservations({} as never);

  const createTable = useCreateTable();
  const seatTable = useSeatTable();
  const clearTable = useClearTable();
  const deleteTable = useDeleteTable();
  const createReservation = useCreateReservation();

  const invalidateTables = () => {
    qc.invalidateQueries({ queryKey: getListTablesQueryKey() });
    qc.invalidateQueries({ queryKey: getListReservationsQueryKey({}) });
  };

  const handleCreate = async () => {
    if (!newTable.number) return;
    try {
      await createTable.mutateAsync({ data: { number: newTable.number, capacity: parseInt(newTable.capacity), section: newTable.section, shape: newTable.shape } });
      invalidateTables();
      setAddOpen(false);
      setNewTable({ number: "", capacity: "4", section: "main", shape: "rectangle" });
      toast({ title: t("tables.toast.created") });
    } catch {
      toast({ title: t("tables.toast.numberTaken"), variant: "destructive" });
    }
  };

  const handleSeat = async () => {
    if (!seatOpen) return;
    await seatTable.mutateAsync({ id: seatOpen.id, data: { customerName: seatForm.customerName || undefined, guestCount: parseInt(seatForm.guestCount) } });
    invalidateTables();
    setSeatOpen(null);
    setSeatForm({ customerName: "", guestCount: "1" });
    toast({ title: t("tables.toast.seated") });
  };

  const handleClear = async (table: Table, needsCleaning: boolean) => {
    await clearTable.mutateAsync({ id: table.id, data: { needsCleaning } });
    invalidateTables();
    toast({ title: t("tables.toast.cleared") });
  };

  const handleReservation = async () => {
    if (!resForm.tableId || !resForm.customerName || !resForm.reservationTime) return;
    await createReservation.mutateAsync({
      data: {
        tableId: parseInt(resForm.tableId),
        customerName: resForm.customerName,
        customerPhone: resForm.customerPhone || undefined,
        guestCount: parseInt(resForm.guestCount),
        reservationTime: new Date(resForm.reservationTime).toISOString(),
        notes: resForm.notes || undefined,
      }
    });
    invalidateTables();
    setReserveOpen(false);
    toast({ title: t("tables.toast.reserved") });
  };

  const statusCounts = {
    available: tables?.filter((t) => t.status === "available").length ?? 0,
    occupied: tables?.filter((t) => t.status === "occupied").length ?? 0,
    needs_cleaning: tables?.filter((t) => t.status === "needs_cleaning").length ?? 0,
  };

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <LayoutGrid size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold">{t("tables.title")}</h1>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-green-400">{statusCounts.available} {t("tables.status.available")}</span>
              <span className="text-red-400">{statusCounts.occupied} {t("tables.status.occupied")}</span>
              <span className="text-yellow-400">{statusCounts.needs_cleaning} {t("tables.status.needsCleaning")}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setReserveOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-card border border-border text-sm font-semibold rounded-xl hover:border-primary/50">
            <CalendarClock size={16} /> {t("tables.newReservation")}
          </button>
          <button onClick={() => setAddOpen(true)} className="flex items-center gap-2 px-3 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90">
            <Plus size={16} /> {t("tables.addTable")}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-6 shrink-0">
        {(["map", "reservations"] as const).map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === tb ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t(`tables.tabs.${tb}`)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "map" ? (
          isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-36 rounded-2xl bg-card animate-pulse" />)}
            </div>
          ) : !tables?.length ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <LayoutGrid size={40} className="mb-3 opacity-30" />
              <p>{t("tables.noTables")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {tables.map((table) => {
                const cfg = STATUS_CONFIG[table.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.available;
                const mins = minutesSince(table.occupiedSince);

                return (
                  <motion.div
                    key={table.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`relative p-4 rounded-2xl bg-card border-2 ${cfg.border} cursor-pointer hover:scale-105 transition-transform select-none`}
                    onClick={() => {
                      if (table.status === "available") setSeatOpen(table as Table);
                    }}
                  >
                    {/* Status dot */}
                    <div className={`absolute top-3 end-3 w-2.5 h-2.5 rounded-full ${cfg.color}`} />

                    {/* Table number */}
                    <div className={`w-12 h-12 rounded-xl ${cfg.color}/10 border ${cfg.border} flex items-center justify-center mb-3`}>
                      <span className={`font-bold text-lg ${cfg.text}`}>{table.number}</span>
                    </div>

                    {/* Info */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users size={11} /> {table.capacity}
                      </div>
                      {table.customerName && (
                        <p className="text-xs font-medium truncate">{table.customerName}</p>
                      )}
                      {table.status === "occupied" && table.occupiedSince && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock size={11} /> {mins} {t("tables.mins")}
                        </div>
                      )}
                    </div>

                    {/* Status label */}
                    <p className={`text-[10px] font-semibold mt-2 ${cfg.text}`}>{t(cfg.label)}</p>

                    {/* Action buttons */}
                    {table.status === "occupied" && (
                      <div className="flex gap-1 mt-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClear(table as Table, true); }}
                          className="flex-1 py-1 text-[10px] rounded-lg bg-yellow-400/10 text-yellow-400 hover:bg-yellow-400/20"
                        >
                          <Brush size={10} className="inline" /> {t("tables.clean")}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleClear(table as Table, false); }}
                          className="flex-1 py-1 text-[10px] rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20"
                        >
                          <Check size={10} className="inline" /> {t("tables.free")}
                        </button>
                      </div>
                    )}
                    {table.status === "needs_cleaning" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleClear(table as Table, false); }}
                        className="w-full mt-2 py-1 text-[10px] rounded-lg bg-green-400/10 text-green-400 hover:bg-green-400/20"
                      >
                        <Check size={10} className="inline" /> {t("tables.markReady")}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )
        ) : (
          <div className="space-y-2">
            {!reservations?.length ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <CalendarClock size={40} className="mb-3 opacity-30" />
                <p>{t("tables.noReservations")}</p>
              </div>
            ) : (
              reservations.map((r) => (
                <div key={r.id} className="p-4 rounded-xl bg-card border border-border flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{r.customerName}</p>
                      <span className="text-xs bg-card border border-border px-2 py-0.5 rounded-full">{t("tables.tableNum")} {r.tableNumber}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Clock size={10} />{new Date(r.reservationTime).toLocaleString()}</span>
                      <span className="flex items-center gap-1"><Users size={10} />{r.guestCount}</span>
                      {r.customerPhone && <span>{r.customerPhone}</span>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-semibold ${r.status === "confirmed" ? "bg-green-400/10 text-green-400" : r.status === "cancelled" ? "bg-red-400/10 text-red-400" : "bg-yellow-400/10 text-yellow-400"}`}>
                    {t(`tables.resStatus.${r.status}`, { defaultValue: r.status })}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Add Table Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader><DialogTitle>{t("tables.addTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("tables.form.number")} *</Label>
              <Input value={newTable.number} onChange={(e) => setNewTable((p) => ({ ...p, number: e.target.value }))} placeholder="T1" className="bg-background border-border" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("tables.form.capacity")}</Label>
                <Input type="number" value={newTable.capacity} onChange={(e) => setNewTable((p) => ({ ...p, capacity: e.target.value }))} className="bg-background border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("tables.form.section")}</Label>
                <Input value={newTable.section} onChange={(e) => setNewTable((p) => ({ ...p, section: e.target.value }))} className="bg-background border-border" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("tables.form.shape")}</Label>
              <Select value={newTable.shape} onValueChange={(v) => setNewTable((p) => ({ ...p, shape: v }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  <SelectItem value="rectangle">{t("tables.shapes.rectangle")}</SelectItem>
                  <SelectItem value="circle">{t("tables.shapes.circle")}</SelectItem>
                  <SelectItem value="square">{t("tables.shapes.square")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <button onClick={handleCreate} disabled={!newTable.number || createTable.isPending} className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {createTable.isPending ? "..." : t("common.save")}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Seat Dialog */}
      {seatOpen && (
        <Dialog open onOpenChange={() => setSeatOpen(null)}>
          <DialogContent className="bg-card border-border max-w-sm">
            <DialogHeader><DialogTitle>{t("tables.seatTitle")} {seatOpen.number}</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("tables.form.customerName")}</Label>
                <Input value={seatForm.customerName} onChange={(e) => setSeatForm((p) => ({ ...p, customerName: e.target.value }))} className="bg-background border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("tables.form.guestCount")}</Label>
                <Input type="number" min="1" max={seatOpen.capacity} value={seatForm.guestCount} onChange={(e) => setSeatForm((p) => ({ ...p, guestCount: e.target.value }))} className="bg-background border-border" />
              </div>
              <button onClick={handleSeat} disabled={seatTable.isPending} className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                {seatTable.isPending ? "..." : t("tables.seat")}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Reservation Dialog */}
      <Dialog open={reserveOpen} onOpenChange={setReserveOpen}>
        <DialogContent className="bg-card border-border max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("tables.newReservation")}</DialogTitle></DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("tables.form.tableNum")} *</Label>
              <Select value={resForm.tableId} onValueChange={(v) => setResForm((p) => ({ ...p, tableId: v }))}>
                <SelectTrigger className="bg-background border-border"><SelectValue placeholder={t("tables.selectTable")} /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {tables?.filter((tbl) => tbl.status === "available").map((tbl) => <SelectItem key={tbl.id} value={String(tbl.id)}>{t("tables.tableNum")} {tbl.number} ({tbl.capacity})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {[
              { key: "customerName", label: t("tables.form.customerName"), required: true },
              { key: "customerPhone", label: t("tables.form.phone"), type: "tel" },
            ].map((f) => (
              <div key={f.key} className="space-y-1">
                <Label className="text-xs text-muted-foreground">{f.label}{f.required ? " *" : ""}</Label>
                <Input type={f.type} value={resForm[f.key as keyof typeof resForm]} onChange={(e) => setResForm((p) => ({ ...p, [f.key]: e.target.value }))} className="bg-background border-border" />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("tables.form.guestCount")}</Label>
                <Input type="number" min="1" value={resForm.guestCount} onChange={(e) => setResForm((p) => ({ ...p, guestCount: e.target.value }))} className="bg-background border-border" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{t("tables.form.time")} *</Label>
                <Input type="datetime-local" value={resForm.reservationTime} onChange={(e) => setResForm((p) => ({ ...p, reservationTime: e.target.value }))} className="bg-background border-border" />
              </div>
            </div>
            <button onClick={handleReservation} disabled={!resForm.tableId || !resForm.customerName || !resForm.reservationTime || createReservation.isPending} className="w-full py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
              {createReservation.isPending ? "..." : t("tables.confirmReservation")}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
