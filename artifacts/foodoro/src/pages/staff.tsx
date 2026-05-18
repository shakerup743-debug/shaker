import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, Plus, Pencil, Trash2, ShieldCheck, ToggleLeft, ToggleRight,
  Search, X, Eye, EyeOff, UserCog, Crown, ChefHat, Package, Calculator,
  Briefcase, UserCheck, Coffee, Truck, Shield, KeyRound,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { PasswordStrength } from "@/components/password-strength";

type Role =
  | "owner" | "admin" | "area_manager" | "branch_manager"
  | "cashier" | "waiter" | "kitchen_staff" | "accountant"
  | "hr" | "inventory_manager";

interface StaffUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  isActive: boolean;
  mfaEnabled?: boolean;
  hasPin?: boolean;
  createdAt: string;
}

const ROLE_META: Record<Role, { labelEn: string; labelAr: string; icon: React.ElementType; color: string }> = {
  owner:            { labelEn: "Owner",            labelAr: "مالك",         icon: Crown,       color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20" },
  admin:            { labelEn: "Admin",             labelAr: "مدير عام",     icon: ShieldCheck, color: "text-red-400 bg-red-400/10 border-red-400/20" },
  area_manager:     { labelEn: "Area Manager",      labelAr: "مدير منطقة",   icon: UserCog,     color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  branch_manager:   { labelEn: "Branch Manager",    labelAr: "مدير فرع",     icon: Briefcase,   color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  cashier:          { labelEn: "Cashier",           labelAr: "كاشير",        icon: Calculator,  color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  waiter:           { labelEn: "Waiter",            labelAr: "نادل",         icon: Coffee,      color: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20" },
  kitchen_staff:    { labelEn: "Kitchen Staff",     labelAr: "طاقم المطبخ",  icon: ChefHat,     color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  accountant:       { labelEn: "Accountant",        labelAr: "محاسب",        icon: Calculator,  color: "text-teal-400 bg-teal-400/10 border-teal-400/20" },
  hr:               { labelEn: "HR",                labelAr: "موارد بشرية",  icon: UserCheck,   color: "text-pink-400 bg-pink-400/10 border-pink-400/20" },
  inventory_manager:{ labelEn: "Inventory Manager", labelAr: "مدير مخزون",  icon: Package,     color: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
};

const ALL_ROLES = Object.keys(ROLE_META) as Role[];

function RoleBadge({ role }: { role: Role }) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const meta = ROLE_META[role];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${meta.color}`}>
      <Icon size={10} />
      {isAr ? meta.labelAr : meta.labelEn}
    </span>
  );
}

function StaffForm({
  initial,
  onSubmit,
  loading,
  isEdit,
}: {
  initial?: Partial<StaffUser & { password: string }>;
  onSubmit: (data: { name: string; email: string; password?: string; role: Role; pin?: string | null }) => void;
  loading: boolean;
  isEdit: boolean;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>(initial?.role ?? "cashier");
  const [showPass, setShowPass] = useState(false);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [clearPin, setClearPin] = useState(false);

  const pinValid = pin === "" || /^\d{4,6}$/.test(pin);

  const handle = () => {
    if (!name.trim() || !email.trim() || (!isEdit && !password)) return;
    if (!pinValid) return;
    const data: { name: string; email: string; password?: string; role: Role; pin?: string | null } = { name, email, role };
    if (password) data.password = password;
    // pin logic: clearPin → send null; new pin entered → send pin value; blank → undefined (keep)
    if (clearPin) data.pin = null;
    else if (pin) data.pin = pin;
    onSubmit(data);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{isAr ? "الاسم" : "Name"}</Label>
        <Input className="bg-background border-border" value={name} onChange={e => setName(e.target.value)} placeholder={isAr ? "اسم الموظف" : "Full name"} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{isAr ? "البريد الإلكتروني" : "Email"}</Label>
        <Input type="email" className="bg-background border-border" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" disabled={isEdit} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{isAr ? "كلمة المرور" : "Password"}{isEdit && <span className="text-muted-foreground/60 ms-1">{isAr ? "(اتركها فارغة للإبقاء)" : "(leave blank to keep)"}</span>}</Label>
        <div className="relative">
          <Input type={showPass ? "text" : "password"} className="bg-background border-border pe-10" value={password} onChange={e => setPassword(e.target.value)} placeholder={isEdit ? "••••••••" : (isAr ? "كلمة مرور قوية" : "Strong password")} />
          <button type="button" onClick={() => setShowPass(v => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        {password && <PasswordStrength password={password} />}
      </div>

      {/* PIN Field */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
            <KeyRound size={12} />
            {isAr ? "رمز PIN (4-6 أرقام)" : "PIN Code (4-6 digits)"}
            {isEdit && (
              <span className="text-muted-foreground/60">
                {isAr ? "(اتركه فارغاً للإبقاء)" : "(leave blank to keep)"}
              </span>
            )}
          </Label>
          {isEdit && initial?.hasPin && !clearPin && (
            <button
              type="button"
              onClick={() => { setClearPin(true); setPin(""); }}
              className="text-[11px] text-destructive hover:text-destructive/80 transition-colors"
            >
              {isAr ? "إزالة PIN" : "Remove PIN"}
            </button>
          )}
          {isEdit && clearPin && (
            <button
              type="button"
              onClick={() => setClearPin(false)}
              className="text-[11px] text-primary hover:text-primary/80 transition-colors"
            >
              {isAr ? "تراجع" : "Undo"}
            </button>
          )}
        </div>

        {isEdit && initial?.hasPin && !clearPin && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 mb-1">
            <KeyRound size={13} className="text-emerald-400 shrink-0" />
            <span className="text-xs text-emerald-400 font-medium">{isAr ? "PIN مُعيَّن — أدخل قيمة جديدة للتغيير" : "PIN is set — enter a new value to change"}</span>
          </div>
        )}

        {isEdit && !initial?.hasPin && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-orange-500/10 border border-orange-500/20 mb-1">
            <KeyRound size={13} className="text-orange-400 shrink-0" />
            <span className="text-xs text-orange-400 font-medium">{isAr ? "لم يُعيَّن PIN بعد" : "No PIN set yet"}</span>
          </div>
        )}

        {clearPin ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20">
            <KeyRound size={13} className="text-destructive shrink-0" />
            <span className="text-xs text-destructive font-medium">{isAr ? "سيتم إزالة PIN عند الحفظ" : "PIN will be removed on save"}</span>
          </div>
        ) : (
          <div className="relative">
            <Input
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              maxLength={6}
              className={`bg-background border-border pe-10 tracking-widest font-mono ${pin && !pinValid ? "border-red-500" : ""}`}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder={isEdit ? "••••••" : (isAr ? "اختياري — 4 إلى 6 أرقام" : "Optional — 4 to 6 digits")}
            />
            <button type="button" onClick={() => setShowPin(v => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        )}

        {pin && !pinValid && (
          <p className="text-xs text-red-500">{isAr ? "PIN يجب أن يكون 4-6 أرقام" : "PIN must be 4–6 digits"}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">{isAr ? "الدور الوظيفي" : "Role"}</Label>
        <div className="grid grid-cols-2 gap-1.5">
          {ALL_ROLES.map(r => {
            const meta = ROLE_META[r];
            const Icon = meta.icon;
            return (
              <button key={r} type="button" onClick={() => setRole(r)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${role === r ? meta.color + " ring-1 ring-current" : "border-border bg-background text-muted-foreground hover:text-foreground"}`}>
                <Icon size={12} />
                {isAr ? meta.labelAr : meta.labelEn}
              </button>
            );
          })}
        </div>
      </div>
      <button onClick={handle} disabled={loading || !name || !email || (!isEdit && !password) || !pinValid}
        className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
        {loading ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isEdit ? (isAr ? "تحديث" : "Update") : (isAr ? "إضافة موظف" : "Add Staff"))}
      </button>
    </div>
  );
}

/* ── PIN Setup Dialog ──────────────────────────────────────────────────────── */
function PinSetupDialog({
  user,
  onClose,
  fetcher,
}: {
  user: StaffUser;
  onClose: () => void;
  fetcher: (path: string, opts?: RequestInit) => Promise<unknown>;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const { toast } = useToast();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const isValid = pin.length >= 4 && pin.length <= 6 && /^\d+$/.test(pin) && pin === confirm;

  const save = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await fetcher(`/api/users/${user.id}/pin`, { method: "PATCH", body: JSON.stringify({ pin }) });
      toast({ title: isAr ? "تم تعيين PIN بنجاح" : "PIN set successfully" });
      onClose();
    } catch {
      toast({ title: isAr ? "خطأ في تعيين PIN" : "Failed to set PIN", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const clear = async () => {
    setLoading(true);
    try {
      await fetcher(`/api/users/${user.id}/pin`, { method: "PATCH", body: JSON.stringify({ pin: null }) });
      toast({ title: isAr ? "تم إزالة PIN" : "PIN removed" });
      onClose();
    } catch {
      toast({ title: isAr ? "خطأ في الإزالة" : "Failed to remove PIN", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 p-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
        <div className="w-9 h-9 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-orange-400">{user.name.charAt(0).toUpperCase()}</span>
        </div>
        <div>
          <p className="text-sm font-semibold">{user.name}</p>
          <RoleBadge role={user.role} />
        </div>
      </div>

      <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-xs text-muted-foreground space-y-1">
        <p>• {isAr ? "PIN يجب أن يكون 4-6 أرقام فقط" : "PIN must be 4-6 digits only"}</p>
        <p>• {isAr ? "PIN مشفر بالكامل ولا يمكن لأحد رؤيته" : "PIN is fully encrypted and visible to no one"}</p>
        <p>• {isAr ? "فقط المدير يستطيع إعادة تعيينه" : "Only admin can reset it"}</p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{isAr ? "PIN الجديد (4-6 أرقام)" : "New PIN (4-6 digits)"}</Label>
          <div className="relative">
            <Input
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              maxLength={6}
              className="bg-background border-border pe-10 tracking-widest text-lg font-mono"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••••"
            />
            <button type="button" onClick={() => setShowPin(v => !v)} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{isAr ? "تأكيد PIN" : "Confirm PIN"}</Label>
          <Input
            type="password"
            inputMode="numeric"
            maxLength={6}
            className={`bg-background border-border tracking-widest text-lg font-mono ${confirm && confirm !== pin ? "border-red-500" : confirm && confirm === pin ? "border-green-500" : ""}`}
            value={confirm}
            onChange={e => setConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="••••••"
          />
          {confirm && confirm !== pin && (
            <p className="text-xs text-red-500">{isAr ? "PIN غير متطابق" : "PINs do not match"}</p>
          )}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => void save()} disabled={!isValid || loading}
          className="flex-1 h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {loading ? (isAr ? "جارٍ الحفظ..." : "Saving...") : (isAr ? "حفظ PIN" : "Save PIN")}
        </button>
        <button
          onClick={() => void clear()} disabled={loading}
          className="h-10 px-4 rounded-xl border border-border text-destructive text-sm hover:bg-destructive/10 transition-colors"
        >
          {isAr ? "إزالة" : "Remove"}
        </button>
      </div>
    </div>
  );
}

export default function StaffPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<Role | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<StaffUser | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [pinUser, setPinUser] = useState<StaffUser | null>(null);

  const fetcher = async (path: string, opts?: RequestInit) => {
    const token = await getToken();
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) } });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<unknown>;
  };

  const { data: users, isLoading } = useQuery<StaffUser[]>({
    queryKey: ["staff"],
    queryFn: () => fetcher("/api/users") as Promise<StaffUser[]>,
  });

  const createMut = useMutation({
    mutationFn: (body: object) => fetcher("/api/users", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["staff"] }); setCreateOpen(false); toast({ title: isAr ? "تمت الإضافة" : "Staff added" }); },
    onError: (e: Error) => toast({ title: e.message.includes("PIN") ? (isAr ? "PIN يجب أن يكون 4-6 أرقام" : "PIN must be 4–6 digits") : (isAr ? "خطأ في الإضافة" : "Error adding staff"), variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => fetcher(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["staff"] }); setEditUser(null); toast({ title: isAr ? "تم التحديث" : "Updated" }); },
    onError: (e: Error) => toast({ title: e.message.includes("PIN") ? (isAr ? "PIN يجب أن يكون 4-6 أرقام" : "PIN must be 4–6 digits") : (isAr ? "خطأ في التحديث" : "Error updating"), variant: "destructive" }),
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => fetcher(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["staff"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetcher(`/api/users/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["staff"] }); setDeleteId(null); toast({ title: isAr ? "تم الحذف" : "Deleted" }); },
    onError: (e: Error) => toast({ title: e.message.includes("own account") ? (isAr ? "لا يمكن حذف حسابك الخاص" : "Cannot delete your own account") : (isAr ? "فشل الحذف" : "Delete failed"), variant: "destructive" }),
  });

  const filtered = (users ?? []).filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "all" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  const roleGroups = ALL_ROLES.reduce<Record<string, number>>((acc, r) => {
    acc[r] = (users ?? []).filter(u => u.role === r).length;
    return acc;
  }, {});

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background p-5 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "إدارة الموظفين" : "Staff Management"}</h1>
            <p className="text-xs text-muted-foreground">{(users ?? []).length} {isAr ? "موظف" : "employees"}</p>
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={14} />
          {isAr ? "موظف جديد" : "Add Staff"}
        </button>
      </div>

      {/* Role Filter Pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 shrink-0 scrollbar-none">
        <button onClick={() => setFilterRole("all")}
          className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${filterRole === "all" ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
          {isAr ? "الكل" : "All"} ({(users ?? []).length})
        </button>
        {ALL_ROLES.filter(r => roleGroups[r] > 0).map(r => {
          const meta = ROLE_META[r];
          return (
            <button key={r} onClick={() => setFilterRole(r === filterRole ? "all" : r)}
              className={`shrink-0 px-3 py-1.5 rounded-full border text-xs font-medium transition-all ${filterRole === r ? meta.color + " ring-1 ring-current" : "border-border text-muted-foreground hover:text-foreground"}`}>
              {isAr ? meta.labelAr : meta.labelEn} ({roleGroups[r]})
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="relative shrink-0">
        <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="bg-card border-border ps-8 pe-8 h-9 text-sm" placeholder={isAr ? "بحث باسم أو بريد..." : "Search by name or email..."} value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch("")} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={14} /></button>}
      </div>

      {/* Staff Grid */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Users size={32} className="mb-2 opacity-30" />
            <p className="text-sm">{isAr ? "لا يوجد موظفون" : "No staff found"}</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map(u => {
              const meta = ROLE_META[u.role] ?? ROLE_META.cashier;
              const Icon = meta.icon;
              const initials = u.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
              return (
                <motion.div key={u.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  className={`flex items-center gap-3 p-3 rounded-2xl bg-card border transition-all ${u.isActive ? "border-border" : "border-border/40 opacity-60"}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${meta.color}`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground truncate">{u.name}</p>
                      <RoleBadge role={u.role} />
                      {u.mfaEnabled ? (
                        <span title={isAr ? "التحقق بخطوتين مفعّل" : "MFA Enabled"} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 text-[10px] font-medium">
                          <Shield size={9} /> MFA
                        </span>
                      ) : (
                        <span title={isAr ? "لم يُفعَّل التحقق بخطوتين" : "MFA Not Set Up"} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground/60 text-[10px]">
                          <Shield size={9} />
                        </span>
                      )}
                      {u.hasPin ? (
                        <span title={isAr ? "PIN مُعيَّن" : "PIN set"} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 text-[10px] font-medium">
                          <KeyRound size={9} /> PIN
                        </span>
                      ) : (
                        <span title={isAr ? "لا يوجد PIN" : "No PIN set"} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full border border-orange-400/30 bg-orange-400/10 text-orange-400 text-[10px]">
                          <KeyRound size={9} />
                        </span>
                      )}
                      {!u.isActive && <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">{isAr ? "معطّل" : "Inactive"}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleMut.mutate({ id: u.id, isActive: !u.isActive })} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors" title={isAr ? "تفعيل/تعطيل" : "Toggle active"}>
                      {u.isActive ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => setPinUser(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 transition-colors" title={isAr ? "تعيين PIN" : "Set PIN"}>
                      <KeyRound size={13} />
                    </button>
                    <button onClick={() => setEditUser(u)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title={isAr ? "تعديل" : "Edit"}>
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteId(u.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" title={isAr ? "حذف" : "Delete"}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Stats bar */}
      <div className="shrink-0 grid grid-cols-4 gap-2">
        {(["admin","cashier","kitchen_staff","waiter"] as Role[]).map(r => {
          const meta = ROLE_META[r];
          const Icon = meta.icon;
          return (
            <div key={r} className={`p-3 rounded-xl border ${meta.color} flex items-center gap-2`}>
              <Icon size={14} />
              <div>
                <p className="text-[10px] opacity-70">{isAr ? meta.labelAr : meta.labelEn}</p>
                <p className="text-sm font-bold">{roleGroups[r] ?? 0}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><UserCog size={16} className="text-primary" />{isAr ? "إضافة موظف جديد" : "Add New Staff"}</DialogTitle></DialogHeader>
          <StaffForm isEdit={false} onSubmit={d => createMut.mutate(d)} loading={createMut.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editUser} onOpenChange={o => !o && setEditUser(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil size={16} className="text-primary" />{isAr ? "تعديل الموظف" : "Edit Staff"}</DialogTitle></DialogHeader>
          {editUser && <StaffForm isEdit initial={editUser} onSubmit={d => updateMut.mutate({ id: editUser.id, body: d })} loading={updateMut.isPending} />}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Trash2 size={16} className="text-destructive" />{isAr ? "حذف الموظف" : "Delete Staff"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{isAr ? "هل أنت متأكد من حذف هذا الموظف؟ لا يمكن التراجع." : "Are you sure? This cannot be undone."}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm font-medium">{isAr ? "إلغاء" : "Cancel"}</button>
            <button onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending} className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-semibold disabled:opacity-50">{isAr ? "حذف" : "Delete"}</button>
          </div>
        </DialogContent>
      </Dialog>

      {/* PIN Setup Dialog */}
      <Dialog open={!!pinUser} onOpenChange={o => !o && setPinUser(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound size={16} className="text-orange-500" />
              {isAr ? "تعيين PIN للموظف" : "Set Staff PIN"}
            </DialogTitle>
          </DialogHeader>
          {pinUser && (
            <PinSetupDialog
              user={pinUser}
              onClose={() => setPinUser(null)}
              fetcher={fetcher}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
