import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, X, Eye, EyeOff, KeyRound, Delete } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface SmartLockOptions {
  action: string;         // machine key e.g. "discount", "cancel_order"
  labelAr: string;
  labelEn: string;
  managerId: number;
  managerName: string;
}

interface Props {
  options: SmartLockOptions | null;
  onApproved: () => void;
  onClose: () => void;
}

type Mode = "pin" | "password";

function PinGrid({ onSubmit, loading }: { onSubmit: (v: string) => void; loading: boolean }) {
  const [pin, setPin] = useState("");
  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  const append = (d: string) => {
    if (loading) return;
    if (pin.length < 6) setPin((p) => p + d);
  };
  const del = () => setPin((p) => p.slice(0, -1));

  const handleSubmit = () => {
    if (pin.length === 6) { onSubmit(pin); setPin(""); }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-2" dir="ltr">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`w-3 h-3 rounded-full border-2 transition-all ${i < pin.length ? "bg-orange-500 border-orange-500" : "border-muted-foreground/40"}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2" dir="ltr">
        {keys.map((k, i) => {
          if (k === "") return <div key={i} />;
          if (k === "⌫") return (
            <button key={i} onClick={del} disabled={loading}
              className="w-14 h-14 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition-all flex items-center justify-center text-foreground">
              <Delete className="w-4 h-4" />
            </button>
          );
          return (
            <button key={i} onClick={() => append(k)} disabled={loading}
              className="w-14 h-14 rounded-xl bg-muted hover:bg-orange-500/20 active:scale-95 transition-all font-semibold text-lg">
              {k}
            </button>
          );
        })}
      </div>
      <Button className="w-full" onClick={handleSubmit} disabled={pin.length !== 6 || loading}>
        {loading ? "..." : "✓"}
      </Button>
    </div>
  );
}

export function SmartLockModal({ options, onApproved, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [mode, setMode] = useState<Mode>("pin");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const verify = async (pin?: string, pwd?: string) => {
    if (!options) return;
    setLoading(true);
    setError("");
    try {
      const token = localStorage.getItem("foodoro-jwt");
      const res = await fetch(`${BASE}/api/cashier/verify-manager`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin, password: pwd, userId: options.managerId, action: options.action }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (data.ok) {
        onApproved();
      } else {
        setError(data.error ?? t("smartLock.invalid"));
      }
    } catch {
      setError(t("smartLock.error"));
    } finally {
      setLoading(false);
    }
  };

  const label = isAr ? options?.labelAr : options?.labelEn;

  return (
    <AnimatePresence>
      {options && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-background rounded-2xl shadow-2xl w-full max-w-sm p-6"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="font-bold text-sm">{t("smartLock.title")}</p>
                  <p className="text-xs text-muted-foreground">{t("smartLock.action")}: <span className="text-orange-500">{label}</span></p>
                </div>
              </div>
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              {t("smartLock.desc", { name: options.managerName })}
            </p>

            {/* Mode toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setMode("pin")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "pin" ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                PIN
              </button>
              <button
                onClick={() => setMode("password")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === "password" ? "bg-orange-500 text-white" : "bg-muted text-muted-foreground"}`}
              >
                {t("smartLock.password")}
              </button>
            </div>

            {mode === "pin" ? (
              <PinGrid onSubmit={(pin) => void verify(pin)} loading={loading} />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <input
                    type={show ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t("smartLock.passwordPlaceholder")}
                    className="w-full px-3 py-2 rounded-lg border bg-background text-sm pr-10"
                    onKeyDown={(e) => { if (e.key === "Enter") void verify(undefined, password); }}
                  />
                  <button onClick={() => setShow(!show)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Button onClick={() => void verify(undefined, password)} disabled={!password || loading} className="w-full">
                  {loading ? "..." : t("smartLock.verify")}
                </Button>
              </div>
            )}

            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="mt-3 text-sm text-red-500 text-center">
                {error}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Hook for easy usage anywhere in the app
import { useState as useStateHook } from "react";

export function useSmartLock() {
  const [options, setOptions] = useState<SmartLockOptions | null>(null);

  const request = (opts: SmartLockOptions) => new Promise<boolean>((resolve) => {
    setOptions({ ...opts, _resolve: resolve } as SmartLockOptions & { _resolve: (v: boolean) => void });
  });

  const props = {
    options,
    onApproved: () => {
      (options as SmartLockOptions & { _resolve?: (v: boolean) => void })?._resolve?.(true);
      setOptions(null);
    },
    onClose: () => {
      (options as SmartLockOptions & { _resolve?: (v: boolean) => void })?._resolve?.(false);
      setOptions(null);
    },
  };

  return { request, props };
}
