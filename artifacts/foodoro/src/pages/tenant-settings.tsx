import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Building2, Globe, Palette, Receipt, Save, RefreshCw, MapPin,
  CheckCircle,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface Tenant {
  id: number;
  slug: string;
  name: string;
  nameAr: string | null;
  logo: string | null;
  primaryColor: string;
  currency: string;
  taxRate: string;
  timezone: string;
  subscriptionPlan: string;
  subscriptionStatus: string;
  branches: Array<{ id: number; name: string; nameAr: string | null; city: string | null; isActive: boolean }>;
}

const CURRENCIES = ["SAR", "AED", "USD", "EUR", "GBP", "EGP", "KWD", "BHD", "OMR", "QAR"];
const TIMEZONES = [
  "Asia/Riyadh", "Asia/Dubai", "Asia/Kuwait", "Asia/Muscat",
  "Asia/Bahrain", "Asia/Qatar", "Africa/Cairo", "UTC",
];
const PLAN_COLORS: Record<string, string> = {
  starter: "text-gray-400 bg-gray-400/10",
  professional: "text-blue-400 bg-blue-400/10",
  enterprise: "text-yellow-400 bg-yellow-400/10",
};

export default function TenantSettingsPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: tenant, isLoading } = useQuery<Tenant>({
    queryKey: ["tenant-me"],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch("/api/tenants/me", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Failed to load tenant");
      return res.json() as Promise<Tenant>;
    },
  });

  const [form, setForm] = useState({
    name: "",
    nameAr: "",
    logo: "",
    primaryColor: "#E67E22",
    currency: "SAR",
    taxRate: "15",
    timezone: "Asia/Riyadh",
  });

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name,
        nameAr: tenant.nameAr ?? "",
        logo: tenant.logo ?? "",
        primaryColor: tenant.primaryColor,
        currency: tenant.currency,
        taxRate: tenant.taxRate,
        timezone: tenant.timezone,
      });
    }
  }, [tenant]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const mutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const token = await getToken();
      const res = await fetch("/api/tenants/me", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update tenant");
      return res.json() as Promise<Tenant>;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["tenant-me"] });
      toast({ title: isAr ? "تم الحفظ" : "Saved", description: isAr ? "تم تحديث إعدادات المؤسسة" : "Tenant settings updated" });
    },
    onError: () => toast({ title: isAr ? "خطأ" : "Error", variant: "destructive" }),
  });

  const planLabel = { starter: "Starter", professional: "Professional", enterprise: "Enterprise" };

  return (
    <div className="h-full overflow-y-auto bg-background p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Building2 size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-foreground">{isAr ? "إعدادات المؤسسة" : "Tenant Settings"}</h1>
          <p className="text-xs text-muted-foreground">{isAr ? "تخصيص إعدادات مطعمك" : "Customize your restaurant configuration"}</p>
        </div>
        {tenant && (
          <span className={`ms-auto text-[11px] font-semibold px-2 py-1 rounded-lg ${PLAN_COLORS[tenant.subscriptionPlan] ?? "text-gray-400 bg-gray-400/10"}`}>
            {planLabel[tenant.subscriptionPlan as keyof typeof planLabel] ?? tenant.subscriptionPlan}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-4">
          {/* Identity */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-2xl bg-card border border-border space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Building2 size={14} className="text-primary" />
              {isAr ? "هوية المؤسسة" : "Brand Identity"}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{isAr ? "الاسم (إنجليزي)" : "Name (EN)"}</Label>
                <Input className="bg-background border-border" value={form.name} onChange={e => set("name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{isAr ? "الاسم (عربي)" : "Name (AR)"}</Label>
                <Input className="bg-background border-border" value={form.nameAr} onChange={e => set("nameAr", e.target.value)} dir="rtl" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{isAr ? "رابط الشعار" : "Logo URL"}</Label>
              <Input className="bg-background border-border" value={form.logo} onChange={e => set("logo", e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Palette size={11} />{isAr ? "اللون الأساسي" : "Primary Color"}
              </Label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.primaryColor} onChange={e => set("primaryColor", e.target.value)}
                  className="w-10 h-9 rounded-lg border border-border cursor-pointer bg-background" />
                <Input className="bg-background border-border flex-1" value={form.primaryColor} onChange={e => set("primaryColor", e.target.value)} />
              </div>
            </div>
          </motion.div>

          {/* Locale & Finance */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="p-4 rounded-2xl bg-card border border-border space-y-3">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Globe size={14} className="text-primary" />
              {isAr ? "الإعدادات المالية والإقليمية" : "Locale & Finance"}
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><Receipt size={11} />{isAr ? "العملة" : "Currency"}</Label>
                <select value={form.currency} onChange={e => set("currency", e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background text-foreground text-sm px-2">
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">VAT %</Label>
                <Input className="bg-background border-border" type="number" min="0" max="30" value={form.taxRate}
                  onChange={e => set("taxRate", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5"><MapPin size={11} />{isAr ? "المنطقة الزمنية" : "Timezone"}</Label>
                <select value={form.timezone} onChange={e => set("timezone", e.target.value)}
                  className="w-full h-9 rounded-lg border border-border bg-background text-foreground text-sm px-2">
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>
            </div>
          </motion.div>

          {/* Branches summary */}
          {tenant?.branches && tenant.branches.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="p-4 rounded-2xl bg-card border border-border">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
                <MapPin size={14} className="text-primary" />
                {isAr ? "الفروع" : "Branches"} <span className="text-xs text-muted-foreground">({tenant.branches.length})</span>
              </h2>
              <div className="space-y-2">
                {tenant.branches.map(b => (
                  <div key={b.id} className="flex items-center gap-2 py-1.5">
                    <CheckCircle size={14} className={b.isActive ? "text-emerald-400" : "text-muted-foreground"} />
                    <span className="text-sm text-foreground">{b.name}</span>
                    {b.nameAr && <span className="text-xs text-muted-foreground" dir="rtl">{b.nameAr}</span>}
                    {b.city && <span className="text-xs text-muted-foreground ms-auto">{b.city}</span>}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Save button */}
          <div className="flex justify-end gap-3">
            <button onClick={() => { if (tenant) setForm({ name: tenant.name, nameAr: tenant.nameAr ?? "", logo: tenant.logo ?? "", primaryColor: tenant.primaryColor, currency: tenant.currency, taxRate: tenant.taxRate, timezone: tenant.timezone }); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
              <RefreshCw size={13} />{isAr ? "إلغاء" : "Reset"}
            </button>
            <button onClick={() => mutation.mutate(form)} disabled={mutation.isPending}
              className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors">
              <Save size={13} />{mutation.isPending ? (isAr ? "جاري الحفظ..." : "Saving...") : (isAr ? "حفظ التغييرات" : "Save Changes")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
