import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
import { inventoryTable, inventoryConsumptionLogTable, productIngredientsTable, productsTable, productAvailabilityLogTable } from "@workspace/db";
import {
  CreateInventoryItemBody,
  UpdateInventoryItemParams,
  UpdateInventoryItemBody,
  AdjustInventoryParams,
  AdjustInventoryBody,
  ListInventoryQueryParams,
} from "@workspace/api-zod";
import { logAudit } from "../lib/audit.js";
import { requireTenant } from "../middleware/require-tenant.js";
import { checkFeature } from "../middleware/check-feature.js";
import { sseBroker } from "../lib/sse-broker.js";
import { logger } from "../lib/logger.js";

const router: IRouter = Router();

router.use(requireTenant);
// Inventory is a Growth+ feature
router.use(checkFeature("inventory"));

type TenantDb = NonNullable<Express.Request["db"]>;

/**
 * When an inventory item is restocked (goes from 0 → positive), re-enable any
 * products that were auto-disabled due to that ingredient being out of stock,
 * provided ALL their other ingredients are also now in stock.
 */
async function autoEnableProducts(
  dbx: TenantDb,
  tenantId: number,
  restockedInventoryId: number,
  restockedInventoryName: string
): Promise<void> {
  // Find products that use this inventory item AND were auto-disabled due to ingredient_out
  const linkedProducts = await dbx
    .select({ productId: productIngredientsTable.productId })
    .from(productIngredientsTable)
    .where(eq(productIngredientsTable.inventoryId, restockedInventoryId));

  for (const { productId } of linkedProducts) {
    const [prod] = await dbx
      .select({ id: productsTable.id, name: productsTable.name, kitchenAvailable: productsTable.kitchenAvailable, unavailabilityReason: productsTable.unavailabilityReason })
      .from(productsTable)
      .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, tenantId)));

    if (!prod || prod.kitchenAvailable || prod.unavailabilityReason !== "ingredient_out") continue;

    // Check if ALL ingredients for this product are now in stock (quantity > 0)
    const allIngredients = await dbx
      .select({
        inventoryId: productIngredientsTable.inventoryId,
        quantity: inventoryTable.quantity,
      })
      .from(productIngredientsTable)
      .innerJoin(inventoryTable, eq(productIngredientsTable.inventoryId, inventoryTable.id))
      .where(
        and(
          eq(productIngredientsTable.productId, productId),
          eq(inventoryTable.tenantId, tenantId)
        )
      );

    const allAvailable = allIngredients.every((ing) => parseFloat(ing.quantity) > 0);

    if (allAvailable) {
      await dbx
        .update(productsTable)
        .set({ kitchenAvailable: true, unavailabilityReason: null, unavailableUntil: null })
        .where(and(eq(productsTable.id, prod.id), eq(productsTable.tenantId, tenantId)));

      await dbx.insert(productAvailabilityLogTable).values({
        tenantId,
        productId: prod.id,
        productName: prod.name,
        action: "enabled",
        reason: "ingredient_restocked",
        reasonNote: `Inventory "${restockedInventoryName}" restocked`,
        changedBy: "system",
      });

      sseBroker.emit({
        type: "product:available",
        data: { productId: prod.id, productName: prod.name, reason: "ingredient_restocked", changedBy: "system" },
      });

      logger.info({ productId: prod.id, inventoryId: restockedInventoryId }, "Product auto-enabled: all ingredients back in stock");
    }
  }
}

async function getConsumedTodayMap(dbx: TenantDb, tenantId: number): Promise<Map<number, number>> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const rows = await dbx
    .select({
      inventoryId: inventoryConsumptionLogTable.inventoryId,
      total: sql<string>`sum(${inventoryConsumptionLogTable.quantityUsed})`,
    })
    .from(inventoryConsumptionLogTable)
    .innerJoin(inventoryTable, eq(inventoryConsumptionLogTable.inventoryId, inventoryTable.id))
    .where(
      and(
        eq(inventoryTable.tenantId, tenantId),
        gte(inventoryConsumptionLogTable.createdAt, today),
        lt(inventoryConsumptionLogTable.createdAt, tomorrow)
      )
    )
    .groupBy(inventoryConsumptionLogTable.inventoryId);

  return new Map(rows.map((r) => [r.inventoryId, parseFloat(r.total)]));
}

function formatItem(item: typeof inventoryTable.$inferSelect, consumedToday = 0) {
  const qty = parseFloat(item.quantity);
  const threshold = parseFloat(item.lowStockThreshold);
  return {
    ...item,
    quantity: qty,
    lowStockThreshold: threshold,
    isLowStock: qty <= threshold,
    consumedToday,
  };
}

router.get("/inventory", async (req, res): Promise<void> => {
  const parsed = ListInventoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const tid = req.tenantId!;
  const items = await req.db!.select().from(inventoryTable).where(eq(inventoryTable.tenantId, tid));
  const consumedMap = await getConsumedTodayMap(req.db!, tid);
  const formatted = items.map((i) => formatItem(i, consumedMap.get(i.id) ?? 0));
  if (parsed.data.lowStock) {
    res.json(formatted.filter((i) => i.isLowStock));
    return;
  }
  res.json(formatted);
});

router.post("/inventory", async (req, res): Promise<void> => {
  const parsed = CreateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [item] = await req.db!
    .insert(inventoryTable)
    .values({
      ...parsed.data,
      tenantId: req.tenantId!,
      quantity: String(parsed.data.quantity),
      lowStockThreshold: String(parsed.data.lowStockThreshold ?? 10),
    })
    .returning();
  res.status(201).json(formatItem(item));
});

router.patch("/inventory/:id", async (req, res): Promise<void> => {
  const params = UpdateInventoryItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateInventoryItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.quantity !== undefined) updateData.quantity = String(parsed.data.quantity);
  if (parsed.data.unit !== undefined) updateData.unit = parsed.data.unit;
  if (parsed.data.lowStockThreshold !== undefined) updateData.lowStockThreshold = String(parsed.data.lowStockThreshold);
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  const [item] = await req.db!
    .update(inventoryTable)
    .set(updateData)
    .where(and(eq(inventoryTable.id, params.data.id), eq(inventoryTable.tenantId, req.tenantId!)))
    .returning();
  if (!item) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }
  const consumedMap = await getConsumedTodayMap(req.db!, req.tenantId!);
  res.json(formatItem(item, consumedMap.get(item.id) ?? 0));
});

router.post("/inventory/:id/adjust", async (req, res): Promise<void> => {
  const params = AdjustInventoryParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = AdjustInventoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [current] = await req.db!
    .select()
    .from(inventoryTable)
    .where(and(eq(inventoryTable.id, params.data.id), eq(inventoryTable.tenantId, req.tenantId!)));
  if (!current) {
    res.status(404).json({ error: "Inventory item not found" });
    return;
  }
  const newQty = Math.max(0, parseFloat(current.quantity) + parsed.data.adjustment);
  const [item] = await req.db!
    .update(inventoryTable)
    .set({ quantity: String(newQty) })
    .where(and(eq(inventoryTable.id, params.data.id), eq(inventoryTable.tenantId, req.tenantId!)))
    .returning();
  void logAudit(req, "inventory_adjusted", "inventory", params.data.id, { name: current.name, adjustment: parsed.data.adjustment, oldQty: parseFloat(current.quantity), newQty });

  if (newQty <= 0) {
    sseBroker.emit({
      type: "ingredient:out_of_stock",
      data: { inventoryId: params.data.id, inventoryName: current.name, tenantId: req.tenantId! },
    });

    const linkedIngredients = await req.db!
      .select({ productId: productIngredientsTable.productId })
      .from(productIngredientsTable)
      .where(eq(productIngredientsTable.inventoryId, params.data.id));

    for (const { productId } of linkedIngredients) {
      const [prod] = await req.db!
        .select({ id: productsTable.id, name: productsTable.name, kitchenAvailable: productsTable.kitchenAvailable })
        .from(productsTable)
        .where(and(eq(productsTable.id, productId), eq(productsTable.tenantId, req.tenantId!)));

      if (prod && prod.kitchenAvailable) {
        await req.db!
          .update(productsTable)
          .set({ kitchenAvailable: false, unavailabilityReason: "ingredient_out" })
          .where(eq(productsTable.id, prod.id));

        await req.db!.insert(productAvailabilityLogTable).values({
          tenantId: req.tenantId!,
          productId: prod.id,
          productName: prod.name,
          action: "disabled",
          reason: "ingredient_out",
          reasonNote: `Inventory "${current.name}" reached 0`,
          changedBy: "system",
        });

        sseBroker.emit({
          type: "product:unavailable",
          data: { productId: prod.id, productName: prod.name, reason: "ingredient_out", changedBy: "system" },
        });

        logger.info({ productId: prod.id, inventoryId: params.data.id }, "Product auto-disabled: ingredient out of stock");
      }
    }
  } else if (parseFloat(current.quantity) <= 0 && newQty > 0) {
    // Ingredient restocked — check if any auto-disabled products can be re-enabled
    await autoEnableProducts(req.db!, req.tenantId!, params.data.id, current.name);
  }

  const consumedMap = await getConsumedTodayMap(req.db!, req.tenantId!);
  res.json(formatItem(item, consumedMap.get(item.id) ?? 0));
});

export default router;
