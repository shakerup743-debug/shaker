import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import "@/i18n";

export default function SignInPage() {
  const { i18n, t } = useTranslation();
  const isAr = i18n.language === "ar";
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("admin@foodoro.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleLang = () => {
    const next = isAr ? "en" : "ar";
    i18n.changeLanguage(next);
    localStorage.setItem("foodoro-lang", next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      setLocation("/");
    } catch (err) {
      const msg = (err as Error).message || "Login failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#111827] flex flex-col items-center justify-center px-4 relative"
      dir={isAr ? "rtl" : "ltr"}
      data-testid="signin-page"
    >
      <button
        onClick={toggleLang}
        className="absolute top-5 end-5 text-xs font-bold text-[#E67E22] border border-[#E67E22]/40 rounded-lg px-3 py-1.5 hover:bg-[#E67E22]/10 transition-colors z-10"
        data-testid="lang-toggle-btn"
      >
        {isAr ? "EN" : "ع"}
      </button>

      <div className="w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#E67E22] flex items-center justify-center shadow-xl shadow-[#E67E22]/30">
            <span className="text-white font-black text-3xl select-none">F</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-white tracking-tight">FOODORO</h1>
            <p className="text-sm text-gray-400 mt-1">
              {isAr ? "نظام إدارة المطعم" : "Restaurant Management System"}
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="w-full bg-[#1F2937] rounded-2xl p-6 flex flex-col gap-4"
          data-testid="signin-form"
        >
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-300">
              {isAr ? "البريد الإلكتروني" : "Email"}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-[#111827] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E67E22] transition-colors"
              data-testid="signin-email-input"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-300">
              {isAr ? "كلمة المرور" : "Password"}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="bg-[#111827] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E67E22] transition-colors"
              data-testid="signin-password-input"
            />
          </div>

          {error && (
            <div
              className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
              data-testid="signin-error-msg"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="bg-[#E67E22] hover:bg-[#F39C12] disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-3 transition-colors"
            data-testid="signin-submit-btn"
          >
            {loading
              ? (isAr ? "جاري الدخول..." : "Signing in...")
              : (isAr ? "تسجيل الدخول" : "Sign In")}
          </button>

          <div className="text-center text-xs text-gray-500 pt-2 border-t border-white/5">
            {isAr ? "حساب تجريبي:" : "Demo account:"}{" "}
            <span className="text-gray-400">admin@foodoro.local / admin123</span>
          </div>
        </form>
      </div>
    </div>
  );
}
