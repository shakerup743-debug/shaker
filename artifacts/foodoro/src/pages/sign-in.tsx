import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth, type AuthUser } from "@/contexts/auth";
import "@/i18n";

const TOKEN_KEY = "foodoro-token";
const USER_KEY = "foodoro-user";

export default function SignInPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { login } = useAuth();
  const [, setLocation] = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [redirectingToGoogle, setRedirectingToGoogle] = useState(false);
  const processedRef = useRef(false);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("session_id=") || processedRef.current) return;
    processedRef.current = true;

    const match = hash.match(/session_id=([^&]+)/);
    const sessionId = match?.[1];
    if (!sessionId) return;

    setGoogleLoading(true);

    (async () => {
      try {
        const res = await fetch("/api/auth/google/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Google login failed");
        }
        const data = (await res.json()) as { token: string; user: AuthUser };
        localStorage.setItem(TOKEN_KEY, data.token);
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        window.location.replace("/");
      } catch (err) {
        setError((err as Error).message);
        setGoogleLoading(false);
        // Clean hash so user can retry
        window.history.replaceState({}, "", window.location.pathname);
      }
    })();
  }, []);

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

  const handleGoogleLogin = () => {
    setError(null);
    setRedirectingToGoogle(true);
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/sign-in";
    setTimeout(() => {
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    }, 400);
  };

  if (googleLoading || redirectingToGoogle) {
    return (
      <div
        className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center px-4 relative overflow-hidden"
        dir={isAr ? "rtl" : "ltr"}
        data-testid="signin-google-loading"
      >
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#E67E22]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col items-center gap-6 max-w-sm text-center">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-2xl">
              <svg width="40" height="40" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
                <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
              </svg>
            </div>
            <div className="absolute inset-0 w-20 h-20 border-2 border-[#E67E22] border-t-transparent rounded-full animate-spin" />
          </div>
          <div>
            <p className="text-white text-base font-semibold">
              {redirectingToGoogle
                ? (isAr ? "جاري التحويل إلى Google..." : "Redirecting to Google...")
                : (isAr ? "جاري تسجيل دخولك..." : "Signing you in...")}
            </p>
            <p className="text-gray-400 text-xs mt-2">
              {isAr
                ? "اختر حساب Google ثم سيعيدك للوحة التحكم"
                : "Choose your Google account, then you'll be returned to your dashboard"}
            </p>
          </div>
        </div>
      </div>
    );
  }

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
              {isAr ? "سجّل الدخول للوصول إلى لوحة التحكم" : "Sign in to access your dashboard"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-50 text-gray-800 font-semibold rounded-xl px-4 py-3 transition-all hover:scale-[1.01] active:scale-[0.99] shadow-lg"
            data-testid="signin-google-btn"
          >
            <svg width="20" height="20" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
              <path d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
              <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
              <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05" />
              <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
            </svg>
            {isAr ? "تسجيل الدخول بـ Google" : "Sign in with Google"}
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-xs text-gray-500 font-medium">{isAr ? "أو" : "OR"}</span>
            <div className="flex-1 h-px bg-white/10" />
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
              {isAr ? "أنشئ مطعمك" : "Create your restaurant"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
