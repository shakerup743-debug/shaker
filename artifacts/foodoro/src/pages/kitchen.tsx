import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChefHat, Clock, RefreshCw, Wifi, WifiOff, Volume2, VolumeX, StickyNote, AlertTriangle, ChevronDown, ChevronUp, Sliders, X, CheckCircle2, XCircle, History, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import {
  useListKitchenTickets,
  useUpdateTicketStatus,
  getListKitchenTicketsQueryKey,
  useListKitchenAvailability,
  useSetProductAvailability,
  getListKitchenAvailabilityQueryKey,
  useGetAvailabilityLog,
  useListInventory,
  useCreateWasteLog,
  useListWasteLogs,
} from "@workspace/api-client-react";
import type { UnavailabilityReason } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSse } from "@/hooks/use-sse";
import {
  isMuted,
  setMuted,
  unlockAudio,
  playNewOrderAlert,
} from "@/lib/kitchen-sound";
import type { KitchenTicket } from "@workspace/api-client-react";

const APP_TITLE = "FOODPRO - Kitchen";

function elapsed(createdAt: string) {
  const diff = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s`;
}

function TicketCard({
  ticket,
  isNew,
}: {
  ticket: KitchenTicket;
  isNew: boolean;
}) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const updateStatus = useUpdateTicketStatus();
  const queryClient = useQueryClient();
  const [time, setTime] = useState(elapsed(ticket.createdAt));
  const [notesExpanded, setNotesExpanded] = useState(false);
  const isDelayed =
    Date.now() - new Date(ticket.createdAt).getTime() > 10 * 60 * 1000;

  const isSpecial = ticket.notes?.includes("⚠️ URGENT") || ticket.notes?.includes("عاجل");
  const generalNote = ticket.notes?.replace("⚠️ URGENT / عاجل", "").replace("|", "").trim();

  const STATUS_CONFIG = {
    new: {
      bg: "bg-[#1F2937]",
      header: "bg-[#1a2332]",
      badge: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      next: "in_progress" as const,
      nextLabel: t("kitchen.actions.startPreparing"),
      nextBg: "bg-amber-500 hover:bg-amber-400",
    },
    in_progress: {
      bg: "bg-amber-950/30",
      header: "bg-amber-500/20",
      badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
      next: "ready" as const,
      nextLabel: t("kitchen.actions.markReady"),
      nextBg: "bg-emerald-600 hover:bg-emerald-500",
    },
    ready: {
      bg: "bg-emerald-950/30",
      header: "bg-emerald-500/20",
      badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      next: "completed" as const,
      nextLabel: t("kitchen.actions.completed"),
      nextBg: "bg-gray-600 hover:bg-gray-500",
    },
  };

  useEffect(() => {
    const interval = setInterval(
      () => setTime(elapsed(ticket.createdAt)),
      1000,
    );
    return () => clearInterval(interval);
  }, [ticket.createdAt]);

  const config = STATUS_CONFIG[ticket.status as keyof typeof STATUS_CONFIG];
  if (!config) return null;

  const handleAdvance = async () => {
    await updateStatus.mutateAsync({
      id: ticket.id,
      data: { status: config.next },
    });
    queryClient.invalidateQueries({ queryKey: getListKitchenTicketsQueryKey() });
  };

  const hasNotes = !!ticket.notes || ticket.items.some((i) => i.notes);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={
        isNew
          ? {
              opacity: 1,
              scale: 1,
              boxShadow: [
                "0 0 0px 0px rgba(230,126,34,0)",
                "0 0 0px 6px rgba(230,126,34,0.55)",
                "0 0 0px 6px rgba(230,126,34,0.55)",
                "0 0 0px 0px rgba(230,126,34,0)",
              ],
            }
          : { opacity: 1, scale: 1, boxShadow: "0 0 0px 0px rgba(230,126,34,0)" }
      }
      transition={
        isNew
          ? { duration: 2, times: [0, 0.15, 0.6, 1] }
          : { duration: 0.25 }
      }
      exit={{ opacity: 0, scale: 0.9 }}
      className={`rounded-2xl border overflow-hidden ${config.bg} ${
        isSpecial
          ? "border-red-500/70"
          : isNew
          ? "border-[#E67E22]/70"
          : isDelayed && ticket.status !== "ready"
          ? "border-destructive/50"
          : "border-border"
      }`}
      data-testid={`card-ticket-${ticket.id}`}
    >
      {/* Urgent banner */}
      {isSpecial && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-red-500/20 border-b border-red-500/30">
          <AlertTriangle size={13} className="text-red-400 animate-pulse" />
          <span className="text-[11px] font-bold text-red-300">
            {isAr ? "⚠️ طلب عاجل — انتبه!" : "⚠️ URGENT ORDER — Pay attention!"}
          </span>
        </div>
      )}

      <div
        className={`flex items-center justify-between px-4 py-3 ${
          isNew ? "bg-[#E67E22]/15" : config.header
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="font-bold text-foreground text-sm"
            data-testid={`text-order-number-${ticket.id}`}
          >
            {ticket.orderNumber}
          </span>
          {isNew && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#E67E22]/20 text-[#E67E22] border border-[#E67E22]/40 font-bold animate-pulse">
              {t("kitchen.sound.newBadge")}
            </span>
          )}
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${config.badge}`}
          >
            {t(`kitchen.statuses.${ticket.status}`)}
          </span>
          {ticket.type === "dine_in" && ticket.tableNumber && (
            <span className="text-[10px] text-muted-foreground">
              {t("kitchen.tags.table")} {ticket.tableNumber}
            </span>
          )}
          {ticket.type === "takeaway" && (
            <span className="text-[10px] text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
              {t("kitchen.tags.takeaway")}
            </span>
          )}
        </div>
        <div
          className={`flex items-center gap-1 text-xs font-mono shrink-0 ${
            isDelayed ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          <Clock size={11} />
          <span data-testid={`text-elapsed-${ticket.id}`}>{time}</span>
        </div>
      </div>

      {/* Notes toggle */}
      {hasNotes && (
        <button
          onClick={() => setNotesExpanded((v) => !v)}
          className={`w-full flex items-center gap-2 px-4 py-2 text-[11px] font-medium transition-colors border-b border-border/50
            ${isSpecial
              ? "bg-red-500/10 text-red-300 hover:bg-red-500/20"
              : "bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            }`}
        >
          {isSpecial ? <AlertTriangle size={11} /> : <StickyNote size={11} />}
          <span className="flex-1 text-start">
            {isAr ? "📝 هناك ملاحظات مهمة للطلب" : "📝 Important order notes"}
          </span>
          {notesExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      )}

      {/* Expanded notes */}
      {hasNotes && notesExpanded && (
        <div className={`px-4 py-2 space-y-1.5 border-b border-border/50 ${isSpecial ? "bg-red-500/5" : "bg-amber-500/5"}`}>
          {generalNote && (
            <div className={`text-[11px] font-medium rounded-lg px-2 py-1.5 ${
              isSpecial ? "bg-red-500/20 text-red-300" : "bg-amber-500/10 text-amber-300"
            }`}>
              📝 {generalNote}
            </div>
          )}
        </div>
      )}

      <div className="px-4 py-3 space-y-2">
        {ticket.items.map((item) => (
          <div
            key={item.id}
            className="flex items-start gap-3"
            data-testid={`item-${item.id}`}
          >
            <span className="w-6 h-6 rounded-lg bg-primary text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {item.quantity}
            </span>
            <div>
              <p className="text-sm font-medium text-foreground leading-tight">
                {item.productName}
              </p>
              {item.notes && (
                <p className="text-[11px] text-amber-400 mt-0.5">
                  ↳ {item.notes}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 pb-4">
        <button
          data-testid={`button-advance-${ticket.id}`}
          onClick={handleAdvance}
          disabled={updateStatus.isPending}
          className={`w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-colors ${config.nextBg} disabled:opacity-50`}
        >
          {config.nextLabel}
        </button>
      </div>
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Availability Panel
────────────────────────────────────────────────────────────────── */
const REASONS = [
  { value: "out_of_stock",    en: "Out of stock",         ar: "نفد المخزون" },
  { value: "temp_unavailable",en: "Temporarily unavailable", ar: "متوقف مؤقتًا" },
  { value: "ended_today",     en: "Ended for today",      ar: "انتهى اليوم" },
  { value: "ingredient_out",  en: "Ingredient unavailable", ar: "نفدت المكونات" },
  { value: "paused",          en: "Paused by kitchen",    ar: "موقوف من المطبخ" },
];

function AvailabilityPanel({ onClose }: { onClose: () => void }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const queryClient = useQueryClient();
  const [showLog, setShowLog] = useState(false);
  const [pendingReason, setPendingReason] = useState<Record<number, UnavailabilityReason>>({});
  const [pendingUntil, setPendingUntil] = useState<Record<number, string>>({});
  const [filterUnavailable, setFilterUnavailable] = useState(false);

  const { data: items, isLoading } = useListKitchenAvailability();
  const { data: logEntries } = useGetAvailabilityLog();
  const { mutate: setAvailability, isPending: isSetting } = useSetProductAvailability();

  const displayItems = filterUnavailable
    ? (items ?? []).filter((p) => !p.kitchenAvailable)
    : (items ?? []);

  const handleToggle = (productId: number, currentlyAvailable: boolean) => {
    const reason = pendingReason[productId] ?? ("temp_unavailable" as UnavailabilityReason);
    const timeStr = pendingUntil[productId];
    let unavailableUntil: string | undefined;
    if (currentlyAvailable && timeStr) {
      const [h, m] = timeStr.split(":").map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      if (d <= new Date()) d.setDate(d.getDate() + 1);
      unavailableUntil = d.toISOString();
    }
    setAvailability(
      { productId, data: { available: !currentlyAvailable, reason: currentlyAvailable ? reason : undefined, unavailableUntil } },
      {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListKitchenAvailabilityQueryKey() });
          void queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          setPendingReason((prev) => { const next = { ...prev }; delete next[productId]; return next; });
          setPendingUntil((prev) => { const next = { ...prev }; delete next[productId]; return next; });
        },
      }
    );
  };

  const unavailableCount = (items ?? []).filter(p => !p.kitchenAvailable).length;

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed inset-y-0 end-0 z-50 w-full max-w-md bg-[#0F1923] border-s border-border flex flex-col shadow-2xl"
    >
      {/* Panel header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Sliders size={16} className="text-primary" />
          <h2 className="font-semibold text-sm">{isAr ? "توفر المنتجات" : "Product Availability"}</h2>
          {unavailableCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-bold">{unavailableCount} {isAr ? "غير متوفر" : "out"}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLog(!showLog)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${showLog ? "bg-primary/20 text-primary" : "bg-card text-muted-foreground hover:text-foreground"}`}
          >
            <History size={12} />
            {isAr ? "سجل" : "Log"}
          </button>
          <button
            onClick={() => setFilterUnavailable(!filterUnavailable)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterUnavailable ? "bg-red-500/20 text-red-400" : "bg-card text-muted-foreground hover:text-foreground"}`}
          >
            <XCircle size={12} />
            {isAr ? "غير المتوفر فقط" : "Unavailable only"}
          </button>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-card hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Log view */}
      {showLog ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {!logEntries || logEntries.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {isAr ? "لا توجد سجلات بعد" : "No log entries yet"}
            </div>
          ) : logEntries.map((entry) => {
            const isEnabled = entry.action === "enabled";
            return (
              <div key={entry.id} className={`flex items-start gap-3 p-3 rounded-xl border ${isEnabled ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                {isEnabled
                  ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                  : <XCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
                }
                <div className="min-w-0 flex-1">
                  <p className="text-foreground text-xs font-medium truncate">{entry.productName}</p>
                  {entry.reason && <p className="text-muted-foreground text-[11px] mt-0.5">{entry.reason.replace(/_/g, " ")}</p>}
                  <p className="text-muted-foreground/60 text-[10px] mt-0.5">{entry.changedBy} · {new Date(entry.changedAt).toLocaleTimeString()}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Product list */
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              {isAr ? "جارٍ التحميل…" : "Loading…"}
            </div>
          ) : displayItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <CheckCircle2 size={32} className="text-emerald-400/50" />
              <p className="text-sm">{isAr ? "جميع المنتجات متوفرة" : "All products are available"}</p>
            </div>
          ) : displayItems.map((product) => {
            const available = product.kitchenAvailable !== false;
            return (
              <div key={product.id} className={`p-3 rounded-xl border transition-colors ${available ? "border-border bg-card/50" : "border-red-500/30 bg-red-500/5"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-sm font-medium truncate">{product.name}</p>
                    {!available && product.unavailabilityReason && (
                      <p className="text-red-400/70 text-[11px] mt-0.5">
                        {REASONS.find(r => r.value === product.unavailabilityReason)?.[isAr ? "ar" : "en"] ?? product.unavailabilityReason}
                      </p>
                    )}
                    {!available && product.unavailableUntil && (
                      <p className="text-amber-400/70 text-[10px] mt-0.5 flex items-center gap-1">
                        <Clock size={9} />
                        {isAr ? "يُعاد تفعيله في " : "Auto-restores at "}
                        {new Date(product.unavailableUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleToggle(product.id, available)}
                    disabled={isSetting}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                      available
                        ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                        : "bg-red-500/15 text-red-400 hover:bg-red-500/25"
                    }`}
                  >
                    {available ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                    {available ? (isAr ? "متوفر" : "Available") : (isAr ? "غير متوفر" : "Unavailable")}
                  </button>
                </div>
                {/* Reason + time picker — shown when product is currently available */}
                {available && (
                  <div className="mt-2 space-y-1.5">
                    <select
                      value={pendingReason[product.id] ?? "temp_unavailable"}
                      onChange={(e) => setPendingReason((prev) => ({ ...prev, [product.id]: e.target.value as UnavailabilityReason }))}
                      className="w-full text-[11px] bg-background border border-border rounded-lg px-2 py-1.5 text-muted-foreground focus:outline-none focus:border-primary/50"
                    >
                      {REASONS.map((r) => (
                        <option key={r.value} value={r.value}>{isAr ? r.ar : r.en}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1.5">
                      <Clock size={10} className="text-muted-foreground/60 shrink-0" />
                      <input
                        type="time"
                        value={pendingUntil[product.id] ?? ""}
                        onChange={(e) => setPendingUntil((prev) => ({ ...prev, [product.id]: e.target.value }))}
                        className="flex-1 text-[11px] bg-background border border-border rounded-lg px-2 py-1 text-muted-foreground focus:outline-none focus:border-amber-500/50"
                        title={isAr ? "وقت إعادة التفعيل التلقائي (اختياري)" : "Auto re-enable time (optional)"}
                      />
                      <span className="text-[10px] text-muted-foreground/50 whitespace-nowrap">{isAr ? "إعادة تفعيل في" : "Re-enable at"}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

/* ──────────────────────────────────────────────────────────────────
   Waste Panel — log waste from kitchen
────────────────────────────────────────────────────────────────── */
const WASTE_REASONS = [
  { value: "spoilage",   en: "Spoilage",        ar: "تلف" },
  { value: "burning",    en: "Burning",          ar: "احتراق" },
  { value: "expiry",     en: "Expiry",           ar: "انتهاء صلاحية" },
  { value: "prep_error", en: "Preparation error",ar: "خطأ في التحضير" },
  { value: "theft",      en: "Theft",            ar: "سرقة" },
  { value: "other",      en: "Other",            ar: "أخرى" },
];

function WastePanel({ onClose }: { onClose: () => void }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const queryClient = useQueryClient();

  const { data: inventoryItems } = useListInventory({});
  const { data: recentLogs } = useListWasteLogs({
    from: new Date().toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });
  const createWaste = useCreateWasteLog();

  const [form, setForm] = useState({
    inventoryId: "",
    inventoryName: "",
    quantity: "",
    unit: "",
    reason: "spoilage",
    notes: "",
    costEstimate: "",
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const selectedItem = inventoryItems?.find((i) => i.id === Number(form.inventoryId));

  const handleInventorySelect = (id: string) => {
    const item = inventoryItems?.find((i) => i.id === Number(id));
    setForm((f) => ({
      ...f,
      inventoryId: id,
      inventoryName: item?.name ?? "",
      unit: item?.unit ?? f.unit,
    }));
  };

  const handleSubmit = async () => {
    if (!form.inventoryName || !form.quantity || !form.unit) return;
    setSaving(true);
    try {
      await createWaste.mutateAsync({
        data: {
          inventoryId: form.inventoryId ? Number(form.inventoryId) : undefined,
          inventoryName: form.inventoryName,
          quantity: parseFloat(form.quantity),
          unit: form.unit,
          reason: form.reason as "spoilage" | "burning" | "expiry" | "prep_error" | "theft" | "other",
          notes: form.notes || undefined,
          costEstimate: form.costEstimate ? parseFloat(form.costEstimate) : undefined,
          deductFromInventory: !!form.inventoryId,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/waste"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      setSuccess(true);
      setForm({ inventoryId: "", inventoryName: "", quantity: "", unit: "", reason: "spoilage", notes: "", costEstimate: "" });
      setTimeout(() => setSuccess(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = form.inventoryName && form.quantity && form.unit && !saving;

  return (
    <motion.div
      initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 28, stiffness: 300 }}
      className="fixed inset-y-0 end-0 z-50 w-full max-w-md bg-[#0F1923] border-s border-border flex flex-col shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2.5">
          <Trash2 size={16} className="text-red-400" />
          <h2 className="font-semibold text-sm">{isAr ? "تسجيل الهدر" : "Log Waste"}</h2>
          {(recentLogs?.length ?? 0) > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 text-xs font-bold">
              {recentLogs!.length} {isAr ? "اليوم" : "today"}
            </span>
          )}
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg bg-card hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col">
        {/* Form */}
        <div className="p-4 space-y-3 border-b border-border">
          <p className="text-xs text-muted-foreground">{isAr ? "سجّل الهدر لتحديث المخزون تلقائياً" : "Log waste to automatically update inventory"}</p>

          {/* Inventory selector */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{isAr ? "الصنف" : "Item"}</label>
            <select
              value={form.inventoryId}
              onChange={(e) => handleInventorySelect(e.target.value)}
              className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">{isAr ? "اختر من المخزون..." : "Select from inventory..."}</option>
              {inventoryItems?.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>
              ))}
            </select>
            {!form.inventoryId && (
              <input
                type="text"
                placeholder={isAr ? "أو اكتب اسم الصنف يدوياً" : "Or type item name manually"}
                value={form.inventoryName}
                onChange={(e) => setForm((f) => ({ ...f, inventoryName: e.target.value }))}
                className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50"
              />
            )}
            {selectedItem && (
              <p className="text-[11px] text-muted-foreground/70">
                {isAr ? "متوفر حالياً: " : "Available: "}{selectedItem.quantity} {selectedItem.unit}
              </p>
            )}
          </div>

          {/* Quantity + Unit */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{isAr ? "الكمية" : "Quantity"}</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={form.quantity}
                onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{isAr ? "الوحدة" : "Unit"}</label>
              <input
                type="text"
                placeholder="kg, L, pcs..."
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{isAr ? "سبب الهدر" : "Waste Reason"}</label>
            <select
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
              className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50"
            >
              {WASTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>{isAr ? r.ar : r.en}</option>
              ))}
            </select>
          </div>

          {/* Cost estimate */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{isAr ? "التكلفة المقدرة (ر.س، اختياري)" : "Estimated Cost (SAR, optional)"}</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.costEstimate}
              onChange={(e) => setForm((f) => ({ ...f, costEstimate: e.target.value }))}
              className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{isAr ? "ملاحظات (اختياري)" : "Notes (optional)"}</label>
            <textarea
              rows={2}
              placeholder={isAr ? "تفاصيل إضافية..." : "Additional details..."}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full text-xs bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:border-primary/50 resize-none"
            />
          </div>

          <button
            disabled={!canSubmit}
            onClick={handleSubmit}
            className={`w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-all disabled:opacity-40 ${
              success ? "bg-emerald-600" : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {success
              ? (isAr ? "✓ تم التسجيل" : "✓ Logged")
              : saving
              ? (isAr ? "جارٍ الحفظ..." : "Saving...")
              : (isAr ? "تسجيل الهدر" : "Log Waste")
            }
          </button>
        </div>

        {/* Recent entries today */}
        {(recentLogs?.length ?? 0) > 0 && (
          <div className="p-4 space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{isAr ? "هدر اليوم" : "Today's Waste"}</p>
            {recentLogs!.slice(0, 10).map((log) => {
              const reasonLabel = WASTE_REASONS.find((r) => r.value === log.reason);
              return (
                <div key={log.id} className="flex items-start gap-3 p-3 rounded-xl bg-card/50 border border-border">
                  <Trash2 size={13} className="text-red-400/70 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground text-xs font-medium truncate">{log.inventoryName}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {log.quantity} {log.unit} · {isAr ? reasonLabel?.ar : reasonLabel?.en}
                    </p>
                    {log.costEstimate && (
                      <p className="text-red-400/70 text-[10px]">ر.س {log.costEstimate.toFixed(2)}</p>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground/50 shrink-0">
                    {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default function KitchenPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { data: tickets, isLoading, refetch } = useListKitchenTickets();
  const queryClient = useQueryClient();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [sseConnected, setSseConnected] = useState(false);
  const [mutedState, setMutedState] = useState(() => isMuted());
  const [newTicketIds, setNewTicketIds] = useState<Set<number>>(new Set());
  const [showAvailability, setShowAvailability] = useState(false);
  const [showWaste, setShowWaste] = useState(false);

  const prevTicketIdsRef = useRef<Set<number>>(new Set());
  const initializedRef = useRef(false);
  const pendingVisibilityAlertRef = useRef(false);
  const newTicketTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const unlock = () => void unlockAudio();
    document.addEventListener("pointerdown", unlock, { once: true });
    document.addEventListener("keydown", unlock, { once: true });
    document.addEventListener("touchstart", unlock, { once: true });
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      document.removeEventListener("touchstart", unlock);
    };
  }, []);

  const triggerAlert = useCallback(() => {
    if (!isMuted()) {
      playNewOrderAlert();
    }
    if (document.hidden) {
      pendingVisibilityAlertRef.current = true;
    }
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden && pendingVisibilityAlertRef.current) {
        pendingVisibilityAlertRef.current = false;
        if (!isMuted()) playNewOrderAlert();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const handleSseEvent = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListKitchenTicketsQueryKey() });
    setLastRefresh(new Date());
    triggerAlert();
  }, [queryClient, triggerAlert]);

  useSse({
    events: {
      "order:created": handleSseEvent,
      "ticket:updated": handleSseEvent,
    },
    onConnect: () => setSseConnected(true),
    onDisconnect: () => setSseConnected(false),
  });

  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    if (!tickets) return;
    const currentIds = new Set(tickets.map((t) => t.id));

    if (!initializedRef.current) {
      prevTicketIdsRef.current = currentIds;
      initializedRef.current = true;
      return;
    }

    const arrived = [...currentIds].filter(
      (id) => !prevTicketIdsRef.current.has(id),
    );
    prevTicketIdsRef.current = currentIds;

    if (arrived.length === 0) return;

    setNewTicketIds((prev) => {
      const next = new Set(prev);
      arrived.forEach((id) => next.add(id));
      return next;
    });

    const timers = newTicketTimersRef.current;
    arrived.forEach((id) => {
      const existing = timers.get(id);
      if (existing !== undefined) clearTimeout(existing);

      const handle = setTimeout(() => {
        setNewTicketIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        timers.delete(id);
      }, 2000);

      timers.set(id, handle);
    });
  }, [tickets]);

  const activeCount = tickets?.filter((t) => t.status !== "completed").length ?? 0;

  useEffect(() => {
    const prev = document.title;
    document.title =
      activeCount > 0 ? `(${activeCount}) ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = prev;
    };
  }, [activeCount]);

  useEffect(() => {
    const timers = newTicketTimersRef.current;
    return () => {
      timers.forEach((handle) => clearTimeout(handle));
      timers.clear();
    };
  }, []);

  const handleMuteToggle = async () => {
    await unlockAudio();
    const next = !mutedState;
    setMuted(next);
    setMutedState(next);
  };

  const COLUMNS = [
    {
      status: "new" as const,
      label: t("kitchen.statuses.new"),
      headerBg: "bg-[#1a2332]",
    },
    {
      status: "in_progress" as const,
      label: t("kitchen.statuses.in_progress"),
      headerBg: "bg-amber-500/20",
    },
    {
      status: "ready" as const,
      label: t("kitchen.statuses.ready"),
      headerBg: "bg-emerald-500/20",
    },
  ];

  const byStatus = {
    new: tickets?.filter((t) => t.status === "new") ?? [],
    in_progress: tickets?.filter((t) => t.status === "in_progress") ?? [],
    ready: tickets?.filter((t) => t.status === "ready") ?? [],
  };

  const totalActive = tickets?.length ?? 0;

  return (
    <div className="flex flex-col h-full bg-[#0B0F14]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <ChefHat size={20} className="text-primary" />
          <h1 className="text-base font-semibold">{t("kitchen.title")}</h1>
          {totalActive > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold">
              {totalActive} {t("kitchen.active")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {sseConnected ? (
              <Wifi size={12} className="text-emerald-400" />
            ) : (
              <WifiOff size={12} className="text-muted-foreground" />
            )}
            <span>
              {t("kitchen.updated")}{" "}
              {lastRefresh.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </span>
          </div>
          <button
            data-testid="button-waste-toggle"
            onClick={() => { setShowWaste((v) => !v); setShowAvailability(false); }}
            title={isAr ? "تسجيل الهدر" : "Log Waste"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showWaste
                ? "bg-red-500/20 text-red-400"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Trash2 size={13} />
            {isAr ? "الهدر" : "Waste"}
          </button>
          <button
            data-testid="button-availability-toggle"
            onClick={() => { setShowAvailability((v) => !v); setShowWaste(false); }}
            title={isAr ? "توفر المنتجات" : "Product Availability"}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              showAvailability
                ? "bg-primary/20 text-primary"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Sliders size={13} />
            {isAr ? "التوفر" : "Availability"}
          </button>
          <button
            data-testid="button-mute-toggle"
            onClick={handleMuteToggle}
            title={mutedState ? t("kitchen.sound.unmute") : t("kitchen.sound.mute")}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              mutedState
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {mutedState ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button
            data-testid="button-refresh-kds"
            onClick={() => {
              refetch();
              setLastRefresh(new Date());
            }}
            className="w-8 h-8 rounded-lg bg-card hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
        {COLUMNS.map(({ status, label, headerBg }) => (
          <div key={status} className="flex flex-col h-full overflow-hidden">
            <div
              className={`flex items-center justify-between px-4 py-2.5 border-b border-border ${headerBg}`}
            >
              <span className="text-sm font-semibold text-foreground">
                {label}
              </span>
              <span className="text-xs text-muted-foreground">
                {byStatus[status].length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {isLoading ? (
                <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
                  {t("common.loading")}
                </div>
              ) : byStatus[status].length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                  <ChefHat size={24} className="mb-2 opacity-20" />
                  <p className="text-xs">{t("kitchen.noOrders")}</p>
                </div>
              ) : (
                <AnimatePresence mode="popLayout">
                  {byStatus[status].map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      isNew={newTicketIds.has(ticket.id)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Availability slide-in panel */}
      <AnimatePresence>
        {showAvailability && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setShowAvailability(false)}
            />
            <AvailabilityPanel onClose={() => setShowAvailability(false)} />
          </>
        )}
      </AnimatePresence>

      {/* Waste slide-in panel */}
      <AnimatePresence>
        {showWaste && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => setShowWaste(false)}
            />
            <WastePanel onClose={() => setShowWaste(false)} />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
