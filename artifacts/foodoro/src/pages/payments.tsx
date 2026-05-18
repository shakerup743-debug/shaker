import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, Smartphone, Wallet, CheckCircle2, XCircle,
  ArrowRight, ShieldCheck, Zap, Globe, RefreshCw, Clock,
  TrendingUp, DollarSign, AlertCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/clerk-shim";
import { useTranslation } from "react-i18next";
import { useCurrency } from "@/contexts/currency";

interface PaymentProvider {
  id: string;
  name: string;
  nameAr: string;
  logo: string;
  description: string;
  descriptionAr: string;
  methods: string[];
  fees: string;
  settlement: string;
  currencies: string[];
  status: "connected" | "available" | "coming_soon";
  color: string;
  features: string[];
  featuresAr: string[];
}

const PROVIDERS: PaymentProvider[] = [
  {
    id: "moyasar",
    name: "Moyasar",
    nameAr: "ميسر",
    logo: "M",
    description: "Saudi Arabia's leading payment gateway — MADA, Visa, Mastercard, Apple Pay",
    descriptionAr: "بوابة الدفع السعودية الرائدة — مدى، فيزا، ماستر، آبل باي",
    methods: ["MADA", "Visa", "Mastercard", "Apple Pay", "STC Pay"],
    fees: "2.4% + 1.00 SAR",
    settlement: "1-2 business days",
    currencies: ["SAR"],
    status: "available",
    color: "#1DA462",
    features: ["PCI DSS Level 1", "3DS2", "Tokenization", "Split payments"],
    featuresAr: ["PCI DSS مستوى 1", "التحقق الثلاثي", "ترميز البطاقات", "تقسيم المدفوعات"],
  },
  {
    id: "stcpay",
    name: "STC Pay",
    nameAr: "STC Pay",
    logo: "S",
    description: "Saudi Telecom's digital wallet — instant mobile payments",
    descriptionAr: "محفظة STC الرقمية — مدفوعات فورية عبر الجوال",
    methods: ["STC Pay Wallet", "QR Code"],
    fees: "1.75%",
    settlement: "Same day",
    currencies: ["SAR"],
    status: "available",
    color: "#8B1DCA",
    features: ["Instant settlement", "QR payments", "Low fees", "Saudi-first"],
    featuresAr: ["تسوية فورية", "مدفوعات QR", "رسوم منخفضة", "سعودي أولاً"],
  },
  {
    id: "stripe",
    name: "Stripe",
    nameAr: "سترايب",
    logo: "S",
    description: "Global payment infrastructure for international transactions",
    descriptionAr: "بنية تحتية عالمية للمدفوعات الدولية",
    methods: ["Visa", "Mastercard", "Apple Pay", "Google Pay", "AMEX"],
    fees: "2.9% + $0.30",
    settlement: "2-3 business days",
    currencies: ["USD", "EUR", "GBP", "SAR"],
    status: "available",
    color: "#635BFF",
    features: ["Global reach", "100+ currencies", "Fraud detection", "Subscriptions"],
    featuresAr: ["انتشار عالمي", "+100 عملة", "كشف الاحتيال", "الاشتراكات"],
  },
  {
    id: "tabby",
    name: "Tabby",
    nameAr: "تابي",
    logo: "T",
    description: "Buy now, pay later — split bills into 4 interest-free installments",
    descriptionAr: "اشتر الآن وادفع لاحقاً — قسّم المدفوعات على 4 أقساط بدون فوائد",
    methods: ["BNPL", "4 installments", "Pay in full later"],
    fees: "2.99%",
    settlement: "T+1",
    currencies: ["SAR", "AED", "KWD"],
    status: "coming_soon",
    color: "#3DBFCF",
    features: ["0% interest for shoppers", "Guaranteed merchant payment", "Instant approval"],
    featuresAr: ["بدون فوائد للمتسوق", "ضمان الدفع للتاجر", "موافقة فورية"],
  },
  {
    id: "tamara",
    name: "Tamara",
    nameAr: "تمارا",
    logo: "T",
    description: "MENA's largest BNPL platform — pay in 3, 4, or 6 installments",
    descriptionAr: "أكبر منصة BNPL في الشرق الأوسط — ادفع في 3 أو 4 أو 6 أقساط",
    methods: ["3 installments", "4 installments", "6 months"],
    fees: "3.0% + 1.00 SAR",
    settlement: "2 business days",
    currencies: ["SAR", "AED"],
    status: "coming_soon",
    color: "#FF5722",
    features: ["Flexible installments", "No interest", "Sharia-compliant", "Instant checkout"],
    featuresAr: ["أقساط مرنة", "بدون فوائد", "متوافق مع الشريعة", "دفع فوري"],
  },
];

interface TxSummary {
  today: number;
  yesterday: number;
  successRate: number;
  avgValue: number;
  currency: string;
}

export default function PaymentsPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { format } = useCurrency();
  const [selected, setSelected] = useState<PaymentProvider | null>(null);

  const { data: stats } = useQuery<TxSummary>({
    queryKey: ["payment-stats"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/reports/dashboard", { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json() as { todayRevenue?: number; yesterdayRevenue?: number; todayOrders?: number };
      return {
        today: Number(data?.todayRevenue ?? 0),
        yesterday: Number(data?.yesterdayRevenue ?? 0),
        successRate: 98.4,
        avgValue: data?.todayOrders && (data.todayOrders > 0)
          ? Number(data.todayRevenue ?? 0) / data.todayOrders
          : 0,
        currency: "SAR",
      };
    },
  });

  const connected = PROVIDERS.filter(p => p.status === "connected");
  const available = PROVIDERS.filter(p => p.status === "available");
  const coming = PROVIDERS.filter(p => p.status === "coming_soon");

  function StatusBadge({ status }: { status: PaymentProvider["status"] }) {
    if (status === "connected")
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"><CheckCircle2 size={9} />{isAr ? "متصل" : "Connected"}</span>;
    if (status === "available")
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">{isAr ? "متاح" : "Available"}</span>;
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-muted/60 text-muted-foreground border border-border"><Clock size={9} />{isAr ? "قريباً" : "Coming Soon"}</span>;
  }

  function ProviderCard({ p }: { p: PaymentProvider }) {
    return (
      <motion.button
        layout
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={() => setSelected(p)}
        className={`w-full p-4 rounded-2xl bg-card border text-start group transition-all hover:border-primary/40
          ${p.status === "coming_soon" ? "opacity-60" : ""}`}
        style={{ borderColor: selected?.id === p.id ? p.color + "80" : undefined }}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0" style={{ backgroundColor: p.color }}>
            {p.logo}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-foreground">{isAr ? p.nameAr : p.name}</p>
              <StatusBadge status={p.status} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{isAr ? p.descriptionAr : p.description}</p>
            <div className="flex flex-wrap gap-1 mt-2">
              {p.methods.slice(0, 4).map(m => (
                <span key={m} className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-muted-foreground border border-border">{m}</span>
              ))}
              {p.methods.length > 4 && <span className="text-[10px] text-muted-foreground">+{p.methods.length - 4}</span>}
            </div>
          </div>
          <ArrowRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
        </div>
      </motion.button>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <CreditCard size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "بوابات الدفع" : "Payment Gateways"}</h1>
            <p className="text-xs text-muted-foreground">{isAr ? "تكاملات الدفع وإدارة المعاملات" : "Payment integrations & transaction management"}</p>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { icon: TrendingUp, label: isAr ? "إيرادات اليوم" : "Today Revenue", value: format(stats?.today ?? 0), color: "#E67E22" },
            { icon: RefreshCw, label: isAr ? "معدل النجاح" : "Success Rate", value: `${stats?.successRate ?? 0}%`, color: "#10B981" },
            { icon: DollarSign, label: isAr ? "متوسط الطلب" : "Avg Order", value: format(stats?.avgValue ?? 0), color: "#3B82F6" },
            { icon: ShieldCheck, label: isAr ? "بوابات فعّالة" : "Active Gateways", value: connected.length || "0", color: "#8B5CF6" },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="p-3 rounded-2xl bg-card border border-border">
              <div className="w-7 h-7 rounded-lg mb-2 flex items-center justify-center" style={{ backgroundColor: color + "18" }}>
                <Icon size={13} style={{ color }} />
              </div>
              <p className="text-base font-bold text-foreground">{value}</p>
              <p className="text-[10px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        {/* Security notice */}
        <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
          <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-emerald-400">{isAr ? "أمان المدفوعات" : "Payment Security"}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{isAr ? "جميع المعاملات مشفرة بـ TLS 1.3 ومتوافقة مع PCI DSS المستوى 1" : "All transactions encrypted with TLS 1.3 and PCI DSS Level 1 compliant"}</p>
          </div>
        </div>

        {/* Connected */}
        {connected.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
              <CheckCircle2 size={11} className="text-emerald-400" /> {isAr ? "متصل" : "Connected"}
            </h3>
            <div className="space-y-2">{connected.map(p => <ProviderCard key={p.id} p={p} />)}</div>
          </div>
        )}

        {/* Available */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
            <Zap size={11} className="text-primary" /> {isAr ? "متاح للتفعيل" : "Available to Connect"}
          </h3>
          <div className="space-y-2">{available.map(p => <ProviderCard key={p.id} p={p} />)}</div>
        </div>

        {/* Coming soon */}
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
            <Clock size={11} /> {isAr ? "قريباً" : "Coming Soon"}
          </h3>
          <div className="space-y-2">{coming.map(p => <ProviderCard key={p.id} p={p} />)}</div>
        </div>
      </div>

      {/* Slide-over detail panel */}
      <AnimatePresence>
        {selected && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelected(null)} />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="fixed inset-y-0 end-0 w-80 bg-card border-s border-border z-50 overflow-y-auto p-5 space-y-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: selected.color }}>
                    {selected.logo}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{isAr ? selected.nameAr : selected.name}</p>
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-xl bg-secondary flex items-center justify-center text-muted-foreground">
                  <XCircle size={14} />
                </button>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">{isAr ? selected.descriptionAr : selected.description}</p>

              <div className="space-y-2">
                {[
                  { label: isAr ? "الرسوم" : "Fees", value: selected.fees },
                  { label: isAr ? "التسوية" : "Settlement", value: selected.settlement },
                  { label: isAr ? "العملات" : "Currencies", value: selected.currencies.join(", ") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center p-2.5 rounded-xl bg-background border border-border">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs font-semibold text-foreground">{value}</span>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs font-semibold text-foreground mb-2">{isAr ? "المميزات" : "Features"}</p>
                <div className="space-y-1.5">
                  {(isAr ? selected.featuresAr : selected.features).map(f => (
                    <div key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                      {f}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-foreground mb-2">{isAr ? "طرق الدفع" : "Payment Methods"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.methods.map(m => (
                    <span key={m} className="px-2 py-1 rounded-lg text-xs bg-secondary border border-border text-foreground">
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {selected.status !== "coming_soon" ? (
                <div className="space-y-2">
                  <button className="w-full h-10 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: selected.color }}>
                    <Globe size={14} />
                    {isAr ? "ربط الحساب" : "Connect Account"}
                  </button>
                  <p className="text-[10px] text-muted-foreground text-center">
                    {isAr ? "ستحتاج إلى مفاتيح API من لوحة تحكم " : "You'll need API keys from your "}{isAr ? selected.nameAr : selected.name}{isAr ? "" : " dashboard"}
                  </p>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-muted/30 border border-border text-center">
                  <AlertCircle size={16} className="text-muted-foreground mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">{isAr ? "هذه البوابة ستكون متاحة قريباً" : "This gateway will be available soon"}</p>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
