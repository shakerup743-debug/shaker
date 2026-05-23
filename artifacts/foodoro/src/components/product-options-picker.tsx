import { useState, useEffect, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ProductOptionGroup } from "./product-options-editor";

export interface OptionSelection {
  groupId: string;
  itemId: string;
}

export interface ResolvedSelection {
  groupId: string;
  groupName: string;
  itemId: string;
  itemName: string;
  priceMode: "delta" | "full";
  priceDelta: number;
  price?: number;
}

interface Props {
  open: boolean;
  productName: string;
  basePrice: number;
  currency?: string;
  optionGroups: ProductOptionGroup[];
  onCancel: () => void;
  onConfirm: (selections: ResolvedSelection[], finalUnitPrice: number) => void;
}

/**
 * Modal that lets cashier / customer pick option-group values for a product.
 * Live-updates the unit price as choices change.
 */
export function ProductOptionsPicker({
  open,
  productName,
  basePrice,
  currency = "ر.س",
  optionGroups,
  onCancel,
  onConfirm,
}: Props) {
  // Map<groupId, Set<itemId>> — supports both single & multi-select
  const [picks, setPicks] = useState<Record<string, string[]>>({});

  // Seed defaults whenever the dialog opens / product changes
  useEffect(() => {
    if (!open) return;
    const seed: Record<string, string[]> = {};
    for (const g of optionGroups) {
      const def = g.items.find((it) => it.isDefault);
      if (def) seed[g.id] = [def.id];
      else if (g.required && !g.multiSelect && g.items[0]) seed[g.id] = [g.items[0].id];
    }
    setPicks(seed);
  }, [open, optionGroups]);

  const toggle = (group: ProductOptionGroup, itemId: string) => {
    setPicks((prev) => {
      const current = prev[group.id] ?? [];
      if (group.multiSelect) {
        const has = current.includes(itemId);
        if (has) return { ...prev, [group.id]: current.filter((x) => x !== itemId) };
        if (group.maxSelect && current.length >= group.maxSelect) return prev;
        return { ...prev, [group.id]: [...current, itemId] };
      }
      // single-select
      return { ...prev, [group.id]: [itemId] };
    });
  };

  const { resolved, finalPrice, missingRequired } = useMemo(() => {
    const out: ResolvedSelection[] = [];
    let missing: string[] = [];
    for (const g of optionGroups) {
      const chosen = picks[g.id] ?? [];
      if (g.required && chosen.length === 0) missing.push(g.name);
      for (const iid of chosen) {
        const it = g.items.find((x) => x.id === iid);
        if (!it) continue;
        const mode: "delta" | "full" = it.priceMode === "full" ? "full" : "delta";
        if (mode === "full") {
          out.push({
            groupId: g.id, groupName: g.name,
            itemId: it.id, itemName: it.name,
            priceMode: "full",
            priceDelta: 0,
            price: Number(it.price) || 0,
          });
        } else {
          out.push({
            groupId: g.id, groupName: g.name,
            itemId: it.id, itemName: it.name,
            priceMode: "delta",
            priceDelta: Number(it.priceDelta) || 0,
          });
        }
      }
    }
    const fulls = out.filter((s) => s.priceMode === "full");
    const deltas = out.filter((s) => s.priceMode === "delta");
    const effectiveBase = fulls.length > 0
      ? fulls.reduce((sum, s) => sum + (s.price ?? 0), 0)
      : basePrice;
    const deltaSum = deltas.reduce((sum, s) => sum + s.priceDelta, 0);
    return {
      resolved: out,
      finalPrice: Math.round((effectiveBase + deltaSum) * 100) / 100,
      missingRequired: missing,
    };
  }, [picks, optionGroups, basePrice]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent
        className="bg-card border-border text-foreground max-w-md max-h-[85vh] overflow-y-auto"
        data-testid="product-options-picker"
      >
        <DialogHeader>
          <DialogTitle className="text-base">{productName}</DialogTitle>
          <p className="text-[11px] text-muted-foreground">
            السعر الأساسي: {basePrice.toFixed(2)} {currency}
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {optionGroups.map((g) => {
            const chosen = picks[g.id] ?? [];
            return (
              <div key={g.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold">
                    {g.name}{" "}
                    {g.required && (
                      <span className="text-destructive text-[10px]">* مطلوب</span>
                    )}
                  </h4>
                  {g.multiSelect && (
                    <span className="text-[10px] text-muted-foreground">
                      اختر أكثر من خيار{g.maxSelect ? ` (حتى ${g.maxSelect})` : ""}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-1.5">
                  {g.items.map((it) => {
                    const active = chosen.includes(it.id);
                    const mode = it.priceMode === "full" ? "full" : "delta";
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => toggle(g, it.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-all ${
                          active
                            ? "bg-primary/10 border-primary text-foreground"
                            : "bg-background border-border text-foreground/80 hover:border-primary/40"
                        }`}
                        data-testid={`option-${g.id}-${it.id}`}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className={`w-3.5 h-3.5 rounded-${g.multiSelect ? "sm" : "full"} border ${
                              active ? "bg-primary border-primary" : "border-border"
                            }`}
                          />
                          {it.name}
                        </span>
                        {mode === "full" ? (
                          <span className="text-[11px] font-semibold text-primary">
                            {(Number(it.price) || 0).toFixed(2)} {currency}
                          </span>
                        ) : (
                          <span className={`text-[11px] ${it.priceDelta > 0 ? "text-primary" : "text-muted-foreground"}`}>
                            {it.priceDelta > 0 ? `+ ${it.priceDelta.toFixed(2)}` : it.priceDelta < 0 ? it.priceDelta.toFixed(2) : "+ 0"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {missingRequired.length > 0 && (
          <div className="text-[11px] text-destructive bg-destructive/10 rounded-md px-2 py-1.5">
            اختر: {missingRequired.join("، ")}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            <p className="text-[10px] text-muted-foreground">السعر النهائي</p>
            <p className="text-lg font-bold text-primary" data-testid="picker-final-price">
              {finalPrice.toFixed(2)} {currency}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2 rounded-lg bg-muted text-foreground text-xs hover:bg-muted/80"
              data-testid="picker-cancel-btn"
            >
              إلغاء
            </button>
            <button
              type="button"
              disabled={missingRequired.length > 0}
              onClick={() => onConfirm(resolved, finalPrice)}
              className="px-4 py-2 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-40"
              data-testid="picker-confirm-btn"
            >
              أضف للسلة
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
