import { eq, and, ne, sql } from "drizzle-orm";
import {
  ordersTable,
  orderItemsTable,
  kitchenTicketsTable,
  productIngredientsTable,
  inventoryTable,
  inventoryConsumptionLogTable,
  customersTable,
  createTenantDb,
} from "@workspace/db";

export type TenantDb = ReturnType<typeof createTenantDb>;

export type LowStockAlert = {
  inventoryId: number;
  name: string;
  quantity: number;
  unit: string;
  threshold: number;
};

export type CompleteOrderResult = {
  lowStockAlerts: LowStockAlert[];
  previousStatus: string;
  total: number;
};

export class OrderNotFoundError extends Error {
  constructor() {
    super("Order not found");
    this.name = "OrderNotFoundError";
  }
}

export class OrderAlreadyCompletedError extends Error {
  constructor() {
    super("Order already completed");
    this.name = "OrderAlreadyCompletedError";
  }
}

/**
 * Shared order completion logic — used by both the authenticated POS route
 * (POST /api/orders/:id/complete) and the public QR self-service route
 * (POST /api/public/orders/:id/complete).
 *
 * Everything runs inside one transaction:
 *  1. Atomically sets order status → "completed" (double-completion safe via ne check)
 *  2. Closes kitchen tickets
 *  3. Updates customer total_orders + total_spent (loyalty-point awards handled
 *     separately by the dedicated loyalty module)
 *  4. Deducts inventory ingredients and logs consumption
 *  5. Collects low-stock alerts (returned so the caller can emit SSE after commit)
 */
export async function completeOrder(
  db: TenantDb,
  tenantId: number,
  orderId: number,
  paymentMethod: string,
  amountPaid?: number
): Promise<CompleteOrderResult> {
  const [existing] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.tenantId, tenantId)));

  if (!existing) throw new OrderNotFoundError();
  if (existing.status === "completed") throw new OrderAlreadyCompletedError();

  const total = parseFloat(existing.total);
  const paid = amountPaid ?? total;
  const change = Math.max(0, paid - total);

  const lowStockAlerts: LowStockAlert[] = [];

  await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(ordersTable)
      .set({
        status: "completed",
        paymentMethod,
        amountPaid: String(paid),
        changeAmount: String(change),
        completedAt: new Date(),
      })
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.tenantId, tenantId),
          ne(ordersTable.status, "completed")
        )
      )
      .returning({ id: ordersTable.id });

    if (!updated) throw new OrderAlreadyCompletedError();

    await tx
      .update(kitchenTicketsTable)
      .set({ status: "completed" })
      .where(
        and(
          eq(kitchenTicketsTable.orderId, orderId),
          eq(kitchenTicketsTable.tenantId, tenantId)
        )
      );

    if (existing.customerId) {
      const [customer] = await tx
        .select({ id: customersTable.id })
        .from(customersTable)
        .where(eq(customersTable.id, existing.customerId));
      if (customer) {
        await tx
          .update(customersTable)
          .set({
            totalOrders: sql`${customersTable.totalOrders} + 1`,
            totalSpent: sql`${customersTable.totalSpent} + ${String(total)}`,
          })
          .where(eq(customersTable.id, existing.customerId));
      }
    }

    const orderItems = await tx
      .select()
      .from(orderItemsTable)
      .where(eq(orderItemsTable.orderId, orderId));

    for (const item of orderItems) {
      const ingredients = await tx
        .select({
          inventoryId: productIngredientsTable.inventoryId,
          quantityPerUnit: productIngredientsTable.quantityPerUnit,
          inventoryName: inventoryTable.name,
          inventoryUnit: inventoryTable.unit,
          inventoryThreshold: inventoryTable.lowStockThreshold,
        })
        .from(productIngredientsTable)
        .innerJoin(
          inventoryTable,
          eq(productIngredientsTable.inventoryId, inventoryTable.id)
        )
        .where(
          and(
            eq(productIngredientsTable.productId, item.productId),
            eq(inventoryTable.tenantId, tenantId)
          )
        );

      for (const ing of ingredients) {
        const needed = parseFloat(ing.quantityPerUnit) * item.quantity;
        const [locked] = await tx
          .select({ quantity: inventoryTable.quantity })
          .from(inventoryTable)
          .where(
            and(
              eq(inventoryTable.id, ing.inventoryId),
              eq(inventoryTable.tenantId, tenantId)
            )
          )
          .for("update");

        if (!locked) continue;

        const oldQty = parseFloat(locked.quantity);
        const actualDeducted = Math.min(needed, oldQty);
        const newQty = oldQty - actualDeducted;

        await tx
          .update(inventoryTable)
          .set({ quantity: String(newQty) })
          .where(
            and(
              eq(inventoryTable.id, ing.inventoryId),
              eq(inventoryTable.tenantId, tenantId)
            )
          );

        await tx.insert(inventoryConsumptionLogTable).values({
          inventoryId: ing.inventoryId,
          orderId,
          quantityUsed: String(actualDeducted),
        });

        const threshold = parseFloat(ing.inventoryThreshold);
        if (
          newQty <= threshold &&
          !lowStockAlerts.some((a) => a.inventoryId === ing.inventoryId)
        ) {
          lowStockAlerts.push({
            inventoryId: ing.inventoryId,
            name: ing.inventoryName,
            quantity: newQty,
            unit: ing.inventoryUnit,
            threshold,
          });
        }
      }
    }
  });

  return { lowStockAlerts, previousStatus: existing.status, total };
}
