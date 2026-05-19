import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import type { AuthUser } from "@/contexts/auth";
import {
  RESTAURANT_BUSINESS_TYPES,
  validateBusinessType,
} from "@/lib/business-types";
import "@/i18n";

const TOKEN_KEY = "foodoro-token";
const USER_KEY = "foodoro-user";

export default function SignUpPage() {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<1 | 2>(1);
  const [restaurantName, setRestaurantName] = useState("");
  const [businessType, setBusinessType] = useState("traditional");
  const [businessTypeCustom, setBusinessTypeCustom] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleLang = () => {
    const next = isAr ? "en" : "ar";
    i18n.changeLanguage(next);
    localStorage.setItem("foodoro-lang", next);
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!restaurantName.trim()) {
      setError(isAr ? "اسم المطعم مطلوب" : "Restaurant name is required");
      return;
    }
    const check = validateBusinessType(
      businessType,
      businessTypeCustom,
      isAr ? "ar" : "en",
    );
    if (!check.ok) {
      setError(check.reason ?? (isAr ? "نوع النشاط غير صالح" : "Invalid business type"));
      return;
    }
    setStep(2);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError(isAr ? "كلمة المرور يجب ألا تقل عن 8 أحرف" : "Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError(isAr ? "كلمتا المرور غير متطابقتين" : "Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: fullName.trim(),
          restaurantName: restaurantName.trim(),
          businessType,
          businessTypeCustom: businessType === "other" ? businessTypeCustom.trim() : undefined,
          lang: isAr ? "ar" : "en",
        }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Sign up failed");
      }

      const data = (await res.json()) as { token: string; user: AuthUser };
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      window.location.replace("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-[#0B0F19] flex flex-col items-center justify-center px-4 relative overflow-hidden py-8"
      dir={isAr ? "rtl" : "ltr"}
      data-testid="signup-page"
    >
      <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-[#E67E22]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 w-[400px] h-[400px] bg-[#F39C12]/5 rounded-full blur-3xl pointer-events-none" />

      <button
        onClick={toggleLang}
        className="absolute top-5 end-5 text-xs font-bold text-[#E67E22] border border-[#E67E22]/40 rounded-lg px-3 py-1.5 hover:bg-[#E67E22]/10 transition-colors z-10"
        data-testid="lang-toggle-btn"
      >
        {isAr ? "EN" : "ع"}
      </button>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#E67E22] to-[#F39C12] flex items-center justify-center shadow-2xl shadow-[#E67E22]/40">
            <span className="text-white font-black text-3xl select-none">F</span>
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black text-white tracking-tight">FOODPRO</h1>
            <p className="text-sm text-gray-400 mt-1">
              {isAr ? "أنشئ حساب مطعمك" : "Create your restaurant"}
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 w-full">
          <div className="flex-1 h-1 rounded-full bg-[#E67E22]" />
          <span className="text-xs text-gray-500 px-2">
            {step}/2
          </span>
          <div className={`flex-1 h-1 rounded-full ${step === 2 ? "bg-[#E67E22]" : "bg-white/10"}`} />
        </div>

        <div className="w-full bg-[#1F2937]/80 backdrop-blur-xl rounded-2xl p-6 border border-white/5">
          {step === 1 ? (
            <form onSubmit={handleNext} className="flex flex-col gap-4" data-testid="signup-step1-form">
              <div className="text-center mb-1">
                <h2 className="text-lg font-bold text-white">
                  {isAr ? "أخبرنا عن مطعمك" : "Tell us about your restaurant"}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {isAr
                    ? "ستكون أنت المدير الرئيسي لهذا الحساب"
                    : "You will be the primary owner of this account"}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-300">
                  {isAr ? "اسم المطعم" : "Restaurant name"}
                </label>
                <input
                  type="text"
                  value={restaurantName}
                  onChange={(e) => setRestaurantName(e.target.value)}
                  placeholder={isAr ? "مطعم البيت" : "My Restaurant"}
                  required
                  className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all"
                  data-testid="signup-restaurant-input"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-300">
                  {isAr ? "نوع النشاط المطعمي" : "Restaurant business type"}
                </label>
                <select
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value)}
                  required
                  className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all"
                  data-testid="signup-business-type-select"
                >
                  {RESTAURANT_BUSINESS_TYPES.map((bt) => (
                    <option key={bt.slug} value={bt.slug} className="bg-[#1F2937]">
                      {isAr ? bt.ar : bt.en}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  {isAr
                    ? "FOODPRO مخصص للمطاعم فقط — لن نقبل أي نشاط آخر."
                    : "FOODPRO is for restaurants only — non-restaurant businesses will be rejected."}
                </p>
              </div>

              {businessType === "other" && (
                <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <label className="text-xs font-semibold text-gray-300">
                    {isAr ? "اكتب نوع نشاطك (مطعمي فقط)" : "Describe your restaurant"}
                  </label>
                  <input
                    type="text"
                    value={businessTypeCustom}
                    onChange={(e) => setBusinessTypeCustom(e.target.value)}
                    placeholder={isAr ? "مطعم منسف أردني، كنافة نابلسية…" : "Mediterranean Bistro, Mansaf restaurant…"}
                    maxLength={80}
                    className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all"
                    data-testid="signup-business-type-custom-input"
                  />
                </div>
              )}

              {error && (
                <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  ⚠️ {error}
                </div>
              )}

              <button
                type="submit"
                className="bg-gradient-to-r from-[#E67E22] to-[#F39C12] text-white font-semibold rounded-xl px-4 py-3 transition-all hover:scale-[1.01] shadow-lg shadow-[#E67E22]/20"
                data-testid="signup-next-btn"
              >
                {isAr ? "التالي" : "Next"} →
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" data-testid="signup-step2-form">
              <div className="text-center mb-1">
                <h2 className="text-lg font-bold text-white">
                  {isAr ? "بيانات حسابك" : "Your account"}
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  {isAr
                    ? `كصاحب ${restaurantName} ستملك صلاحيات كاملة`
                    : `As owner of ${restaurantName} you'll have full access`}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-300">
                  {isAr ? "الاسم الكامل" : "Full name"}
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all"
                  data-testid="signup-name-input"
                />
              </div>

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
                  data-testid="signup-email-input"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-300">
                  {isAr ? "كلمة المرور (8 أحرف فأكثر)" : "Password (min 8 chars)"}
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all"
                  data-testid="signup-password-input"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-gray-300">
                  {isAr ? "تأكيد كلمة المرور" : "Confirm password"}
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="bg-[#0B0F19] border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all"
                  data-testid="signup-confirm-input"
                />
              </div>

              {error && (
                <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  ⚠️ {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setStep(1); setError(null); }}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl px-4 py-3 transition-colors"
                  data-testid="signup-back-btn"
                >
                  ← {isAr ? "رجوع" : "Back"}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-[2] bg-gradient-to-r from-[#E67E22] to-[#F39C12] disabled:opacity-60 text-white font-semibold rounded-xl px-4 py-3 transition-all hover:scale-[1.01] shadow-lg shadow-[#E67E22]/20"
                  data-testid="signup-submit-btn"
                >
                  {loading
                    ? (isAr ? "جاري الإنشاء..." : "Creating...")
                    : (isAr ? "إنشاء الحساب" : "Create Account")}
                </button>
              </div>
            </form>
          )}

          <div className="text-center text-xs text-gray-500 pt-4 mt-4 border-t border-white/5">
            {isAr ? "لديك حساب بالفعل؟" : "Already have an account?"}{" "}
            <button
              onClick={() => setLocation("/sign-in")}
              className="text-[#E67E22] hover:text-[#F39C12] font-semibold transition-colors"
              data-testid="signup-goto-signin-btn"
            >
              {isAr ? "سجّل الدخول" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
