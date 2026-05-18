import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GitBranch, Plus, Pencil, Trash2, MapPin, Phone, User,
  Building2, ToggleLeft, ToggleRight, Search, X,
} from "lucide-react";
import { useAuth } from "@/lib/clerk-shim";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface Branch {
  id: number;
  tenantId: number;
  name: string;
  nameAr: string | null;
  city: string | null;
  address: string | null;
  phone: string | null;
  managerName: string | null;
  isActive: boolean;
  createdAt: string;
}

function BranchForm({
  initial,
  onSubmit,
  loading,
  isEdit,
}: {
  initial?: Partial<Branch>;
  onSubmit: (data: Partial<Branch>) => void;
  loading: boolean;
  isEdit: boolean;
}) {
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    nameAr: initial?.nameAr ?? "",
    city: initial?.city ?? "",
    address: initial?.address ?? "",
    phone: initial?.phone ?? "",
    managerName: initial?.managerName ?? "",
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{isAr ? "الاسم (إنجليزي)" : "Name (EN)"}</Label>
          <Input className="bg-background border-border" value={form.name} onChange={e => set("name", e.target.value)} placeholder="Main Branch" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{isAr ? "الاسم (عربي)" : "Name (AR)"}</Label>
          <Input className="bg-background border-border" value={form.nameAr} onChange={e => set("nameAr", e.target.value)} placeholder="الفرع الرئيسي" dir="rtl" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{isAr ? "المدينة" : "City"}</Label>
          <Input className="bg-background border-border" value={form.city} onChange={e => set("city", e.target.value)} placeholder={isAr ? "الرياض" : "Riyadh"} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{isAr ? "الهاتف" : "Phone"}</Label>
          <Input className="bg-background border-border" value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+966 5x xxx xxxx" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{isAr ? "العنوان" : "Address"}</Label>
        <Input className="bg-background border-border" value={form.address} onChange={e => set("address", e.target.value)} placeholder={isAr ? "العنوان التفصيلي" : "Full address"} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{isAr ? "اسم المدير" : "Manager Name"}</Label>
        <Input className="bg-background border-border" value={form.managerName} onChange={e => set("managerName", e.target.value)} placeholder={isAr ? "اسم مدير الفرع" : "Branch manager name"} />
      </div>
      <button onClick={() => onSubmit(form)} disabled={loading || !form.name}
        className="w-full h-10 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors">
        {loading ? (isAr ? "جارٍ الحفظ..." : "Saving...") : isEdit ? (isAr ? "تحديث" : "Update") : (isAr ? "إضافة فرع" : "Add Branch")}
      </button>
    </div>
  );
}

export default function BranchesPage() {
  const { getToken } = useAuth();
  const { i18n } = useTranslation();
  const isAr = i18n.language === "ar";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const fetcher = async (path: string, opts?: RequestInit) => {
    const token = await getToken();
    const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts?.headers ?? {}) } });
    if (!res.ok) throw new Error(await res.text());
    if (opts?.method === "DELETE") return null;
    return res.json() as Promise<unknown>;
  };

  const { data: branches, isLoading } = useQuery<Branch[]>({
    queryKey: ["branches"],
    queryFn: () => fetcher("/api/branches") as Promise<Branch[]>,
  });

  const createMut = useMutation({
    mutationFn: (body: object) => fetcher("/api/branches", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["branches"] }); setCreateOpen(false); toast({ title: isAr ? "تم إضافة الفرع" : "Branch added" }); },
    onError: (e) => toast({ title: String(e), variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => fetcher(`/api/branches/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["branches"] }); setEditBranch(null); toast({ title: isAr ? "تم التحديث" : "Updated" }); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) => fetcher(`/api/branches/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["branches"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => fetcher(`/api/branches/${id}`, { method: "DELETE" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["branches"] }); setDeleteId(null); toast({ title: isAr ? "تم الحذف" : "Deleted" }); },
  });

  const filtered = (branches ?? []).filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    (b.city ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (b.managerName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = (branches ?? []).filter(b => b.isActive).length;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-background p-5 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <GitBranch size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground">{isAr ? "إدارة الفروع" : "Branch Management"}</h1>
            <p className="text-xs text-muted-foreground">
              {activeCount}/{(branches ?? []).length} {isAr ? "فرع نشط" : "active branches"}
            </p>
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={14} />
          {isAr ? "فرع جديد" : "New Branch"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 shrink-0">
        {[
          { label: isAr ? "إجمالي الفروع" : "Total Branches", value: (branches ?? []).length, color: "text-primary bg-primary/10 border-primary/20" },
          { label: isAr ? "نشطة" : "Active", value: activeCount, color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
          { label: isAr ? "معطّلة" : "Inactive", value: (branches ?? []).length - activeCount, color: "text-muted-foreground bg-muted/10 border-border" },
        ].map(s => (
          <div key={s.label} className={`p-3 rounded-xl border ${s.color} text-center`}>
            <p className="text-xl font-bold">{s.value}</p>
            <p className="text-[10px] opacity-70 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative shrink-0">
        <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input className="bg-card border-border ps-8 pe-8 h-9 text-sm" placeholder={isAr ? "بحث بالاسم أو المدينة..." : "Search by name or city..."} value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch("")} className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X size={14} /></button>}
      </div>

      {/* Branches Grid */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 gap-3 content-start">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-2xl" />)
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Building2 size={32} className="mb-2 opacity-30" />
            <p className="text-sm">{isAr ? "لا توجد فروع" : "No branches found"}</p>
            <button onClick={() => setCreateOpen(true)} className="mt-3 text-xs text-primary hover:underline">{isAr ? "أضف فرعاً الآن" : "Add one now"}</button>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filtered.map(b => (
              <motion.div key={b.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`p-4 rounded-2xl bg-card border transition-all ${b.isActive ? "border-border" : "border-border/40 opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 size={18} className="text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{b.name}</p>
                      {b.nameAr && <p className="text-xs text-muted-foreground" dir="rtl">{b.nameAr}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => toggleMut.mutate({ id: b.id, isActive: !b.isActive })} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent">
                      {b.isActive ? <ToggleRight size={16} className="text-emerald-400" /> : <ToggleLeft size={16} />}
                    </button>
                    <button onClick={() => setEditBranch(b)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => setDeleteId(b.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  {b.city && <span className="flex items-center gap-1"><MapPin size={11} />{b.city}</span>}
                  {b.phone && <span className="flex items-center gap-1"><Phone size={11} />{b.phone}</span>}
                  {b.managerName && <span className="flex items-center gap-1"><User size={11} />{b.managerName}</span>}
                  {b.address && <span className="flex items-center gap-1 col-span-2">{b.address}</span>}
                </div>
                {!b.isActive && (
                  <div className="mt-2 px-2 py-1 rounded-lg bg-muted/20 border border-border/50 text-[10px] text-muted-foreground">
                    {isAr ? "هذا الفرع معطّل" : "This branch is inactive"}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><GitBranch size={16} className="text-primary" />{isAr ? "إضافة فرع جديد" : "Add New Branch"}</DialogTitle></DialogHeader>
          <BranchForm isEdit={false} onSubmit={d => createMut.mutate(d)} loading={createMut.isPending} />
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editBranch} onOpenChange={o => !o && setEditBranch(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil size={16} className="text-primary" />{isAr ? "تعديل الفرع" : "Edit Branch"}</DialogTitle></DialogHeader>
          {editBranch && <BranchForm isEdit initial={editBranch} onSubmit={d => updateMut.mutate({ id: editBranch.id, body: d })} loading={updateMut.isPending} />}
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteId !== null} onOpenChange={o => !o && setDeleteId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2 text-destructive"><Trash2 size={16} />{isAr ? "حذف الفرع" : "Delete Branch"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{isAr ? "هل أنت متأكد من حذف هذا الفرع؟" : "Are you sure you want to delete this branch?"}</p>
          <div className="flex gap-2 mt-2">
            <button onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm">{isAr ? "إلغاء" : "Cancel"}</button>
            <button onClick={() => deleteId && deleteMut.mutate(deleteId)} disabled={deleteMut.isPending} className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-semibold disabled:opacity-50">{isAr ? "حذف" : "Delete"}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
