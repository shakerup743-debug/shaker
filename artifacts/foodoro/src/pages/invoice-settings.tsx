/**
 * /settings/invoice — Invoice customization with LIVE preview.
 *  • Logo upload (multipart) or URL paste
 *  • Paper size: 58mm / 80mm / A5 / A4
 *  • Welcome message + footer text
 *  • Show/hide tax + logo toggles
 *  • Right-side preview re-renders on every change
 *  • Auto-generated QR code that links to the public digital menu
 */
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Save, Image as ImageIcon, QrCode, Loader2, Upload, X, ReceiptText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const TOKEN = "foodoro-token";
function authHeaders(): HeadersInit {
  const t = localStorage.getItem(TOKEN);
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

interface InvoiceSettings {
  id?: number;
  tenant_id?: number;
  branch_id?: number | null;
  logo_url: string | null;
  restaurant_name: string | null;
  paper_size: string;
  invoice_type: string;
  welcome_message: string | null;
  show_tax: boolean;
  show_logo: boolean;
  footer_text: string | null;
}

const DEFAULTS: InvoiceSettings = {
  logo_url: null,
  restaurant_name: "FoodPro Demo",
  paper_size: "80mm",
  invoice_type: "sales",
  welcome_message: "مرحباً بكم في مطعمنا",
  show_tax: true,
  show_logo: true,
  footer_text: "شكراً لزيارتكم، نتمنى لكم تجربة ممتعة",
};

const PAPER_SIZES = [
  { value: "58mm", label: "حراري 58مم" },
  { value: "80mm", label: "حراري 80مم" },
  { value: "A5",   label: "A5" },
  { value: "A4",   label: "A4" },
];

export default function InvoiceSettingsPage(): JSX.Element {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<InvoiceSettings>(DEFAULTS);
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery<{ settings: InvoiceSettings | null }>({
    queryKey: ["invoice-settings"],
    queryFn: async () => {
      const r = await fetch("/api/invoice-settings", { headers: authHeaders() });
      return r.ok ? r.json() : { settings: null };
    },
  });

  useEffect(() => {
    if (data?.settings) {
      setForm({ ...DEFAULTS, ...data.settings });
    }
  }, [data]);

  const { data: qrData } = useQuery<{ url: string; dataUrl: string }>({
    queryKey: ["invoice-qr"],
    queryFn: async () => {
      const r = await fetch("/api/invoice-settings/qr", { headers: authHeaders() });
      return r.ok ? r.json() : { url: "", dataUrl: "" };
    },
  });

  const update = <K extends keyof InvoiceSettings>(key: K, value: InvoiceSettings[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  const handleLogoUpload = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) {
      toast({ title: "الشعار أكبر من 4 ميغا", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const t = localStorage.getItem(TOKEN);
      const r = await fetch("/api/uploads/image", {
        method: "POST", body: fd,
        headers: t ? { Authorization: `Bearer ${t}` } : {},
      });
      const d = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !d.url) throw new Error(d.error ?? "فشل الرفع");
      update("logo_url", d.url);
      toast({ title: "تم رفع الشعار" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/invoice-settings", {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({
          logoUrl: form.logo_url,
          restaurantName: form.restaurant_name,
          paperSize: form.paper_size,
          invoiceType: form.invoice_type,
          welcomeMessage: form.welcome_message,
          showTax: form.show_tax,
          showLogo: form.show_logo,
          footerText: form.footer_text,
        }),
      });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "تم حفظ إعدادات الفاتورة" });
      void qc.invalidateQueries({ queryKey: ["invoice-settings"] });
    },
    onError: () => toast({ title: "فشل الحفظ", variant: "destructive" }),
  });

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8" data-testid="invoice-settings-page">
        <header className="flex items-start justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ReceiptText className="w-6 h-6 text-primary" /> تخصيص الفاتورة
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              ارفع شعارك، اختر حجم الورق، وعدّل النصوص — المعاينة تتحدث فوراً.
            </p>
          </div>
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            data-testid="save-invoice-settings"
            className="inline-flex items-center gap-2 text-sm font-bold text-white bg-primary px-4 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-40"
          >
            <Save size={15} /> {save.isPending ? "جاري الحفظ…" : "حفظ"}
          </button>
        </header>

        <div className="grid lg:grid-cols-[1fr_420px] gap-6">
          {/* ── Form ────────────────────────────────────────────── */}
          <section className="bg-card rounded-2xl border border-border p-6 space-y-5">
            {/* Logo */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">شعار المطعم</Label>
              <div className="flex items-start gap-3">
                {form.logo_url ? (
                  <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-border bg-muted">
                    <img src={form.logo_url} alt="logo" className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                    <button onClick={() => update("logo_url", null)}
                      data-testid="remove-invoice-logo"
                      className="absolute top-1 end-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground text-center">
                    بدون شعار
                  </div>
                )}
                <label className="flex-1">
                  <input
                    type="file" accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleLogoUpload(f); e.target.value = ""; }}
                    disabled={uploading}
                    className="hidden"
                    data-testid="upload-invoice-logo"
                  />
                  <div className={`flex items-center justify-center gap-2 w-full h-12 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${uploading ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/60 hover:bg-primary/5"}`}>
                    {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    <span className="text-xs font-medium">{uploading ? "جاري الرفع…" : "رفع شعار جديد (≤ 4 ميغا)"}</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Restaurant name */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">اسم المطعم</Label>
              <Input
                value={form.restaurant_name ?? ""}
                onChange={(e) => update("restaurant_name", e.target.value)}
                className="bg-background border-border"
                data-testid="input-restaurant-name"
              />
            </div>

            {/* Paper size */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">حجم الورق</Label>
              <div className="grid grid-cols-4 gap-2">
                {PAPER_SIZES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => update("paper_size", s.value)}
                    data-testid={`paper-${s.value}`}
                    className={`h-10 rounded-lg border text-xs font-medium transition-colors ${
                      form.paper_size === s.value
                        ? "bg-primary text-white border-primary"
                        : "bg-background border-border hover:border-primary/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Welcome message */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">رسالة الترحيب</Label>
              <Textarea
                value={form.welcome_message ?? ""}
                onChange={(e) => update("welcome_message", e.target.value)}
                className="bg-background border-border resize-none h-16"
                placeholder="مرحباً بكم في مطعمنا"
                data-testid="input-welcome-message"
              />
            </div>

            {/* Footer text */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">تذييل الفاتورة</Label>
              <Textarea
                value={form.footer_text ?? ""}
                onChange={(e) => update("footer_text", e.target.value)}
                className="bg-background border-border resize-none h-16"
                placeholder="شكراً لزيارتكم"
                data-testid="input-footer-text"
              />
            </div>

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="flex items-center justify-between bg-background border border-border rounded-xl px-4 py-3 cursor-pointer">
                <span className="text-xs font-medium">إظهار الضريبة</span>
                <Switch
                  checked={form.show_tax}
                  onCheckedChange={(v) => update("show_tax", v)}
                  data-testid="switch-show-tax"
                />
              </label>
              <label className="flex items-center justify-between bg-background border border-border rounded-xl px-4 py-3 cursor-pointer">
                <span className="text-xs font-medium">إظهار الشعار</span>
                <Switch
                  checked={form.show_logo}
                  onCheckedChange={(v) => update("show_logo", v)}
                  data-testid="switch-show-logo"
                />
              </label>
            </div>

            {/* QR */}
            <div className="space-y-2 pt-3 border-t border-border">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <QrCode size={12} /> رمز QR العام لقائمتك
              </Label>
              {qrData?.dataUrl ? (
                <div className="flex items-center gap-4">
                  <img src={qrData.dataUrl} alt="QR" className="w-24 h-24 rounded-lg bg-white p-1" data-testid="invoice-qr-img" />
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">يتم طباعته في أسفل الفاتورة وعلى الطاولة.</p>
                    <a
                      href={qrData.dataUrl}
                      download="foodpro-menu-qr.png"
                      data-testid="download-qr"
                      className="text-xs text-primary hover:underline"
                    >
                      تحميل صورة QR
                    </a>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">جاري التحميل…</p>
              )}
            </div>
          </section>

          {/* ── Live Preview ───────────────────────────────────── */}
          <InvoicePreview form={form} qrDataUrl={qrData?.dataUrl} />
        </div>
      </div>
    </div>
  );
}

function InvoicePreview({ form, qrDataUrl }: { form: InvoiceSettings; qrDataUrl?: string }): JSX.Element {
  const widthClass = useMemo(() => {
    switch (form.paper_size) {
      case "58mm": return "max-w-[220px]";
      case "80mm": return "max-w-[320px]";
      case "A5":   return "max-w-[420px]";
      case "A4":   return "max-w-[560px]";
      default:     return "max-w-[320px]";
    }
  }, [form.paper_size]);

  return (
    <aside className="sticky top-4 space-y-3" data-testid="invoice-preview">
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">
        <ReceiptText size={13} /> معاينة مباشرة · {form.paper_size}
      </div>
      <div className={`mx-auto bg-white text-black rounded-md shadow-2xl py-5 px-4 ${widthClass} font-mono`}
        style={{ fontFamily: '"Courier New", monospace' }}>
        {/* Logo */}
        {form.show_logo && form.logo_url && (
          <div className="flex justify-center mb-2">
            <img src={form.logo_url} alt="logo" className="max-h-16 object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          </div>
        )}
        {/* Restaurant */}
        <h2 className="text-center font-bold text-base mb-1">{form.restaurant_name ?? "—"}</h2>
        {form.welcome_message && (
          <p className="text-center text-[11px] mb-3" dir="auto">{form.welcome_message}</p>
        )}
        <div className="border-t border-dashed border-black/40 my-2" />

        {/* Sample line items */}
        <div className="text-[11px] space-y-1">
          <div className="flex justify-between"><span>طلب رقم</span><span>#ORD-1234</span></div>
          <div className="flex justify-between"><span>التاريخ</span><span>{new Date().toLocaleDateString("ar-SA")}</span></div>
          <div className="flex justify-between"><span>الكاشير</span><span>أحمد</span></div>
          <div className="flex justify-between"><span>الطاولة</span><span>5</span></div>
        </div>
        <div className="border-t border-dashed border-black/40 my-2" />
        <table className="w-full text-[11px]">
          <thead>
            <tr className="border-b border-black/40">
              <th className="text-start py-0.5">الصنف</th>
              <th className="text-center py-0.5">الكمية</th>
              <th className="text-end py-0.5">السعر</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>شاي كرك</td><td className="text-center">2</td><td className="text-end">16.00</td></tr>
            <tr><td>قهوة عربية</td><td className="text-center">1</td><td className="text-end">12.00</td></tr>
          </tbody>
        </table>
        <div className="border-t border-dashed border-black/40 my-2" />
        <div className="text-[11px] space-y-0.5">
          <div className="flex justify-between"><span>الإجمالي قبل الضريبة</span><span>24.35</span></div>
          {form.show_tax && (
            <div className="flex justify-between"><span>ضريبة القيمة المضافة (15%)</span><span>3.65</span></div>
          )}
          <div className="flex justify-between font-bold text-base pt-1 border-t border-black/40 mt-1">
            <span>الإجمالي</span><span>28.00 ر.س</span>
          </div>
        </div>
        <div className="border-t border-dashed border-black/40 my-2" />
        {/* QR */}
        {qrDataUrl && (
          <div className="flex flex-col items-center gap-1 my-2">
            <img src={qrDataUrl} alt="qr" className="w-20 h-20" />
            <p className="text-[10px]">امسح للقائمة الرقمية</p>
          </div>
        )}
        {form.footer_text && (
          <p className="text-center text-[11px] mt-2" dir="auto">{form.footer_text}</p>
        )}
      </div>
    </aside>
  );
}
