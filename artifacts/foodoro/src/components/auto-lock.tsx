import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Delete } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/clerk-shim";

const IDLE_MS = 5 * 60 * 1000;
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Props {
  userId: number;
  userName: string;
  onUnlock: () => void;
}

function PinPad({ onSubmit }: { onSubmit: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const append = (d: string) => {
    if (pin.length < 6) setPin((p) => p + d);
  };
  const del = () => setPin((p) => p.slice(0, -1));

  useEffect(() => {
    if (pin.length === 6) {
      onSubmit(pin);
      setPin("");
    }
  }, [pin, onSubmit]);

  const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-3" dir="ltr">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
              i < pin.length ? "bg-orange-500 border-orange-500 scale-110" : "border-white/40"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3" dir="ltr">
        {keys.map((k, i) => {
          if (k === "") return <div key={i} />;
          if (k === "⌫") {
            return (
              <button
                key={i}
                onClick={del}
                className="w-16 h-16 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 transition-all flex items-center justify-center text-white"
              >
                <Delete className="w-5 h-5" />
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => append(k)}
              className="w-16 h-16 rounded-2xl bg-white/10 hover:bg-orange-500/40 active:scale-95 transition-all text-white text-xl font-semibold"
            >
              {k}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function AutoLock({ userId, userName, onUnlock }: Props) {
  const { t } = useTranslation();
  const { getToken } = useAuth();
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setLocked(true), IDLE_MS);
  }, []);

  useEffect(() => {
    const events = ["mousemove", "keydown", "pointerdown", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  const handlePin = async (pin: string) => {
    setError("");
    try {
      const token = await getToken();
      const res = await fetch(`${BASE}/api/cashier/pin-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ pin, userId }),
      });
      if (res.ok) {
        setLocked(false);
        resetTimer();
        onUnlock();
      } else {
        const d = await res.json() as { error?: string };
        setError(d.error ?? t("autoLock.invalidPin"));
      }
    } catch {
      setError(t("autoLock.error"));
    }
  };

  return (
    <AnimatePresence>
      {locked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gray-950/95 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center gap-6 text-white"
          >
            <div className="w-20 h-20 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Lock className="w-9 h-9 text-orange-400" />
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold">{t("autoLock.title")}</p>
              <p className="text-white/60 mt-1">{userName}</p>
              <p className="text-sm text-white/40 mt-1">{t("autoLock.enterPin")}</p>
            </div>

            <PinPad onSubmit={(pin) => void handlePin(pin)} />

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-red-400 text-sm"
              >
                {error}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
