import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mail, Lock, ChefHat, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";

const DEMO_ACCOUNTS = [
  { role: "admin", email: "admin@foodoro.com", password: "Admin@1234", label: "مدير النظام / Admin" },
  { role: "cashier", email: "cashier@foodoro.com", password: "Cash@1234", label: "كاشير / Cashier" },
  { role: "kitchen_staff", email: "kitchen@foodoro.com", password: "Kit@1234", label: "مطبخ / Kitchen" },
  { role: "inventory_manager", email: "inventory@foodoro.com", password: "Inv@1234", label: "مخزون / Inventory" },
];

export default function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (acc: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-lg shadow-primary/30">
              <ChefHat size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-black text-foreground tracking-tight">FOODORO</h1>
            <p className="text-sm text-muted-foreground mt-1">POS & Kitchen Management</p>
          </div>

          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
            <h2 className="text-lg font-semibold text-foreground mb-6 text-center">{t("auth.signIn")}</h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("auth.email")}</label>
                <div className="relative">
                  <Mail size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="admin@foodoro.com"
                    data-testid="input-email"
                    className="w-full h-11 ps-9 pe-4 rounded-xl bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">{t("auth.password")}</label>
                <div className="relative">
                  <Lock size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type={showPwd ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    data-testid="input-password"
                    className="w-full h-11 ps-9 pe-10 rounded-xl bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd(!showPwd)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center"
                >
                  {error}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={loading}
                data-testid="button-login"
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
              >
                {loading ? t("auth.signingIn") : t("auth.signIn")}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-border">
              <p className="text-[11px] text-muted-foreground text-center mb-3">
                {t("auth.demoAccounts")}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_ACCOUNTS.map((acc) => (
                  <button
                    key={acc.role}
                    type="button"
                    onClick={() => fillDemo(acc)}
                    className="p-2 rounded-xl bg-background border border-border text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all text-start leading-tight"
                  >
                    <span className="font-medium text-foreground block">{acc.label}</span>
                    <span className="opacity-60">{acc.email}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
