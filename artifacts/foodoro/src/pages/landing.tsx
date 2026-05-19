import { useState, useEffect, type FormEvent } from "react";
import { useLocation } from "wouter";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import {
  ShoppingCart, ChefHat, Boxes, QrCode, BarChart3, Sparkles,
  CheckCircle2, ArrowRight, Star, Clock, Shield, Zap,
  Building2, Phone, User, Send, X, Globe, MenuIcon,
} from "lucide-react";

/**
 * FOODPRO — Marketing landing page.
 *
 * ⚠️ STRICT BUSINESS RULE — DO NOT MODIFY WITHOUT APPROVAL:
 *   This page MUST NEVER expose any direct contact channel.
 *   - No phone number (mobile or landline)
 *   - No WhatsApp number / wa.me link / WhatsApp icon
 *   - No "Call us" / "Contact via WhatsApp" buttons
 *   - No tel: links anywhere
 *   The ONLY allowed contact channel is the LeadForm at the bottom of the page.
 *   Sales team will reach out to leads manually.
 */

const ORANGE = "#FF6B35";
const NAVY = "#1A2C4E";

// ──────────────────────────────────────────────────────────────────────────
//  Reusable bits
// ──────────────────────────────────────────────────────────────────────────

const fadeUp = {
  initial: { opacity: 0, y: 32 },
  whileInView: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const },
  viewport: { once: true, margin: "-80px" },
};

function SectionTitle({ kicker, title, subtitle }: { kicker?: string; title: string; subtitle?: string }) {
  return (
    <div className="text-center max-w-3xl mx-auto mb-12 lg:mb-16">
      {kicker && (
        <motion.span
          {...fadeUp}
          className="inline-block text-xs font-bold tracking-[0.2em] uppercase mb-3 px-3 py-1 rounded-full"
          style={{ color: ORANGE, background: `${ORANGE}14` }}
        >
          {kicker}
        </motion.span>
      )}
      <motion.h2
        {...fadeUp}
        transition={{ ...fadeUp.transition, delay: 0.05 }}
        className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.15]"
        style={{ color: NAVY }}
      >
        {title}
      </motion.h2>
      {subtitle && (
        <motion.p
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.1 }}
          className="text-base sm:text-lg text-slate-600 mt-4 leading-relaxed"
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  Top navigation
// ──────────────────────────────────────────────────────────────────────────

function TopNav({ onCtaClick }: { onCtaClick: () => void }) {
  const [, setLocation] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 24);
    h();
    window.addEventListener("scroll", h, { passive: true });
    return () => window.removeEventListener("scroll", h);
  }, []);

  const navItems = [
    { href: "#features",      label: "المميزات" },
    { href: "#how",           label: "كيف يعمل" },
    { href: "#pricing",       label: "الأسعار" },
    { href: "#contact",       label: "تواصل" },
  ];

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/85 backdrop-blur-xl border-b border-slate-200/60 shadow-sm"
          : "bg-transparent"
      }`}
      data-testid="landing-topnav"
    >
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 lg:h-20 flex items-center justify-between">
        <div className="flex items-center gap-2.5 select-none">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: `linear-gradient(135deg, ${ORANGE}, #FF8C5A)`, boxShadow: `0 8px 24px -8px ${ORANGE}66` }}
          >
            <span className="text-white font-black text-lg">F</span>
          </div>
          <span className="font-black text-xl tracking-tight" style={{ color: scrolled ? NAVY : "#fff" }}>
            FOODPRO
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden lg:flex items-center gap-8">
          {navItems.map((n) => (
            <a
              key={n.href}
              href={n.href}
              className={`text-sm font-medium transition-colors ${scrolled ? "text-slate-700 hover:text-[color:var(--n)]" : "text-white/85 hover:text-white"}`}
              style={{ ["--n" as string]: NAVY }}
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 lg:gap-3">
          <button
            onClick={() => setLocation("/sign-in")}
            className={`hidden sm:inline-flex text-sm font-semibold px-4 py-2 rounded-lg transition ${
              scrolled ? "text-slate-700 hover:bg-slate-100" : "text-white/90 hover:bg-white/10"
            }`}
            data-testid="landing-signin-btn"
          >
            تسجيل الدخول
          </button>
          <button
            onClick={onCtaClick}
            className="group inline-flex items-center gap-1.5 text-sm font-bold text-white rounded-lg px-4 lg:px-5 py-2 lg:py-2.5 transition shadow-lg shadow-[#FF6B35]/30 hover:shadow-[#FF6B35]/50 hover:-translate-y-px"
            style={{ background: ORANGE }}
            data-testid="landing-nav-cta"
          >
            احصل على النظام
            <ArrowRight className="w-4 h-4 rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5 transition" />
          </button>
          <button
            onClick={() => setMobileOpen((s) => !s)}
            className={`lg:hidden p-2 rounded-lg ${scrolled ? "text-slate-700" : "text-white"}`}
            aria-label="menu"
            data-testid="landing-mobile-menu-btn"
          >
            <MenuIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="lg:hidden bg-white border-t border-slate-200 shadow-lg"
          >
            <div className="px-5 py-4 flex flex-col gap-1">
              {navItems.map((n) => (
                <a key={n.href} href={n.href} onClick={() => setMobileOpen(false)}
                   className="px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-50 font-medium">
                  {n.label}
                </a>
              ))}
              <button
                onClick={() => { setMobileOpen(false); setLocation("/sign-in"); }}
                className="text-start px-3 py-2.5 rounded-lg text-slate-700 hover:bg-slate-50 font-medium"
              >
                تسجيل الدخول
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  HERO
// ──────────────────────────────────────────────────────────────────────────

function Hero({ onCtaClick }: { onCtaClick: () => void }) {
  const { scrollY } = useScroll();
  const yBg = useTransform(scrollY, [0, 600], [0, 120]);
  const yBlob1 = useTransform(scrollY, [0, 600], [0, -80]);

  return (
    <section
      className="relative pt-32 pb-24 lg:pt-40 lg:pb-32 overflow-hidden text-white"
      style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #122042 60%, #0f1b3a 100%)` }}
    >
      {/* animated blobs */}
      <motion.div
        style={{ y: yBlob1, background: `radial-gradient(circle, ${ORANGE}33 0%, transparent 70%)` }}
        className="absolute -top-32 -end-32 w-[480px] h-[480px] rounded-full blur-3xl pointer-events-none"
      />
      <motion.div
        style={{ y: yBg, background: `radial-gradient(circle, #4A6FA5 0%, transparent 70%)` }}
        className="absolute top-32 -start-40 w-[420px] h-[420px] rounded-full blur-3xl opacity-40 pointer-events-none"
      />

      {/* grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.7) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.7) 1px,transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      <div className="relative max-w-7xl mx-auto px-5 sm:px-8">
        <div className="grid lg:grid-cols-12 gap-12 items-center">
          {/* TEXT */}
          <div className="lg:col-span-7 text-center lg:text-start">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide px-3 py-1.5 rounded-full mb-6 border"
              style={{ borderColor: `${ORANGE}55`, color: ORANGE, background: `${ORANGE}11` }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>الجيل الجديد من أنظمة إدارة المطاعم</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.05 }}
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-black tracking-tight leading-[1.05]"
            >
              شغّل مطعمك بالكامل
              <br />
              <span style={{ color: ORANGE }}>من شاشة واحدة</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="text-base sm:text-lg lg:text-xl text-slate-300 mt-6 max-w-2xl mx-auto lg:mx-0 leading-relaxed"
            >
              نظام متكامل لإدارة المطاعم —{" "}
              <span className="text-white font-semibold">نقطة بيع، شاشة مطبخ، إدارة مخزون، تقارير تحليلية، ومساعد ذكاء اصطناعي</span>
              — يعمل من أي جهاز ويُجهّز خلال 24 ساعة.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="flex flex-col sm:flex-row gap-3 mt-9 justify-center lg:justify-start"
            >
              <button
                onClick={onCtaClick}
                data-testid="hero-cta"
                className="group inline-flex items-center justify-center gap-2 text-base font-bold text-white rounded-2xl px-7 py-4 transition shadow-2xl shadow-[#FF6B35]/40 hover:shadow-[#FF6B35]/60 hover:-translate-y-0.5"
                style={{ background: ORANGE }}
              >
                احصل على النظام الآن
                <ArrowRight className="w-5 h-5 rtl:rotate-180 group-hover:translate-x-1 rtl:group-hover:-translate-x-1 transition" />
              </button>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 text-base font-semibold text-white/90 rounded-2xl px-7 py-4 border border-white/15 hover:bg-white/5 transition"
              >
                اكتشف المميزات
              </a>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 mt-8 text-sm text-slate-400"
            >
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" style={{ color: ORANGE }} /> 14 يوم مجاناً</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" style={{ color: ORANGE }} /> بدون بطاقة ائتمان</div>
              <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" style={{ color: ORANGE }} /> دعم بالعربية</div>
            </motion.div>
          </div>

          {/* MOCK DASHBOARD PREVIEW */}
          <motion.div
            initial={{ opacity: 0, y: 24, rotateY: 6 }}
            animate={{ opacity: 1, y: 0, rotateY: 0 }}
            transition={{ duration: 0.9, delay: 0.2 }}
            className="lg:col-span-5 relative"
            style={{ perspective: 1200 }}
          >
            <div className="absolute inset-0 -m-4 rounded-3xl blur-2xl opacity-50"
              style={{ background: `linear-gradient(135deg, ${ORANGE}55, transparent 70%)` }} />
            <div className="relative rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.02] backdrop-blur-md p-3 shadow-2xl">
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="rounded-xl bg-[#0B0F19] border border-white/5 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" style={{ color: ORANGE }} />
                    <span className="text-white text-sm font-semibold">نقطة البيع</span>
                  </div>
                  <span className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> متصل
                  </span>
                </div>
                <div className="p-4 grid grid-cols-3 gap-2">
                  {[
                    { name: "برجر",   price: "32 ر.س", c: "#EF4444" },
                    { name: "بيتزا",   price: "45 ر.س", c: "#F59E0B" },
                    { name: "سلطة",   price: "18 ر.س", c: "#10B981" },
                    { name: "شاورما", price: "22 ر.س", c: "#8B5CF6" },
                    { name: "عصير",   price: "12 ر.س", c: "#3B82F6" },
                    { name: "كنافة",   price: "25 ر.س", c: "#EC4899" },
                  ].map((p, i) => (
                    <motion.div
                      key={p.name}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 + i * 0.06 }}
                      className="rounded-lg p-2.5 bg-white/[0.04] border border-white/5 hover:border-[#FF6B35]/40 transition cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-md mb-2" style={{ background: p.c }} />
                      <div className="text-white text-xs font-semibold">{p.name}</div>
                      <div className="text-slate-400 text-[10px]">{p.price}</div>
                    </motion.div>
                  ))}
                </div>
                <div className="px-4 py-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
                  <span className="text-slate-400 text-xs">الإجمالي</span>
                  <span className="text-white font-bold text-lg">154 <span className="text-xs text-slate-400 font-normal">ر.س</span></span>
                </div>
              </div>
            </div>

            {/* floating stats */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              className="absolute -top-5 -start-4 lg:-start-12 rounded-xl bg-white text-slate-900 shadow-2xl px-3.5 py-2.5 hidden md:block"
            >
              <div className="text-[10px] text-slate-500 font-semibold">مبيعات اليوم</div>
              <div className="text-lg font-black flex items-center gap-1">
                12,847 <span className="text-[10px] text-emerald-600 font-bold">+24%</span>
              </div>
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1 }}
              className="absolute -bottom-5 -end-4 lg:-end-10 rounded-xl bg-white text-slate-900 shadow-2xl px-3.5 py-2.5 hidden md:block"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: `${ORANGE}22` }}>
                  <ChefHat className="w-4 h-4" style={{ color: ORANGE }} />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-semibold">طلبات بالمطبخ</div>
                  <div className="text-base font-black">8 طلبات</div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  FEATURES
// ──────────────────────────────────────────────────────────────────────────

const FEATURES = [
  { icon: ShoppingCart, title: "نقطة البيع POS",      desc: "واجهة سريعة وحديثة، تعمل بالشاشة اللمسية مع الإيصال الفوري وطباعة بلوتوث." },
  { icon: ChefHat,      title: "شاشة المطبخ KDS",      desc: "ربط مباشر بين الكاشير والمطبخ، تنبيهات حسب الأولوية، وحالة كل طلب لحظياً." },
  { icon: Boxes,        title: "إدارة المخزون",        desc: "تنبيهات نفاد، ربط المخزون بالأصناف، تقارير الهدر، ومتعدد الفروع." },
  { icon: QrCode,       title: "QR Menu / طلبات ذاتية", desc: "العميل يطلب من جواله مباشرة، يصل الطلب للكاشير والمطبخ فوراً." },
  { icon: BarChart3,    title: "تقارير وتحليلات",      desc: "أكثر الأصناف مبيعاً، الأرباح، الذروة الزمنية، وأداء كل فرع وكاشير." },
  { icon: Sparkles,     title: "مساعد ذكاء اصطناعي",   desc: "ينصحك في هندسة القائمة، تحسين الأسعار، وتحليل الأرباح لحظياً." },
];

function Features() {
  return (
    <section id="features" className="relative py-20 lg:py-28 bg-slate-50">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionTitle
          kicker="ما يميزنا"
          title="كل ما يحتاجه مطعمك في منصة واحدة"
          subtitle="من نقطة البيع حتى تحليلات الذكاء الاصطناعي — لن تحتاج أي نظام إضافي."
        />

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
              className="group relative bg-white rounded-2xl p-6 lg:p-7 border border-slate-200/70 hover:border-[#FF6B35]/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-200/50 transition-all duration-300"
              data-testid={`feature-card-${i}`}
            >
              <div
                className="absolute inset-x-0 top-0 h-1 rounded-t-2xl opacity-0 group-hover:opacity-100 transition"
                style={{ background: `linear-gradient(90deg, ${ORANGE}, #FF8C5A)` }}
              />
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center mb-5"
                style={{ background: `${ORANGE}14`, color: ORANGE }}
              >
                <f.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg lg:text-xl font-bold mb-2" style={{ color: NAVY }}>
                {f.title}
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  HOW IT WORKS
// ──────────────────────────────────────────────────────────────────────────

function HowItWorks({ onCtaClick }: { onCtaClick: () => void }) {
  const steps = [
    { n: "1", title: "تواصل معنا", desc: "عبّئ نموذج التواصل وسيتم الرد عليك في أقل من ساعة عمل." },
    { n: "2", title: "نُجهّز نظامك",  desc: "نقوم بإعداد الحساب، الفروع، الأصناف، والتدريب لفريقك." },
    { n: "3", title: "ابدأ التشغيل",  desc: "نظامك جاهز خلال 24 ساعة، مع دعم مستمر بعد الإطلاق." },
  ];

  return (
    <section id="how" className="relative py-20 lg:py-28" style={{ background: "#fff" }}>
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionTitle kicker="كيف يعمل" title="3 خطوات بسيطة، وابدأ" />

        <div className="relative grid md:grid-cols-3 gap-6 lg:gap-8">
          {/* connector line on desktop */}
          <div className="absolute hidden md:block top-9 inset-x-12 h-px"
               style={{ background: `linear-gradient(90deg, transparent, ${ORANGE}55, transparent)` }} />

          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.12 }}
              className="relative text-center md:text-start"
            >
              <div
                className="relative z-10 mx-auto md:mx-0 w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black mb-5 shadow-lg"
                style={{ background: `linear-gradient(135deg, ${ORANGE}, #FF8C5A)`, color: "#fff", boxShadow: `0 12px 30px -8px ${ORANGE}66` }}
              >
                {s.n}
              </div>
              <h3 className="text-xl font-bold mb-2" style={{ color: NAVY }}>{s.title}</h3>
              <p className="text-slate-600 leading-relaxed">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div {...fadeUp} className="text-center mt-14">
          <button
            onClick={onCtaClick}
            data-testid="how-cta"
            className="inline-flex items-center gap-2 text-base font-bold text-white rounded-2xl px-7 py-3.5 transition shadow-xl hover:-translate-y-0.5"
            style={{ background: ORANGE }}
          >
            ابدأ خطوتك الأولى الآن
            <ArrowRight className="w-5 h-5 rtl:rotate-180" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  FREE TRIAL
// ──────────────────────────────────────────────────────────────────────────

function FreeTrial({ onCtaClick }: { onCtaClick: () => void }) {
  const items = [
    { icon: Clock,  title: "14 يوماً مجاناً",      desc: "جرّب كل المميزات بدون أي التزام." },
    { icon: Shield, title: "بدون بطاقة ائتمان",   desc: "لا نطلب أي بيانات دفع لبدء التجربة." },
    { icon: Zap,    title: "جاهز خلال 24 ساعة",   desc: "نُجهّز نظامك ونُسلّمك خلال يوم واحد." },
  ];

  return (
    <section className="relative py-20 lg:py-28 overflow-hidden text-white"
             style={{ background: `linear-gradient(120deg, ${NAVY} 0%, #122042 50%, #1A2C4E 100%)` }}>
      <div
        className="absolute -top-32 start-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full blur-3xl opacity-30 pointer-events-none"
        style={{ background: `radial-gradient(circle, ${ORANGE}, transparent 65%)` }}
      />
      <div className="relative max-w-7xl mx-auto px-5 sm:px-8 text-center">
        <motion.span {...fadeUp}
          className="inline-block text-xs font-bold tracking-[0.2em] uppercase mb-3 px-3 py-1 rounded-full border"
          style={{ borderColor: `${ORANGE}55`, color: ORANGE, background: `${ORANGE}14` }}>
          تجربة مجانية
        </motion.span>
        <motion.h2 {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 }}
          className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight">
          ابدأ <span style={{ color: ORANGE }}>14 يوماً مجاناً</span>
        </motion.h2>
        <motion.p {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}
          className="text-slate-300 mt-4 text-base sm:text-lg max-w-2xl mx-auto">
          استكشف النظام بالكامل، وقرّر بثقة. لا التزامات، ولا بطاقة ائتمان.
        </motion.p>

        <div className="grid sm:grid-cols-3 gap-5 mt-12 max-w-4xl mx-auto">
          {items.map((it, i) => (
            <motion.div
              key={it.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.1 }}
              className="rounded-2xl p-6 bg-white/[0.04] border border-white/10 backdrop-blur-sm"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4"
                style={{ background: `${ORANGE}22`, color: ORANGE }}>
                <it.icon className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold">{it.title}</h3>
              <p className="text-sm text-slate-400 mt-1">{it.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.button {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.3 }}
          onClick={onCtaClick}
          data-testid="trial-cta"
          className="mt-12 inline-flex items-center gap-2 text-base font-bold text-white rounded-2xl px-8 py-4 transition shadow-2xl hover:-translate-y-0.5"
          style={{ background: ORANGE, boxShadow: `0 20px 40px -10px ${ORANGE}66` }}
        >
          ابدأ تجربتك المجانية
          <ArrowRight className="w-5 h-5 rtl:rotate-180" />
        </motion.button>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  PRICING
// ──────────────────────────────────────────────────────────────────────────

function Pricing({ onCtaClick }: { onCtaClick: (plan?: string) => void }) {
  const plans = [
    {
      id: "starter", name: "Starter", nameAr: "البداية",
      price: 149,
      features: ["نقطة بيع POS","QR Menu","فرع واحد","عدد مستخدمين 2","تقارير أساسية","دعم بالبريد"],
      highlighted: false,
    },
    {
      id: "growth", name: "Growth", nameAr: "النمو",
      price: 349,
      features: ["كل ميزات Starter","حتى 3 فروع","عدد مستخدمين 10","شاشة مطبخ KDS","إدارة المخزون","تقارير متقدمة","Webhooks","دعم بالواتساب الداخلي"],
      highlighted: true,
    },
    {
      id: "enterprise", name: "Enterprise", nameAr: "المؤسسات",
      price: 899,
      features: ["كل ميزات Growth","فروع غير محدودة","مستخدمين غير محدودين","مساعد AI كامل","تكامل ERP","API كامل","SLA مخصص","مدير حساب"],
      highlighted: false,
    },
  ];

  return (
    <section id="pricing" className="relative py-20 lg:py-28 bg-slate-50">
      <div className="max-w-7xl mx-auto px-5 sm:px-8">
        <SectionTitle
          kicker="الأسعار"
          title="خطط بسيطة، سعر سنوي واحد"
          subtitle="اختر الباقة المناسبة لحجم مطعمك، وارفعها لاحقاً عند التوسع."
        />

        <div className="grid md:grid-cols-3 gap-6 lg:gap-7 items-stretch">
          {plans.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.08 }}
              className={`relative rounded-3xl p-7 lg:p-8 flex flex-col transition-all duration-300 ${
                p.highlighted
                  ? "bg-white border-2 shadow-2xl scale-[1.02] lg:scale-105"
                  : "bg-white/70 border border-slate-200 hover:border-slate-300 hover:shadow-lg"
              }`}
              style={p.highlighted ? { borderColor: ORANGE, boxShadow: `0 30px 60px -20px ${ORANGE}40` } : undefined}
              data-testid={`pricing-${p.id}`}
            >
              {p.highlighted && (
                <span className="absolute -top-3 start-1/2 -translate-x-1/2 inline-flex items-center gap-1 text-[11px] font-bold text-white px-3 py-1 rounded-full shadow-md"
                      style={{ background: ORANGE }}>
                  <Star className="w-3 h-3" /> الموصى بها
                </span>
              )}
              <div className="text-sm font-bold tracking-wide" style={{ color: p.highlighted ? ORANGE : NAVY }}>
                {p.nameAr}
              </div>
              <div className="text-xs text-slate-400 mt-0.5">{p.name}</div>
              <div className="mt-5 flex items-baseline gap-1.5">
                <span className="text-4xl lg:text-5xl font-black" style={{ color: NAVY }}>${p.price}</span>
                <span className="text-sm text-slate-500">/ سنوياً</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">يُدفع مرة واحدة عن السنة كاملة</p>

              <ul className="mt-6 space-y-3 flex-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 className="w-[18px] h-[18px] shrink-0 mt-0.5" style={{ color: ORANGE }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => onCtaClick(p.id)}
                data-testid={`pricing-cta-${p.id}`}
                className={`mt-7 w-full text-sm font-bold rounded-xl py-3.5 transition ${
                  p.highlighted
                    ? "text-white shadow-lg hover:-translate-y-0.5"
                    : "bg-slate-900 text-white hover:bg-slate-800"
                }`}
                style={p.highlighted ? { background: ORANGE, boxShadow: `0 12px 26px -10px ${ORANGE}66` } : undefined}
              >
                اختيار الباقة
              </button>
            </motion.div>
          ))}
        </div>

        <p className="text-center text-xs text-slate-500 mt-8">
          الأسعار بالدولار الأمريكي، تشمل التحديثات والدعم. الاشتراك سنوي ولا يوجد استرداد بعد التفعيل.
        </p>
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  FINAL CTA + LEAD FORM
// ──────────────────────────────────────────────────────────────────────────

interface LeadFormProps {
  prefilledPlan?: string;
  /** Allow parent to pass focus signal to scroll/lock attention */
  highlight?: boolean;
}

function LeadForm({ prefilledPlan, highlight }: LeadFormProps) {
  const [restaurantName, setRestaurantName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [branches, setBranches] = useState("1");
  const [planInterested, setPlanInterested] = useState(prefilledPlan ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (prefilledPlan) setPlanInterested(prefilledPlan);
  }, [prefilledPlan]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleaned = phone.trim().replace(/[^\d+]/g, "");
    if (restaurantName.trim().length < 2) { setError("الرجاء كتابة اسم المطعم."); return; }
    if (contactName.trim().length < 2)    { setError("الرجاء كتابة اسم الشخص المسؤول."); return; }
    if (cleaned.length < 7)               { setError("رقم الجوال غير صالح."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurantName: restaurantName.trim(),
          contactName: contactName.trim(),
          phone: cleaned,
          branchesCount: Number(branches),
          planInterested: planInterested || null,
          source: "landing",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "تعذّر إرسال الطلب.");
      setSuccess(true);
      setRestaurantName(""); setContactName(""); setPhone(""); setBranches("1"); setPlanInterested("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.form
      id="lead-form"
      onSubmit={submit}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55 }}
      className={`relative rounded-3xl bg-white p-6 sm:p-8 lg:p-10 shadow-2xl border ${highlight ? "border-[#FF6B35]" : "border-slate-100"}`}
      data-testid="lead-form"
    >
      <AnimatePresence mode="wait">
        {success ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="py-10 text-center"
          >
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4"
                 style={{ background: `${ORANGE}1A` }}>
              <CheckCircle2 className="w-9 h-9" style={{ color: ORANGE }} />
            </div>
            <h3 className="text-2xl font-extrabold" style={{ color: NAVY }}>
              تم استلام طلبك ✓
            </h3>
            <p className="text-slate-600 mt-2 max-w-md mx-auto">
              شكراً لتواصلك معنا. سيتواصل معك فريق المبيعات قريباً عبر البريد أو الجوال المسجّل.
            </p>
            <button
              type="button"
              onClick={() => setSuccess(false)}
              className="mt-6 text-sm font-semibold underline-offset-4 hover:underline"
              style={{ color: ORANGE }}
            >
              إرسال طلب آخر
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <div className="sm:col-span-2 mb-1">
              <h3 className="text-xl sm:text-2xl font-extrabold" style={{ color: NAVY }}>
                تواصل معنا للحصول على النظام
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                سنعود إليك خلال أقل من ساعة عمل. للتواصل يرجى تعبئة النموذج فقط.
              </p>
            </div>

            <Field label="اسم المطعم" icon={Building2}>
              <input
                value={restaurantName}
                onChange={(e) => setRestaurantName(e.target.value)}
                required minLength={2} maxLength={120}
                placeholder="مثال: مطعم الديوانية"
                className="w-full bg-transparent border-0 outline-none text-sm placeholder:text-slate-400"
                data-testid="lead-restaurant-name"
              />
            </Field>

            <Field label="اسم الشخص المسؤول" icon={User}>
              <input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required minLength={2} maxLength={120}
                placeholder="الاسم الكامل"
                className="w-full bg-transparent border-0 outline-none text-sm placeholder:text-slate-400"
                data-testid="lead-contact-name"
              />
            </Field>

            <Field label="رقم الجوال" icon={Phone}>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                inputMode="tel"
                pattern="[\d+\s\-()]{7,}"
                placeholder="05XXXXXXXX"
                className="w-full bg-transparent border-0 outline-none text-sm placeholder:text-slate-400 [direction:ltr] text-start"
                data-testid="lead-phone"
              />
            </Field>

            <Field label="عدد الفروع" icon={Building2}>
              <select
                value={branches}
                onChange={(e) => setBranches(e.target.value)}
                className="w-full bg-transparent border-0 outline-none text-sm"
                data-testid="lead-branches"
              >
                <option value="1">فرع واحد</option>
                <option value="2">فرعان</option>
                <option value="3">3 فروع</option>
                <option value="5">5 فروع</option>
                <option value="10">10 فروع</option>
                <option value="20">20 فرع أو أكثر</option>
              </select>
            </Field>

            {planInterested && (
              <div className="sm:col-span-2 text-xs text-slate-500 -mt-1">
                الباقة المهتم بها: <span className="font-bold capitalize" style={{ color: ORANGE }}>{planInterested}</span>
              </div>
            )}

            {error && (
              <div className="sm:col-span-2 text-sm rounded-xl border bg-red-50 border-red-200 text-red-700 px-3.5 py-2.5">
                ⚠️ {error}
              </div>
            )}

            <div className="sm:col-span-2 pt-1">
              <button
                type="submit"
                disabled={submitting}
                data-testid="lead-submit"
                className="w-full inline-flex items-center justify-center gap-2 text-base font-bold text-white rounded-xl py-4 transition shadow-xl disabled:opacity-60 disabled:cursor-not-allowed hover:-translate-y-0.5"
                style={{ background: ORANGE, boxShadow: `0 14px 28px -10px ${ORANGE}55` }}
              >
                {submitting ? "جارٍ الإرسال..." : (<>إرسال <Send className="w-4 h-4 rtl:scale-x-[-1]" /></>)}
              </button>
              <p className="text-[11px] text-slate-400 text-center mt-3">
                بإرسال هذا النموذج، أنت توافق على الشروط والأحكام وسياسة الخصوصية الخاصة بنا.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.form>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof Building2; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700 mb-1.5 block">{label}</span>
      <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-slate-50 border border-slate-200 focus-within:border-[#FF6B35] focus-within:ring-2 focus-within:ring-[#FF6B35]/15 transition">
        <Icon className="w-4 h-4 text-slate-400 shrink-0" />
        {children}
      </div>
    </label>
  );
}

function FinalCta({ planInterested }: { planInterested: string | undefined }) {
  return (
    <section id="contact" className="relative py-20 lg:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-5 sm:px-8 grid lg:grid-cols-2 gap-10 lg:gap-14 items-start">
        <div>
          <motion.span {...fadeUp}
            className="inline-block text-xs font-bold tracking-[0.2em] uppercase mb-3 px-3 py-1 rounded-full"
            style={{ color: ORANGE, background: `${ORANGE}14` }}>
            تواصل معنا
          </motion.span>
          <motion.h2 {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.05 }}
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight"
            style={{ color: NAVY }}>
            جاهز لتشغيل مطعمك<br/><span style={{ color: ORANGE }}>بشكل احترافي؟</span>
          </motion.h2>
          <motion.p {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.1 }}
            className="text-slate-600 mt-4 text-base lg:text-lg leading-relaxed">
            عبّئ النموذج وسيتواصل معك فريق المبيعات للإجابة على جميع استفساراتك واقتراح الباقة الأنسب لمطعمك.
          </motion.p>

          <div className="mt-8 space-y-4 text-sm text-slate-700">
            {[
              "رد خلال أقل من ساعة عمل",
              "استشارة مجانية لاختيار الباقة المناسبة",
              "نظامك جاهز خلال 24 ساعة من قبول العرض",
            ].map((t) => (
              <div key={t} className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: `${ORANGE}14` }}>
                  <CheckCircle2 className="w-4 h-4" style={{ color: ORANGE }} />
                </div>
                {t}
              </div>
            ))}
          </div>
        </div>

        <LeadForm prefilledPlan={planInterested} />
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  LEGAL MODALS
// ──────────────────────────────────────────────────────────────────────────

const TERMS_AR = [
  "الاشتراك سنوي ويتم الدفع مقدماً، ولا يوجد استرداد بعد التفعيل.",
  "التجربة المجانية 14 يوماً فقط، ويحق للنظام إيقاف الحساب بعد انتهائها.",
  "يمنع استخدام النظام لأي نشاط غير قانوني، والعميل مسؤول عن بياناته بالكامل.",
  "نسعى لتوفير الخدمة 24/7، وقد تحدث صيانة أو توقف مؤقت دون إشعار مسبق.",
  "يحق لنا إيقاف الحساب في حال إساءة الاستخدام أو مخالفة الشروط.",
  "يحق لنا تعديل الأسعار أو الشروط مع إشعار مسبق للعملاء الحاليين.",
];

const PRIVACY_AR = [
  { t: "البيانات التي نجمعها", d: "بيانات المطعم، بيانات المستخدمين، بيانات الطلبات والمعاملات." },
  { t: "الاستخدام",            d: "تحسين الخدمة، التحليلات الداخلية، وتشغيل النظام لصالحك." },
  { t: "الحماية",              d: "تشفير البيانات في النقل والتخزين مع أنظمة أمان متعددة الطبقات." },
  { t: "المشاركة",             d: "لا نبيع بياناتك لأي طرف ثالث، ولا نشاركها إلا بالضرورة التقنية." },
  { t: "الاحتفاظ",             d: "يتم الاحتفاظ بالبيانات طالما الحساب نشط، ويتم الحذف عند الإنهاء." },
  { t: "حقوق المستخدم",        d: "يمكنك طلب حذف بياناتك أو تصديرها في أي وقت من إعدادات الحساب." },
];

function LegalModal({ open, onClose, kind }: { open: boolean; onClose: () => void; kind: "terms" | "privacy" }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-6"
          onClick={onClose}
          data-testid={`legal-modal-${kind}`}
        >
          <motion.div
            initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg sm:text-xl font-extrabold" style={{ color: NAVY }}>
                {kind === "terms" ? "الشروط والأحكام" : "سياسة الخصوصية"}
              </h3>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="close" data-testid="legal-close">
                <X className="w-5 h-5 text-slate-600" />
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-700">
              {kind === "terms" ? (
                <>
                  <p className="text-slate-500 mb-4">باستخدامك لنظام FOODPRO، فإنك توافق على البنود التالية:</p>
                  <ol className="space-y-3 list-none">
                    {TERMS_AR.map((t, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full text-white text-xs font-bold flex items-center justify-center"
                              style={{ background: ORANGE }}>{i + 1}</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <>
                  <p className="text-slate-500 mb-4">نحن في FOODPRO نحترم خصوصيتك ونلتزم بحماية بياناتك:</p>
                  <div className="space-y-4">
                    {PRIVACY_AR.map((p) => (
                      <div key={p.t} className="border-s-4 ps-4 py-1" style={{ borderColor: ORANGE }}>
                        <div className="font-bold mb-1" style={{ color: NAVY }}>{p.t}</div>
                        <div className="text-slate-600">{p.d}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
              <button onClick={onClose}
                className="text-sm font-bold text-white rounded-xl px-5 py-2.5"
                style={{ background: ORANGE }}>
                فهمت
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  FOOTER
// ──────────────────────────────────────────────────────────────────────────

function Footer({ onTerms, onPrivacy }: { onTerms: () => void; onPrivacy: () => void }) {
  return (
    <footer className="text-slate-300 pt-14 pb-8" style={{ background: NAVY }}>
      <div className="max-w-7xl mx-auto px-5 sm:px-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-10">
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${ORANGE}, #FF8C5A)` }}>
              <span className="text-white font-black text-lg">F</span>
            </div>
            <span className="text-xl font-black text-white">FOODPRO</span>
          </div>
          <p className="text-sm text-slate-400 leading-relaxed">
            نظام إدارة المطاعم الأذكى — POS، KDS، مخزون، تقارير، ومساعد AI، في منصة واحدة.
          </p>
        </div>

        <div>
          <h4 className="text-white font-bold mb-4">المنتج</h4>
          <ul className="space-y-2 text-sm">
            <li><a href="#features"   className="hover:text-white transition">المميزات</a></li>
            <li><a href="#how"        className="hover:text-white transition">كيف يعمل</a></li>
            <li><a href="#pricing"    className="hover:text-white transition">الأسعار</a></li>
            <li><a href="#contact"    className="hover:text-white transition">تواصل</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-4">قانوني</h4>
          <ul className="space-y-2 text-sm">
            <li>
              <button onClick={onTerms} className="hover:text-white transition" data-testid="footer-terms-btn">
                الشروط والأحكام
              </button>
            </li>
            <li>
              <button onClick={onPrivacy} className="hover:text-white transition" data-testid="footer-privacy-btn">
                سياسة الخصوصية
              </button>
            </li>
          </ul>
        </div>

        <div>
          <h4 className="text-white font-bold mb-4">تواصل</h4>
          <p className="text-sm text-slate-400 mb-3 leading-relaxed">
            للتواصل معنا، يرجى تعبئة النموذج وسنعود إليك في أقرب وقت.
          </p>
          <a
            href="#contact"
            className="inline-flex items-center gap-2 text-sm font-bold rounded-lg px-4 py-2 text-white"
            style={{ background: ORANGE }}
          >
            افتح النموذج
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </a>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-5 sm:px-8 mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-xs text-slate-400">
        <span>© {new Date().getFullYear()} FOODPRO. جميع الحقوق محفوظة.</span>
        <span className="inline-flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" />
          صُنع لمطاعم العالم العربي
        </span>
      </div>
    </footer>
  );
}

// ──────────────────────────────────────────────────────────────────────────
//  ROOT PAGE
// ──────────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [planInterested, setPlanInterested] = useState<string | undefined>(undefined);
  const [legal, setLegal] = useState<null | "terms" | "privacy">(null);

  // Set dir/lang for this page (the landing is Arabic-first regardless of saved lang)
  useEffect(() => {
    document.documentElement.dir = "rtl";
    document.documentElement.lang = "ar";
    document.documentElement.classList.remove("dark");
    document.title = "FOODPRO — نظام إدارة المطاعم الأذكى";
    const meta = document.querySelector('meta[name="description"]') ?? document.createElement("meta");
    meta.setAttribute("name", "description");
    meta.setAttribute("content", "نظام FOODPRO المتكامل لإدارة المطاعم: نقطة بيع، شاشة مطبخ، مخزون، تقارير، ومساعد ذكاء اصطناعي. جرّب 14 يوم مجاناً.");
    document.head.appendChild(meta);

    // open graph
    const setMeta = (prop: string, content: string) => {
      let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
      if (!el) { el = document.createElement("meta"); el.setAttribute("property", prop); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("og:title", "FOODPRO — نظام إدارة المطاعم الأذكى");
    setMeta("og:description", "POS، KDS، مخزون، تقارير، ومساعد AI في منصة واحدة. 14 يوم تجربة مجانية.");
    setMeta("og:type", "website");
  }, []);

  const scrollToForm = (plan?: string) => {
    if (plan) setPlanInterested(plan);
    document.getElementById("contact")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-white" data-testid="landing-page">
      <TopNav onCtaClick={() => scrollToForm()} />
      <Hero      onCtaClick={() => scrollToForm()} />
      <Features  />
      <HowItWorks onCtaClick={() => scrollToForm()} />
      <FreeTrial onCtaClick={() => scrollToForm()} />
      <Pricing   onCtaClick={(plan) => scrollToForm(plan)} />
      <FinalCta  planInterested={planInterested} />
      <Footer    onTerms={() => setLegal("terms")} onPrivacy={() => setLegal("privacy")} />
      <LegalModal open={legal !== null} onClose={() => setLegal(null)} kind={legal ?? "terms"} />
    </div>
  );
}
