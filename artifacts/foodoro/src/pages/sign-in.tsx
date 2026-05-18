import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import "@/i18n";

export default function SignInPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      const msg = (err as Error).message || (isAr ? "فشل تسجيل الدخول" : "Login failed");
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center px-4 relative overflow-hidden"
      dir={isAr ? "rtl" : "ltr"}
      data-testid="signin-page"
    >
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#E67E22]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#F39C12]/5 rounded-full blur-3xl pointer-events-none" />

      <button
        onClick={toggleLang}
        className="absolute top-5 end-5 text-xs font-bold text-[#E67E22] border border-[#E67E22]/40 rounded-lg px-3 py-1.5 hover:bg-[#E67E22]/10 transition-colors z-10"
        data-testid="lang-toggle-btn"
      >
        {isAr ? "EN" : "ع"}
      </button>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E67E22] to-[#F39C12] flex items-center justify-center shadow-2xl shadow-[#E67E22]/40">
            <span className="text-white font-black text-3xl select-none">F</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-white tracking-tight">FOODORO</h1>
            <p className="text-sm text-gray-400 mt-1">
              {isAr ? "نظام إدارة المطعم" : "Restaurant Management System"}
            </p>
          </div>
        </div>

        <div className="w-full bg-[#1F2937]/80 backdrop-blur-xl rounded-2xl p-6 flex flex-col gap-4 border border-white/5">
          <div className="text-center">
            <h2 className="text-lg font-bold text-white">
              {isAr ? "مرحباً بعودتك" : "Welcome back"}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {isAr ? "سجّل الدخول إلى مطعمك" : "Sign in to your restaurant"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="signin-form">
            <div className="flex flex-col gap-2">
              <label className="text-xs font-semibold text-gray-300">
                {isAr ? "البريد الإلكتروني" : "Email"}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all"
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
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all"
                data-testid="signin-password-input"
              />
            </div>

            {error && (
              <div
                className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 flex items-start gap-2"
                data-testid="signin-error-msg"
              >
                <span>⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="bg-gradient-to-r from-[#E67E22] to-[#F39C12] hover:from-[#F39C12] hover:to-[#E67E22] disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-3 transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg shadow-[#E67E22]/20"
              data-testid="signin-submit-btn"
            >
              {loading
                ? (isAr ? "جاري الدخول..." : "Signing in...")
                : (isAr ? "تسجيل الدخول" : "Sign In")}
            </button>
          </form>

          <div className="text-center text-xs text-gray-500 pt-2 border-t border-white/5">
            {isAr ? "ليس لديك حساب؟" : "Don't have an account?"}{" "}
            <button
              onClick={() => setLocation("/sign-up")}
              className="text-[#E67E22] hover:text-[#F39C12] font-semibold transition-colors"
              data-testid="signin-goto-signup-btn"
            >
              {isAr ? "أنشئ حسابك الآن" : "Create your account"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
