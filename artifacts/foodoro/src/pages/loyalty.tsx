import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, Trophy, Award, Gift, TrendingUp, Users,
  ChevronRight, Plus, Minus, Search, Crown,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrency } from "@/contexts/currency";

const TIER_META = {
  bronze:   { color: "#CD7F32", bg: "#CD7F3218", label: "Bronze",   labelAr: "برونز",   icon: Award, min: 0,    max: 499 },
  silver:   { color: "#9CA3AF", bg: "#9CA3AF18", label: "Silver",   labelAr: "فضي",    icon: Star,  min: 500,  max: 1499 },
  gold:     { color: "#F59E0B", bg: "#F59E0B18", label: "Gold",     labelAr: "ذهبي",   icon: Trophy, min: 1500, max: 4999 },
  platinum: { color: "#8B5CF6", bg: "#8B5CF618", label: "Platinum", labelAr: "بلاتيني", icon: Crown, min: 5000, max: Infinity },
};

interface LeaderboardEntry {
  id: number; name: string; email: string;
  loyalty_points: number; loyalty_tier: string; total_orders: number;
}

interface HistoryEntry {
  id: number; points: number; type: string;
  note: string | null; order_id: number | null; created_at: string;
}

export default function LoyaltyPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();
  const { format } = useCurrency();

  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<LeaderboardEntry | null>(null);
  const [awardOpen, setAwardOpen] = useState(false);
  const [redeemOpen, setRedeemOpen] = useState(false);
  const [pts, setPts] = useState(100);
  const [note, setNote] = useState("");

  const fetcher = async (path: string, opts?: RequestInit) => {
    const token = await getToken();
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) } });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<unknown>;
  };

  const { data: leaderboard, isLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ["loyalty-leaderboard"],
    queryFn: () => fetcher("/api/loyalty/leaderboard") as Promise<LeaderboardEntry[]>,
  });

  const { data: history } = useQuery<{ customer: LeaderboardEntry; history: HistoryEntry[] }>({
    queryKey: ["loyalty-history", selectedCustomer?.id],
    queryFn: () => fetcher(`/api/loyalty/${selectedCustomer!.id}/history`) as Promise<{ customer: LeaderboardEntry; history: HistoryEntry[] }>,
    enabled: !!selectedCustomer,
  });

  const awardMut = useMutation({
    mutationFn: (body: object) => fetcher(`/api/loyalty/${selectedCustomer!.id}/award`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["loyalty-leaderboard"] });
      void qc.invalidateQueries({ queryKey: ["loyalty-history", selectedCustomer?.id] });
      setAwardOpen(false); setNote(""); setPts(100);
      toast({ title: isAr ? "تم منح النقاط" : "Points awarded" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const redeemMut = useMutation({
    mutationFn: (body: object) => fetcher(`/api/loyalty/${selectedCustomer!.id}/redeem`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["loyalty-leaderboard"] });
      void qc.invalidateQueries({ queryKey: ["loyalty-history", selectedCustomer?.id] });
      setRedeemOpen(false); setNote(""); setPts(100);
      toast({ title: isAr ? "تم استبدال النقاط" : "Points redeemed" });
    },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const filtered = (leaderboard ?? []).filter(e =>
    !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.email.toLowerCase().includes(search.toLowerCase())
  );

  function TierBadge({ tier }: { tier: string }) {
    const meta = TIER_META[tier as keyof typeof TIER_META] ?? TIER_META.bronze;
    const Icon = meta.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border`}
        style={{ color: meta.color, backgroundColor: meta.bg, borderColor: meta.color + "40" }}>
        <Icon size={9} />
        {isAr ? meta.labelAr : meta.label}
      </span>
    );
  }

  function ProgressBar({ points, tier }: { points: number; tier: string }) {
    const meta = TIER_META[tier as keyof typeof TIER_META] ?? TIER_META.bronze;
    const tiers = Object.entries(TIER_META);
    const currentIdx = tiers.findIndex(([k]) => k === tier);
    const nextTier = tiers[currentIdx + 1];
    if (!nextTier) return <div className="text-[10px] text-muted-foreground">{isAr ? "أعلى مستوى" : "Max tier"}</div>;
    const [, nextMeta] = nextTier;
    const progress = Math.min(100, ((points - meta.min) / (nextMeta.min - meta.min)) * 100);
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{points} pts</span>
          <span>{nextMeta.min} pts for {isAr ? nextMeta.labelAr : nextMeta.label}</span>
        </div>
        <div className="h-1 rounded-full bg-border overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: nextMeta.color }} />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Star size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">{isAr ? "برنامج الولاء" : "Loyalty Program"}</h1>
          <p className="text-xs text-muted-foreground">{isAr ? "نقاط المكافآت ومستويات العملاء" : "Reward points & customer tiers"}</p>
        </div>
      </div>

      {/* Tier legend */}
      <div className="grid grid-cols-4 gap-2">
        {Object.entries(TIER_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const count = (leaderboard ?? []).filter(e => e.loyalty_tier === key).length;
          return (
            <div key={key} className="p-3 rounded-2xl bg-card border border-border text-center">
              <div className="w-8 h-8 rounded-xl mx-auto mb-1.5 flex items-center justify-center" style={{ backgroundColor: meta.bg }}>
                <Icon size={14} style={{ color: meta.color }} />
              </div>
              <p className="text-sm font-bold" style={{ color: meta.color }}>{count}</p>
              <p className="text-[10px] text-muted-foreground">{isAr ? meta.labelAr : meta.label}</p>
            </div>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={13} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="ps-8 bg-card border-border text-sm h-9" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={isAr ? "البحث عن عميل..." : "Search customer..."} />
      </div>

      {/* Leaderboard */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <TrendingUp size={14} className="text-primary" />
          {isAr ? "قائمة أفضل العملاء" : "Top Customers"} ({filtered.length})
        </h3>
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground border border-dashed border-border rounded-2xl">
            <Users size={24} className="mb-2 opacity-30" />
            <p className="text-sm">{isAr ? "لا يوجد عملاء" : "No customers"}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map((entry, idx) => (
              <motion.button key={entry.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => setSelectedCustomer(entry)}
                className="w-full p-3.5 rounded-2xl bg-card border border-border hover:border-primary/40 transition-all text-start group">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 font-bold text-primary text-sm">
                    {idx < 3 ? ["🥇", "🥈", "🥉"][idx] : (idx + 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{entry.name}</p>
                      <TierBadge tier={entry.loyalty_tier} />
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">{entry.email}</p>
                  </div>
                  <div className="text-end shrink-0">
                    <p className="text-sm font-bold text-primary">{entry.loyalty_points.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground">{isAr ? "نقطة" : "pts"}</p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </div>
              </motion.button>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Customer Detail Dialog */}
      <Dialog open={!!selectedCustomer} onOpenChange={o => !o && setSelectedCustomer(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
          {selectedCustomer && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Star size={16} className="text-primary" />
                  {selectedCustomer.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-background border border-border space-y-2">
                  <div className="flex items-center justify-between">
                    <TierBadge tier={history?.customer.loyalty_tier ?? selectedCustomer.loyalty_tier} />
                    <span className="text-2xl font-bold text-primary">{(history?.customer.loyalty_points ?? selectedCustomer.loyalty_points).toLocaleString()} pts</span>
                  </div>
                  <ProgressBar
                    points={history?.customer.loyalty_points ?? selectedCustomer.loyalty_points}
                    tier={history?.customer.loyalty_tier ?? selectedCustomer.loyalty_tier}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setAwardOpen(true); }} className="flex-1 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-emerald-500/20">
                    <Plus size={13} /> {isAr ? "منح نقاط" : "Award"}
                  </button>
                  <button onClick={() => { setRedeemOpen(true); }} className="flex-1 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-semibold flex items-center justify-center gap-1.5 hover:bg-amber-500/20">
                    <Gift size={13} /> {isAr ? "استبدال" : "Redeem"}
                  </button>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{isAr ? "سجل النقاط" : "Points History"}</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(history?.history ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">{isAr ? "لا يوجد سجل" : "No history"}</p>
                    ) : (
                      (history?.history ?? []).map(h => (
                        <div key={h.id} className="flex items-center justify-between p-2.5 rounded-xl bg-background border border-border">
                          <div>
                            <p className="text-xs font-medium text-foreground capitalize">{h.type} {h.note ? `— ${h.note}` : ""}</p>
                            <p className="text-[10px] text-muted-foreground">{new Date(h.created_at).toLocaleDateString()}</p>
                          </div>
                          <span className={`text-sm font-bold ${h.points > 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {h.points > 0 ? "+" : ""}{h.points}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Award Dialog */}
      <Dialog open={awardOpen} onOpenChange={o => { if (!o) setAwardOpen(false); }}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-emerald-400"><Plus size={14} />{isAr ? "منح نقاط" : "Award Points"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isAr ? "النقاط" : "Points"}</Label>
              <div className="flex items-center gap-2">
                <button onClick={() => setPts(p => Math.max(1, p - 50))} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"><Minus size={14} /></button>
                <Input className="text-center bg-background border-border" type="number" value={pts} onChange={e => setPts(Number(e.target.value))} />
                <button onClick={() => setPts(p => p + 50)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"><Plus size={14} /></button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isAr ? "ملاحظة" : "Note"}</Label>
              <Input className="bg-background border-border" value={note} onChange={e => setNote(e.target.value)} placeholder={isAr ? "سبب المنح..." : "Reason..."} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAwardOpen(false)} className="flex-1 h-10 rounded-xl bg-secondary text-sm">{isAr ? "إلغاء" : "Cancel"}</button>
              <button onClick={() => awardMut.mutate({ points: pts, note })} disabled={awardMut.isPending}
                className="flex-1 h-10 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                {isAr ? "منح" : "Award"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Redeem Dialog */}
      <Dialog open={redeemOpen} onOpenChange={o => { if (!o) setRedeemOpen(false); }}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-amber-400"><Gift size={14} />{isAr ? "استبدال نقاط" : "Redeem Points"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isAr ? "النقاط" : "Points"}</Label>
              <div className="flex items-center gap-2">
                <button onClick={() => setPts(p => Math.max(1, p - 50))} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"><Minus size={14} /></button>
                <Input className="text-center bg-background border-border" type="number" value={pts} onChange={e => setPts(Number(e.target.value))} />
                <button onClick={() => setPts(p => p + 50)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center"><Plus size={14} /></button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isAr ? "ملاحظة" : "Note"}</Label>
              <Input className="bg-background border-border" value={note} onChange={e => setNote(e.target.value)} placeholder={isAr ? "وصف الاستبدال..." : "Redemption description..."} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRedeemOpen(false)} className="flex-1 h-10 rounded-xl bg-secondary text-sm">{isAr ? "إلغاء" : "Cancel"}</button>
              <button onClick={() => redeemMut.mutate({ points: pts, note })} disabled={redeemMut.isPending}
                className="flex-1 h-10 rounded-xl bg-amber-500 text-white text-sm font-semibold disabled:opacity-50">
                {isAr ? "استبدال" : "Redeem"}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
