/**
 * /settings/discounts — Owner & Admin control panel for:
 *  • Per-role discount caps (% / amount / daily uses / require-reason)
 *  • Recent discount log feed (last 200 entries, including rejections)
 *  • Quick navigation to the coupons CRUD page
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Save, Percent, Hash, ListChecks, Tag, AlertTriangle, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Link } from "wouter";

const TOKEN = "foodoro-token";
function authHeaders(): HeadersInit {
  const t = localStorage.getItem(TOKEN);
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}

interface RoleCap {
  role: string;
  max_discount_percent: number | string;
  max_discount_amount: number | string | null;
  max_daily_uses: number;
  requires_reason: boolean;
}

interface DiscountLog {
  id: number;
  order_id: number | null;
  cashier_id: number | null;
  reason: string;
  customer_name: string | null;
  customer_phone: string | null;
  discount_type: string;
  discount_value: string;
  rejected: boolean;
  rejection_reason: string | null;
  created_at: string;
}

const ROLE_LABELS_AR: Record<string, string> = {
  super_admin: "مدير عام", owner: "مالك", manager: "مدير فرع", cashier: "كاشير",
  waiter: "نادل", kitchen: "مطبخ", bar: "بار", accountant: "محاسب",
  inventory: "مخزن", viewer: "مشاهد", admin: "مدير",
};

export default function DiscountSettingsPage(): JSX.Element {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: settingsData, isLoading: loadingSettings } = useQuery<{ settings: RoleCap[] }>({
    queryKey: ["discount-settings"],
    queryFn: async () => {
      const r = await fetch("/api/discounts/settings", { headers: authHeaders() });
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
  });

  const { data: logsData } = useQuery<{ logs: DiscountLog[] }>({
    queryKey: ["discount-logs"],
    queryFn: async () => {
      const r = await fetch("/api/discount-logs", { headers: authHeaders() });
      if (!r.ok) return { logs: [] };
      return r.json();
    },
  });

  const [rows, setRows] = useState<RoleCap[]>([]);
  useEffect(() => {
    if (settingsData?.settings) setRows(settingsData.settings);
  }, [settingsData]);

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/discount-settings", {
        method: "PUT", headers: authHeaders(),
        body: JSON.stringify({ settings: rows.map((s) => ({
          role: s.role,
          max_discount_percent: Number(s.max_discount_percent) || 0,
          max_discount_amount: s.max_discount_amount === null || s.max_discount_amount === "" ? null : Number(s.max_discount_amount),
          max_daily_uses: Number(s.max_daily_uses) || 0,
          requires_reason: s.requires_reason,
        })) }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "تم حفظ سقوف الخصم" });
      void qc.invalidateQueries({ queryKey: ["discount-settings"] });
    },
    onError: (e: Error) => toast({ title: "فشل الحفظ", description: e.message, variant: "destructive" }),
  });

  const updateRow = (idx: number, patch: Partial<RoleCap>) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8" data-testid="discount-settings-page">
        <header className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Percent className="w-6 h-6 text-primary" /> إعدادات الخصومات
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              حدد سقوف الخصم لكل دور — أسباب الخصم إلزامية ويتم تسجيلها في كل مرة.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/coupons"
              data-testid="link-coupons"
              className="inline-flex items-center gap-2 text-sm font-medium bg-card border border-border px-3 py-2 rounded-xl hover:border-primary transition-colors"
            >
              <Tag size={14} /> إدارة الكوبونات
            </Link>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending || rows.length === 0}
              data-testid="save-discount-settings"
              className="inline-flex items-center gap-2 text-sm font-bold text-white bg-primary px-4 py-2.5 rounded-xl hover:opacity-90 disabled:opacity-40"
            >
              <Save size={15} /> {save.isPending ? "جاري الحفظ…" : "حفظ"}
            </button>
          </div>
        </header>

        {/* ── Caps per role ──────────────────────────────────────── */}
        <section className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-secondary/40">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-primary" /> سقوف الخصم لكل دور
            </h2>
          </div>
          {loadingSettings ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">جاري التحميل…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              لم يتم تعيين سقوف بعد. أضف صفاً لكل دور.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-start px-4 py-2.5 font-medium">الدور</th>
                  <th className="text-start px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1"><Percent size={11} /> النسبة القصوى %</span>
                  </th>
                  <th className="text-start px-4 py-2.5 font-medium">
                    <span className="inline-flex items-center gap-1"><Hash size={11} /> المبلغ الأقصى (ر.س)</span>
                  </th>
                  <th className="text-start px-4 py-2.5 font-medium">عدد الخصومات اليومية</th>
                  <th className="text-start px-4 py-2.5 font-medium">سبب الزامي</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.role} className="border-t border-border" data-testid={`role-row-${row.role}`}>
                    <td className="px-4 py-3 font-medium">
                      <span className="px-2 py-0.5 rounded-md bg-secondary text-xs">{ROLE_LABELS_AR[row.role] ?? row.role}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number" min={0} max={100}
                        value={String(row.max_discount_percent ?? 0)}
                        onChange={(e) => updateRow(idx, { max_discount_percent: e.target.value })}
                        className="h-9 w-24 bg-background"
                        data-testid={`input-pct-${row.role}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number" min={0}
                        placeholder="بدون حد"
                        value={row.max_discount_amount === null ? "" : String(row.max_discount_amount)}
                        onChange={(e) => updateRow(idx, { max_discount_amount: e.target.value === "" ? null : e.target.value })}
                        className="h-9 w-28 bg-background"
                        data-testid={`input-amt-${row.role}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Input
                        type="number" min={0}
                        value={String(row.max_daily_uses ?? 0)}
                        onChange={(e) => updateRow(idx, { max_daily_uses: Number(e.target.value) })}
                        className="h-9 w-24 bg-background"
                        data-testid={`input-daily-${row.role}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Switch
                        checked={!!row.requires_reason}
                        onCheckedChange={(v) => updateRow(idx, { requires_reason: v })}
                        data-testid={`switch-reason-${row.role}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ── Recent discount log ─────────────────────────────────── */}
        <section className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border bg-secondary/40 flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-primary" /> سجل الخصومات الأخيرة
            </h2>
            <span className="text-xs text-muted-foreground">{logsData?.logs?.length ?? 0} سجل</span>
          </div>
          {(logsData?.logs?.length ?? 0) === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-muted-foreground">
              لا يوجد سجل خصومات بعد.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-secondary/30 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-start px-4 py-2 font-medium">الوقت</th>
                    <th className="text-start px-4 py-2 font-medium">السبب</th>
                    <th className="text-start px-4 py-2 font-medium">العميل</th>
                    <th className="text-start px-4 py-2 font-medium">القيمة</th>
                    <th className="text-start px-4 py-2 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {logsData!.logs.map((log) => (
                    <tr key={log.id} className="border-t border-border">
                      <td className="px-4 py-2 text-muted-foreground">{new Date(log.created_at).toLocaleString("ar-SA", { dateStyle: "short", timeStyle: "short" })}</td>
                      <td className="px-4 py-2">{log.reason}</td>
                      <td className="px-4 py-2">{log.customer_name ?? "—"}{log.customer_phone ? ` (${log.customer_phone})` : ""}</td>
                      <td className="px-4 py-2 font-semibold">
                        {log.discount_type === "percent" ? `${log.discount_value}%` : `${log.discount_value} ر.س`}
                      </td>
                      <td className="px-4 py-2">
                        {log.rejected ? (
                          <span className="inline-flex items-center gap-1 text-destructive text-[11px]">
                            <AlertTriangle size={11} /> مرفوض {log.rejection_reason ? `· ${log.rejection_reason}` : ""}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                            <Check size={11} /> مُطبَّق
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
