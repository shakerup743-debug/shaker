import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, LayoutGrid, Search, ToggleLeft, ToggleRight, Pencil, Trash2, FlaskConical, X } from "lucide-react";
import {
  useListProducts,
  useListCategories,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useToggleProduct,
  useGetProductIngredients,
  useSetProductIngredients,
  useListInventory,
  getListProductsQueryKey,
  getGetProductIngredientsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";
import type { Product } from "@workspace/api-client-react";

function ProductForm({
  initial,
  categories,
  onSubmit,
  loading,
}: {
  initial?: Partial<Product>;
  categories: { id: number; name: string }[];
  onSubmit: (data: { name: string; price: number; categoryId: number; description?: string; imageUrl?: string | null }) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(String(initial?.price ?? ""));
  const [categoryId, setCategoryId] = useState(String(initial?.categoryId ?? ""));
  const [description, setDescription] = useState(initial?.description ?? "");
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null);
  const [imageUrlInput, setImageUrlInput] = useState("");
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File) => {
    if (file.size > 4 * 1024 * 1024) { toast({ title: "حجم الصورة أكبر من 4 ميغا", variant: "destructive" }); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const token = localStorage.getItem("foodoro-token");
      const res = await fetch("/api/uploads/image", {
        method: "POST", body: fd,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json() as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "فشل الرفع");
      setImageUrl(data.url);
      toast({ title: "تم رفع الصورة" });
    } catch (e) {
      toast({ title: (e as Error).message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const useUrl = () => {
    const u = imageUrlInput.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) { toast({ title: "أدخل رابط https صحيح", variant: "destructive" }); return; }
    setImageUrl(u);
    setImageUrlInput("");
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("products.form.name")}</Label>
        <Input className="bg-background border-border" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("products.form.namePlaceholder")} data-testid="input-product-name" />
      </div>

      {/* صورة المنتج */}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">صورة المنتج (اختياري)</Label>
        <div className="flex items-start gap-3">
          {imageUrl ? (
            <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-border bg-muted">
              <img src={imageUrl} alt="product" className="w-full h-full object-cover" />
              <button type="button"
                onClick={() => setImageUrl(null)}
                className="absolute top-0.5 end-0.5 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center"
                aria-label="remove"
                data-testid="remove-product-image">×</button>
            </div>
          ) : (
            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground text-center px-1">
              بدون صورة
            </div>
          )}
          <div className="flex-1 space-y-2">
            <label className="block">
              <span className="text-[11px] text-muted-foreground">رفع من جهازك (≤ 4 ميغا)</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ""; }}
                disabled={uploading}
                data-testid="input-product-image-file"
                className="block w-full text-xs file:me-2 file:px-3 file:py-1.5 file:rounded-md file:border-0 file:text-xs file:bg-primary file:text-white file:cursor-pointer mt-0.5"
              />
            </label>
            <div className="flex gap-1.5">
              <Input
                placeholder="أو الصق رابط الصورة"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                className="bg-background border-border text-xs h-9"
                data-testid="input-product-image-url"
              />
              <button
                type="button"
                onClick={useUrl}
                disabled={!imageUrlInput.trim()}
                className="text-xs px-2.5 h-9 rounded-md bg-foreground/10 hover:bg-foreground/20 text-foreground disabled:opacity-40"
                data-testid="apply-product-image-url"
              >استخدم</button>
            </div>
            {uploading && <p className="text-[11px] text-primary">جاري الرفع…</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("products.form.price")}</Label>
          <Input type="number" className="bg-background border-border" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={t("products.form.pricePlaceholder")} data-testid="input-product-price" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">{t("products.form.category")}</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="bg-background border-border" data-testid="select-product-category">
              <SelectValue placeholder={t("products.form.selectCategory")} />
            </SelectTrigger>
            <SelectContent className="bg-card border-border">
              {categories.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("products.form.description")}</Label>
        <Input className="bg-background border-border" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("products.form.descriptionPlaceholder")} data-testid="input-product-description" />
      </div>
      <button
        data-testid="button-save-product"
        disabled={!name || !price || !categoryId || loading}
        onClick={() => onSubmit({
          name, price: parseFloat(price), categoryId: parseInt(categoryId),
          description: description || undefined,
          imageUrl: imageUrl ?? undefined,
        })}
        className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold text-sm transition-colors disabled:opacity-40"
      >
        {loading ? t("products.form.saving") : initial?.id ? t("products.form.update") : t("products.form.save")}
      </button>
    </div>
  );
}

function RecipeEditor({ productId }: { productId: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: existingIngredients = [], isLoading } = useGetProductIngredients(productId);
  const { data: inventoryItems = [] } = useListInventory({});
  const setIngredientsMutation = useSetProductIngredients();

  const [rows, setRows] = useState<{ inventoryId: string; qty: string }[] | null>(null);

  const displayRows = rows ?? existingIngredients.map((i) => ({
    inventoryId: String(i.inventoryId),
    qty: String(i.quantityPerUnit),
  }));

  const addRow = () => setRows([...displayRows, { inventoryId: "", qty: "" }]);

  const removeRow = (idx: number) =>
    setRows(displayRows.filter((_, i) => i !== idx));

  const updateRow = (idx: number, field: "inventoryId" | "qty", value: string) =>
    setRows(displayRows.map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  const handleSave = async () => {
    const valid = displayRows.filter((r) => r.inventoryId && parseFloat(r.qty) > 0);
    try {
      await setIngredientsMutation.mutateAsync({
        id: productId,
        data: {
          ingredients: valid.map((r) => ({
            inventoryId: parseInt(r.inventoryId),
            quantityPerUnit: parseFloat(r.qty),
          })),
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetProductIngredientsQueryKey(productId) });
      toast({ title: t("products.recipe.saved") });
    } catch {
      toast({ title: t("products.toast.error"), description: t("products.recipe.error"), variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical size={14} className="text-primary" />
          <span className="text-sm font-medium">{t("products.recipe.title")}</span>
        </div>
        <button
          data-testid="button-add-ingredient"
          onClick={addRow}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
        >
          <Plus size={12} />
          {t("products.recipe.add")}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{t("products.recipe.subtitle")}</p>

      {displayRows.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-1">{t("products.recipe.noIngredients")}</p>
      ) : (
        <div className="space-y-2">
          {displayRows.map((row, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select value={row.inventoryId} onValueChange={(v) => updateRow(idx, "inventoryId", v)}>
                <SelectTrigger className="flex-1 bg-background border-border h-8 text-xs" data-testid={`select-ingredient-${idx}`}>
                  <SelectValue placeholder={t("products.recipe.selectIngredient")} />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {inventoryItems.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name} ({item.unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                className="w-20 bg-background border-border h-8 text-xs"
                value={row.qty}
                onChange={(e) => updateRow(idx, "qty", e.target.value)}
                placeholder="0"
                data-testid={`input-ingredient-qty-${idx}`}
              />
              <button
                onClick={() => removeRow(idx)}
                className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors shrink-0"
                data-testid={`button-remove-ingredient-${idx}`}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        data-testid="button-save-recipe"
        disabled={setIngredientsMutation.isPending}
        onClick={handleSave}
        className="w-full h-9 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-medium transition-colors disabled:opacity-40"
      >
        {setIngredientsMutation.isPending ? t("products.form.saving") : t("products.recipe.save")}
      </button>
    </div>
  );
}

export default function ProductsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: products, isLoading } = useListProducts(selectedCategory ? { categoryId: selectedCategory } : {});
  const { data: categories } = useListCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();
  const toggleProduct = useToggleProduct();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filtered = products?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });

  const handleCreate = async (data: { name: string; price: number; categoryId: number; description?: string; imageUrl?: string | null }) => {
    try {
      await createProduct.mutateAsync({ data });
      invalidate();
      setCreateOpen(false);
      toast({ title: t("products.toast.created") });
    } catch {
      toast({ title: t("products.toast.error"), description: t("products.toast.failedCreate"), variant: "destructive" });
    }
  };

  const handleUpdate = async (data: { name: string; price: number; categoryId: number; description?: string; imageUrl?: string | null }) => {
    if (!editProduct) return;
    try {
      await updateProduct.mutateAsync({ id: editProduct.id, data });
      invalidate();
      setEditProduct(null);
      toast({ title: t("products.toast.updated") });
    } catch {
      toast({ title: t("products.toast.error"), description: t("products.toast.failedUpdate"), variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteProduct.mutateAsync({ id: deleteId });
      invalidate();
      setDeleteId(null);
      toast({ title: t("products.toast.deleted") });
    } catch {
      toast({ title: t("products.toast.error"), description: t("products.toast.failedDelete"), variant: "destructive" });
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await toggleProduct.mutateAsync({ id });
      invalidate();
    } catch {
      toast({ title: t("products.toast.error"), variant: "destructive" });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <LayoutGrid size={18} className="text-primary" />
          <h1 className="text-base font-semibold">{t("products.title")}</h1>
          <span className="text-xs text-muted-foreground">{products?.length ?? 0} {t("products.items")}</span>
        </div>
        <button
          data-testid="button-add-product"
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium transition-colors"
        >
          <Plus size={15} />
          {t("products.addProduct")}
        </button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b border-border">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("products.search")}
            className="ps-8 h-8 bg-card border-border text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search-products"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          <button
            data-testid="filter-all-products"
            onClick={() => setSelectedCategory(null)}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors
              ${!selectedCategory ? "bg-primary text-white" : "bg-card text-muted-foreground hover:text-foreground"}`}
          >
            {t("products.all")}
          </button>
          {categories?.map((cat) => (
            <button
              key={cat.id}
              data-testid={`filter-products-cat-${cat.id}`}
              onClick={() => setSelectedCategory(cat.id === selectedCategory ? null : cat.id)}
              className={`shrink-0 px-3 py-1 rounded-lg text-xs font-medium transition-colors
                ${selectedCategory === cat.id ? "bg-primary text-white" : "bg-card text-muted-foreground hover:text-foreground"}`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            initial="hidden" animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
          >
            {filtered?.map((product) => (
              <motion.div
                key={product.id}
                variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
                data-testid={`card-product-mgmt-${product.id}`}
                className={`p-4 rounded-2xl border bg-card transition-all ${product.isActive ? "border-border" : "border-border opacity-50"}`}
              >
                <div className="flex items-start justify-between mb-3">
                  {product.imageUrl ? (
                    <div className="w-9 h-9 rounded-xl overflow-hidden bg-muted border border-border">
                      <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" loading="lazy" />
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
                      <span className="text-primary font-bold">{product.name.charAt(0)}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <button data-testid={`button-toggle-${product.id}`} onClick={() => handleToggle(product.id)} className="w-7 h-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                      {product.isActive ? <ToggleRight size={16} className="text-primary" /> : <ToggleLeft size={16} />}
                    </button>
                    <button data-testid={`button-edit-${product.id}`} onClick={() => setEditProduct(product)} className="w-7 h-7 rounded-lg hover:bg-accent flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button data-testid={`button-delete-${product.id}`} onClick={() => setDeleteId(product.id)} className="w-7 h-7 rounded-lg hover:bg-destructive/10 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
                <p className="font-semibold text-sm text-foreground line-clamp-1 text-start">{product.name}</p>
                {product.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{product.description}</p>}
                <div className="flex items-center justify-between mt-3">
                  <span className="text-primary font-bold text-base">{t("common.sar")} {product.price.toFixed(2)}</span>
                  {product.categoryName && (
                    <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded-lg">{product.categoryName}</span>
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm">
          <DialogHeader><DialogTitle>{t("products.addProduct")}</DialogTitle></DialogHeader>
          <ProductForm categories={categories ?? []} onSubmit={handleCreate} loading={createProduct.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editProduct} onOpenChange={(o) => !o && setEditProduct(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("products.edit")}</DialogTitle></DialogHeader>
          {editProduct && (
            <div className="space-y-5">
              <ProductForm initial={editProduct} categories={categories ?? []} onSubmit={handleUpdate} loading={updateProduct.isPending} />
              <div className="border-t border-border pt-4">
                <RecipeEditor productId={editProduct.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <DialogContent className="bg-card border-border text-foreground max-w-xs">
          <DialogHeader><DialogTitle>{t("products.delete.title")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("products.delete.message")}</p>
          <div className="flex gap-2 mt-2">
            <button data-testid="button-cancel-delete" onClick={() => setDeleteId(null)} className="flex-1 h-10 rounded-xl bg-secondary text-foreground text-sm font-medium">{t("products.delete.cancel")}</button>
            <button data-testid="button-confirm-delete-product" onClick={handleDelete} disabled={deleteProduct.isPending} className="flex-1 h-10 rounded-xl bg-destructive text-white text-sm font-semibold">{t("products.delete.confirm")}</button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
