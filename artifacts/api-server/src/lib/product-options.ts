// Shared resolver for product option-group pricing.
//
// Pricing rules:
//   • Each selected item is either mode="delta" (additive) or mode="full" (absolute).
//   • If ANY full-mode item is selected, the effective base = SUM(full prices).
//     (In practice the "size" group is single-select, so this is one price.)
//   • All delta items are added on top of the effective base.
//   • Final unit price = effective base + sum(deltas).
//
// Returns the resolved selections (with mode + delta + price snapshots),
// the unit price, and throws if a required group has no pick.

export interface ProductOptionItemSpec {
  id: string;
  name: string;
  priceMode?: "delta" | "full";
  priceDelta?: number;
  price?: number;
}

export interface ProductOptionGroupSpec {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  items: ProductOptionItemSpec[];
}

export interface ClientSelection {
  groupId: string;
  itemId: string;
}

export interface ResolvedOptionSelection {
  groupId: string;
  groupName: string;
  itemId: string;
  itemName: string;
  priceMode: "delta" | "full";
  priceDelta: number;
  price?: number;
}

export interface ResolvedOptions {
  selections: ResolvedOptionSelection[];
  unitPrice: number;        // base + deltas, or full-override + deltas
}

export function resolveOptionPricing(
  basePrice: number,
  productGroups: ProductOptionGroupSpec[],
  clientSelections: ClientSelection[],
  productNameForError: string,
): ResolvedOptions {
  const selections: ResolvedOptionSelection[] = [];

  for (const sel of clientSelections) {
    const group = productGroups.find((g) => g.id === sel.groupId);
    if (!group) continue;
    const choice = group.items.find((c) => c.id === sel.itemId);
    if (!choice) continue;

    const mode: "delta" | "full" = choice.priceMode === "full" ? "full" : "delta";

    if (mode === "full") {
      const p = Number(choice.price ?? 0);
      selections.push({
        groupId: group.id,
        groupName: group.name,
        itemId: choice.id,
        itemName: choice.name,
        priceMode: "full",
        priceDelta: 0,
        price: Math.round(p * 100) / 100,
      });
    } else {
      const d = Number(choice.priceDelta) || 0;
      selections.push({
        groupId: group.id,
        groupName: group.name,
        itemId: choice.id,
        itemName: choice.name,
        priceMode: "delta",
        priceDelta: Math.round(d * 100) / 100,
      });
    }
  }

  // Enforce required groups
  for (const g of productGroups) {
    if (g.required && !selections.some((r) => r.groupId === g.id)) {
      throw new Error(`Option group "${g.name}" is required for ${productNameForError}`);
    }
  }

  // Pricing: full prices override base; deltas always add on.
  const fullSum   = selections.filter((s) => s.priceMode === "full").reduce((sum, s) => sum + (s.price ?? 0), 0);
  const hasFull   = selections.some((s) => s.priceMode === "full");
  const deltaSum  = selections.filter((s) => s.priceMode === "delta").reduce((sum, s) => sum + s.priceDelta, 0);

  const effectiveBase = hasFull ? fullSum : basePrice;
  const unitPrice = Math.round((effectiveBase + deltaSum) * 100) / 100;

  return { selections, unitPrice };
}
