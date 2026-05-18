import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, X, Delete, Check, KeyRound, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/clerk-shim";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface StaffUser {
  id: number;
  name: string;
  role: string;
  isActive: boolean;
  hasPin?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSwitch: (user: { id: number; name: string; role: string }) => void;
}

function PinDots({ count }: { count: number }) {
  return (
    <div className="flex gap-2 justify-center" dir="ltr">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className={`w-3 h-3 rounded-full border-2 transition-all ${i < count ? "bg-orange-500 border-orange-500 scale-110" : "border-white/40"}`} />
      ))}
    </div>
  );
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-purple-500", owner: "bg-yellow-500", cashier: "bg-blue-500",
  waiter: "bg-green-500", kitchen_staff: "bg-red-500", branch_manager: "bg-indigo-500",
};

export function QuickSwitch({ open, onClose, onSwitch }: Props) {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setPin("");
    setError("");
    setSuccess(false);
    void (async () => {
      const token = await getToken();
      const r = await fetch(`${BASE}/api/users`, {
        headers: { Authorization: `Bearer ${token ?? ""}` },
      });
      if (r.ok) {
        const users = await r.json() as StaffUser[];
        setStaff(users.filter((u) => u.isActive));
      }
    })();
  }, [open]);

  useEffect(() => {
    if (pin.length === 6 && selected) void verifyPin(pin);
  }, [pin]);

  const append = (d: string) => {
    if (loading || pin.length >= 6) return;
    setPin((p) => p + d);
    setError("");
  };
  const del = () => setPin((p) => p.slice(0, -1));

  const verifyPin = async (p: string) => {
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/api/cashier/pin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ pin: p, userId: selected.id }),
      });
      const data = await res.json() as { ok?: boolean; name?: string; role?: string; error?: string };
      if (data.ok) {
        setSuccess(true);
        setTimeout(() => {
          onSwitch({ id: selected.id, name: selected.name, role: selected.role });
          onClose();
        }, 800);
      } else {
        setError(data.error ?? t("quickSwitch.invalidPin"));
        setPin("");
      }
    } catch {
      setError(t("quickSwitch.error"));
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[8000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md text-white overflow-hidden"
          >
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-orange-400" />
                <p className="font-bold">{t("quickSwitch.title")}</p>
              </div>
              <button onClick={onClose} className="text-white/50 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              {!selected ? (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  <p className="text-sm text-white/60 mb-3">{t("quickSwitch.selectUser")}</p>
                  {staff.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => { setSelected(u); setPin(""); setError(""); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-orange-500/20 transition-all text-start"
                    >
                      <div className={`w-9 h-9 rounded-full ${ROLE_COLORS[u.role] ?? "bg-gray-600"} flex items-center justify-center text-sm font-bold shrink-0`}>
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{u.name}</p>
                        <p className="text-xs text-white/50 capitalize">{u.role.replace(/_/g, " ")}</p>
                      </div>
                      {u.hasPin ? (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-medium border border-emerald-500/30">
                          <KeyRound className="w-2.5 h-2.5" /> PIN
                        </span>
                      ) : (
                        <span className="shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 text-[10px] border border-orange-500/30">
                          <KeyRound className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : success ? (
                <div className="flex flex-col items-center gap-4 py-8">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center"
                  >
                    <Check className="w-8 h-8 text-green-400" />
                  </motion.div>
                  <p className="font-semibold">{t("quickSwitch.switched", { name: selected.name })}</p>
                </div>
              ) : !selected.hasPin ? (
                /* ── No PIN set — show warning, block PIN entry ── */
                <div className="flex flex-col items-center gap-5">
                  <button onClick={() => setSelected(null)} className="self-start text-sm text-white/50 hover:text-white flex items-center gap-1">
                    ← {t("quickSwitch.back")}
                  </button>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${ROLE_COLORS[selected.role] ?? "bg-gray-600"} flex items-center justify-center font-bold`}>
                      {selected.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{selected.name}</p>
                      <p className="text-xs text-white/50 capitalize">{selected.role.replace(/_/g, " ")}</p>
                    </div>
                  </div>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full flex flex-col items-center gap-3 p-5 rounded-2xl bg-orange-500/10 border border-orange-500/30"
                  >
                    <AlertTriangle className="w-10 h-10 text-orange-400" />
                    <div className="text-center space-y-1">
                      <p className="font-semibold text-orange-300">
                        {t("quickSwitch.noPinTitle")}
                      </p>
                      <p className="text-xs text-white/60">
                        {t("quickSwitch.noPinDesc")}
                      </p>
                    </div>
                  </motion.div>
                </div>
              ) : (
                /* ── Has PIN — show PIN pad ── */
                <div className="flex flex-col items-center gap-5">
                  <button onClick={() => setSelected(null)} className="self-start text-sm text-white/50 hover:text-white flex items-center gap-1">
                    ← {t("quickSwitch.back")}
                  </button>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full ${ROLE_COLORS[selected.role] ?? "bg-gray-600"} flex items-center justify-center font-bold`}>
                      {selected.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold">{selected.name}</p>
                      <p className="text-xs text-white/50">{t("quickSwitch.enterPin")}</p>
                    </div>
                  </div>

                  <PinDots count={pin.length} />

                  <div className="grid grid-cols-3 gap-2" dir="ltr">
                    {keys.map((k, i) => {
                      if (k === "") return <div key={i} />;
                      if (k === "⌫") return (
                        <button key={i} onClick={del} disabled={loading}
                          className="w-14 h-14 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center">
                          <Delete className="w-4 h-4" />
                        </button>
                      );
                      return (
                        <button key={i} onClick={() => append(k)} disabled={loading}
                          className="w-14 h-14 rounded-xl bg-white/10 hover:bg-orange-500/30 active:scale-95 transition-all text-lg font-semibold">
                          {k}
                        </button>
                      );
                    })}
                  </div>

                  {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="text-red-400 text-sm">{error}</motion.p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
