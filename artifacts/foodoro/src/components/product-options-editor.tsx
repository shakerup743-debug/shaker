import { useState } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Types ─────────────────────────────────────────────────────────────────
export interface ProductOptionItem {
  id: string;
  name: string;
  /** "delta" = adds to base price (e.g. "+5 ر.س"); "full" = replaces base entirely (e.g. "حجم كبير = 40 ر.س") */
  priceMode: "delta" | "full";
  /** Used when priceMode === "delta". 0 when mode is "full". */
  priceDelta: number;
  /** Used when priceMode === "full". Absolute price for this variant. */
  price?: number;
  isDefault?: boolean;
}

export interface ProductOptionGroup {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  maxSelect?: number;
  items: ProductOptionItem[];
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Editor ────────────────────────────────────────────────────────────────
export function ProductOptionsEditor({
  groups,
  onChange,
}: {
  groups: ProductOptionGroup[];
  onChange: (next: ProductOptionGroup[]) => void;
}) {
  const [openGroup, setOpenGroup] = useState<string | null>(groups[0]?.id ?? null);

  const addGroup = () => {
    const g: ProductOptionGroup = {
      id: uid(),
      name: "",
      required: false,
      multiSelect: false,
      items: [{ id: uid(), name: "", priceMode: "delta", priceDelta: 0 }],
    };
    onChange([...groups, g]);
    setOpenGroup(g.id);
  };

  const updateGroup = (id: string, patch: Partial<ProductOptionGroup>) =>
    onChange(groups.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const removeGroup = (id: string) => onChange(groups.filter((g) => g.id !== id));

  const addItem = (gid: string, mode: "delta" | "full") =>
    updateGroup(gid, {
      items: [
        ...(groups.find((g) => g.id === gid)?.items ?? []),
        { id: uid(), name: "", priceMode: mode, priceDelta: 0, ...(mode === "full" ? { price: 0 } : {}) },
      ],
    });

  const updateItem = (gid: string, iid: string, patch: Partial<ProductOptionItem>) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    updateGroup(gid, {
      items: g.items.map((it) => {
        if (it.id !== iid) return it;
        const next = { ...it, ...patch };
        // Keep the unused field in a sane state when mode flips
        if (next.priceMode === "delta") next.price = undefined;
        if (next.priceMode === "full" && (next.price === undefined || Number.isNaN(next.price))) next.price = 0;
        return next;
      }),
    });
  };

  const removeItem = (gid: string, iid: string) => {
    const g = groups.find((x) => x.id === gid);
    if (!g) return;
    updateGroup(gid, { items: g.items.filter((it) => it.id !== iid) });
  };

  return (
    <div className="space-y-3" data-testid="product-options-editor">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">
          خيارات المنتج (أحجام / إضافات){" "}
          <span className="text-[10px] opacity-60">— اختياري</span>
        </Label>
        <button
          type="button"
          onClick={addGroup}
          className="text-xs text-primary hover:underline flex items-center gap-1"
          data-testid="add-option-group-btn"
        >
          <Plus size={12} /> أضف مجموعة
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="text-[11px] text-muted-foreground bg-muted/30 border border-dashed border-border rounded-lg px-3 py-3 text-center">
          لا توجد خيارات. اضغط "أضف مجموعة" لإنشاء حجم أو إضافات.
        </div>
      ) : (
        groups.map((g) => {
          const isOpen = openGroup === g.id;
          return (
            <div
              key={g.id}
              className="border border-border rounded-xl bg-muted/20"
              data-testid={`option-group-${g.id}`}
            >
              <button
                type="button"
                onClick={() => setOpenGroup(isOpen ? null : g.id)}
                className="w-full flex items-center justify-between px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span className="text-xs font-semibold truncate">
                    {g.name || "مجموعة بدون اسم"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    ({g.items.length} خيار)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeGroup(g.id);
                  }}
                  className="text-destructive hover:opacity-80"
                  data-testid={`remove-group-${g.id}`}
                  aria-label="remove group"
                >
                  <Trash2 size={14} />
                </button>
              </button>

              {isOpen && (
                <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                  <div className="grid grid-cols-1 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">
                        اسم المجموعة (مثل: الحجم، الإضافات)
                      </Label>
                      <Input
                        className="bg-background border-border h-8 text-xs"
                        value={g.name}
                        onChange={(e) => updateGroup(g.id, { name: e.target.value })}
                        placeholder="الحجم"
                        data-testid={`group-name-${g.id}`}
                      />
                    </div>

                    <div className="flex gap-3 text-[11px] text-foreground/90">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={g.required}
                          onChange={(e) => updateGroup(g.id, { required: e.target.checked })}
                          data-testid={`group-required-${g.id}`}
                        />
                        إجباري
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={g.multiSelect}
                          onChange={(e) => updateGroup(g.id, { multiSelect: e.target.checked })}
                          data-testid={`group-multi-${g.id}`}
                        />
                        السماح بتعدد الاختيار
                      </label>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {g.items.map((it) => (
                      <div
                        key={it.id}
                        className="flex gap-1.5 items-center bg-background rounded-lg px-2 py-1.5 border border-border"
                      >
                        <Input
                          className="bg-transparent border-0 h-7 text-xs flex-1 px-1 min-w-0"
                          value={it.name}
                          onChange={(e) => updateItem(g.id, it.id, { name: e.target.value })}
                          placeholder="اسم الخيار (مثل: كبير)"
                          data-testid={`item-name-${it.id}`}
                        />
                        <select
                          value={it.priceMode}
                          onChange={(e) => updateItem(g.id, it.id, { priceMode: e.target.value as "delta" | "full" })}
                          className="bg-background border border-border rounded h-7 text-[10px] px-1 text-foreground"
                          data-testid={`item-mode-${it.id}`}
                          title="نوع السعر"
                        >
                          <option value="full">سعر كامل</option>
                          <option value="delta">سعر إضافي</option>
                        </select>
                        {it.priceMode === "full" ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              className="bg-transparent border-0 h-7 text-xs w-20 px-1 text-end"
                              value={it.price ?? 0}
                              onChange={(e) =>
                                updateItem(g.id, it.id, { price: parseFloat(e.target.value) || 0 })
                              }
                              placeholder="السعر"
                              data-testid={`item-price-${it.id}`}
                            />
                            <span className="text-[10px] text-muted-foreground">ر.س</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">+</span>
                            <Input
                              type="number"
                              step="0.01"
                              className="bg-transparent border-0 h-7 text-xs w-16 px-1 text-end"
                              value={it.priceDelta}
                              onChange={(e) =>
                                updateItem(g.id, it.id, { priceDelta: parseFloat(e.target.value) || 0 })
                              }
                              placeholder="إضافي"
                              data-testid={`item-delta-${it.id}`}
                            />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeItem(g.id, it.id)}
                          className="text-destructive/70 hover:text-destructive"
                          aria-label="remove item"
                          data-testid={`remove-item-${it.id}`}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => addItem(g.id, "full")}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1"
                        data-testid={`add-full-${g.id}`}
                      >
                        <Plus size={11} /> أضف خيار بسعر كامل
                      </button>
                      <button
                        type="button"
                        onClick={() => addItem(g.id, "delta")}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1"
                        data-testid={`add-delta-${g.id}`}
                      >
                        <Plus size={11} /> أضف إضافة (+سعر)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
