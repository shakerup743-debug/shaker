import { Router, type IRouter } from "express";
import { eq, and, gte, lt } from "drizzle-orm";
import {
  ordersTable,
  orderItemsTable,
  productsTable,
  kitchenTicketsTable,
  customersTable,
} from "@workspace/db";
import {
  CreateOrderBody,
  UpdateOrderBody,
  UpdateOrderParams,
  GetOrderParams,
  ListOrdersQueryParams,
  CompleteOrderParams,
  CompleteOrderBody,
} from "@workspace/api-zod";
import { sseBroker } from "../lib/sse-broker.js";
import { logAudit } from "../lib/audit.js";
import { fireWebhooks } from "./webhooks.js";
import { requireTenant } from "../middleware/require-tenant.js";
import {
  completeOrder,
  OrderNotFoundError,
  OrderAlreadyCompletedError,
} from "../services/orders.js";

const router: IRouter = Router();

router.use(requireTenant);

function generateOrderNumber() {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const rand = Math.floor(Math.random() * 100);
  return `ORD-${time}-${rand}`;
}

type TenantDb = NonNullable<Express.Request["db"]>;

async function getOrderWithItems(dbx: TenantDb, orderId: number, tenantId: number) {
  const [order] = await dbx
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.tenantId, tenantId)));
  if (!order) return null;
  const items = await dbx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, orderId));
  return {
    ...order,
    subtotal: parseFloat(order.subtotal),
    discount: parseFloat(order.discount),
    tax: parseFloat(order.tax),
    total: parseFloat(order.total),
    amountPaid: order.amountPaid ? parseFloat(order.amountPaid) : null,
    changeAmount: order.changeAmount ? parseFloat(order.changeAmount) : null,
    items: items.map((i) => ({
      ...i,
      unitPrice: parseFloat(i.unitPrice),
      subtotal: parseFloat(i.subtotal),
    })),
  };
}

router.get("/orders", async (req, res): Promise<void> => {
  // Coerce date string → Date object before Zod validation (req.query values are always strings)
  const rawQuery = {
    ...req.query,
    ...(typeof req.query.date === "string" && req.query.date
      ? { date: new Date(req.query.date) }
      : {}),
  };
  const parsed = ListOrdersQueryParams.safeParse(rawQuery);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const tid = req.tenantId!;
  const conditions: ReturnType<typeof eq>[] = [eq(ordersTable.tenantId, tid)];
  if (parsed.data.status) conditions.push(eq(ordersTable.status, parsed.data.status));
  if (parsed.data.date) {
    const date = new Date(parsed.data.date);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    conditions.push(gte(ordersTable.createdAt, date));
    conditions.push(lt(ordersTable.createdAt, next));
  }

  const orders = await req.db!.select().from(ordersTable).where(and(...conditions));
  const withItems = await Promise.all(
    orders.map(async (o) => {
      const items = await req.db!.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, o.id));
      return {
        ...o,
        subtotal: parseFloat(o.subtotal),
        discount: parseFloat(o.discount),
        tax: parseFloat(o.tax),
        total: parseFloat(o.total),
        amountPaid: o.amountPaid ? parseFloat(o.amountPaid) : null,
        changeAmount: o.changeAmount ? parseFloat(o.changeAmount) : null,
        items: items.map((i) => ({ ...i, unitPrice: parseFloat(i.unitPrice), subtotal: parseFloat(i.subtotal) })),
      };
    })
  );
  res.json(withItems);
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const tid = req.tenantId!;

  if (parsed.data.customerId != null) {
    const [customer] = await req.db!
      .select({ id: customersTable.id })
      .from(customersTable)
      .where(eq(customersTable.id, parsed.data.customerId));
    if (!customer) {
      res.status(404).json({ error: `Customer ${parsed.data.customerId} not found` });
      return;
    }
  }

  const products = await req.db!
    .select()
    .from(productsTable)
    .where(eq(productsTable.tenantId, tid));
  const productMap = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const itemsToInsert = parsed.data.items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found`);
    const unitPrice = parseFloat(product.price);
    const itemSubtotal = unitPrice * item.quantity;
    subtotal += itemSubtotal;
    return {
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: String(unitPrice),
      subtotal: String(itemSubtotal),
      notes: item.notes ?? null,
    };
  });

  const discount = parsed.data.discount ?? 0;
  const taxableAmount = subtotal - discount;
  const tax = Math.round((taxableAmount * (15 / 115)) * 100) / 100;
  const total = Math.round(taxableAmount * 100) / 100;

  // Record payment method at creation (quick-service: customer pays upfront)
  const paidWith = parsed.data.paymentMethod ?? null;
  const paidAmount = parsed.data.amountPaid != null ? String(parsed.data.amountPaid) : null;
  const changeAmt = paidAmount != null ? String(Math.max(0, parseFloat(paidAmount) - total)) : null;

  const [order] = await req.db!
    .insert(ordersTable)
    .values({
      tenantId: tid,
      customerId: parsed.data.customerId ?? null,
      orderNumber: generateOrderNumber(),
      type: parsed.data.type,
      status: "pending",
      subtotal: String(subtotal),
      discount: String(discount),
      tax: String(tax),
      total: String(total),
      tableNumber: parsed.data.tableNumber ?? null,
      notes: parsed.data.notes ?? null,
      paymentMethod: paidWith,
      amountPaid: paidAmount,
      changeAmount: changeAmt,
    })
    .returning();

  await req.db!.insert(orderItemsTable).values(itemsToInsert.map((i) => ({ ...i, orderId: order.id })));
  await req.db!.insert(kitchenTicketsTable).values({ orderId: order.id, tenantId: tid, status: "new" });

  const result = await getOrderWithItems(req.db!, order.id, tid);
  sseBroker.emit({ type: "order:created", data: { orderId: order.id, orderNumber: order.orderNumber, type: order.type } });
  sseBroker.emit({ type: "stats:updated", data: { tenantId: tid } });
  void logAudit(req, "order:created", "orders", order.id, {
    orderNumber: order.orderNumber,
    type: order.type,
    total: String(total),
    customerId: order.customerId ?? null,
  });
  void fireWebhooks("order:created", { id: order.id, orderNumber: order.orderNumber, type: order.type, total, items: itemsToInsert.length });
  res.status(201).json(result);
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const order = await getOrderWithItems(req.db!, params.data.id, req.tenantId!);
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(order);
});

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const tid = req.tenantId!;
  const [existing] = await req.db!
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tid)));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }

  if (parsed.data.status === "completed") {
    res.status(400).json({ error: "Use POST /orders/:id/complete to complete an order" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status;
  if (parsed.data.discount !== undefined) {
    const discount = parsed.data.discount;
    const sub = parseFloat(existing.subtotal);
    const taxable = sub - discount;
    const tax = Math.round((taxable * (15 / 115)) * 100) / 100;
    updateData.discount = String(discount);
    updateData.tax = String(tax);
    updateData.total = String(Math.round(taxable * 100) / 100);
  }
  if (parsed.data.tableNumber !== undefined) updateData.tableNumber = parsed.data.tableNumber;
  if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

  await req.db!.update(ordersTable).set(updateData)
    .where(and(eq(ordersTable.id, params.data.id), eq(ordersTable.tenantId, tid)));

  if (parsed.data.status !== undefined && parsed.data.status !== existing.status) {
    const action = parsed.data.status === "cancelled" ? "order:cancelled" : "order:updated";
    void logAudit(req, action, "orders", params.data.id, {
      oldValue: existing.status,
      newValue: parsed.data.status,
    });
    if (parsed.data.status === "cancelled") {
      sseBroker.emit({ type: "stats:updated", data: { tenantId: tid } });
    }
  }

  res.json(await getOrderWithItems(req.db!, params.data.id, tid));
});

router.post("/orders/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = CompleteOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const tid = req.tenantId!;

  try {
    const { lowStockAlerts, previousStatus, total } = await completeOrder(
      req.db!,
      tid,
      params.data.id,
      parsed.data.paymentMethod,
      parsed.data.amountPaid
    );

    for (const alert of lowStockAlerts) {
      sseBroker.emit({ type: "inventory:low", data: alert });
    }
    sseBroker.emit({ type: "stats:updated", data: { tenantId: tid } });

    void logAudit(req, "order:completed", "orders", params.data.id, {
      paymentMethod: parsed.data.paymentMethod,
      amountPaid: String(parsed.data.amountPaid ?? total),
      oldValue: previousStatus,
      newValue: "completed",
      total: String(total),
    });
    void fireWebhooks("order:completed", {
      id: params.data.id,
      paymentMethod: parsed.data.paymentMethod,
      amountPaid: parsed.data.amountPaid,
    });

    const result = await getOrderWithItems(req.db!, params.data.id, tid);
    res.json(result);
  } catch (err) {
    if (err instanceof OrderNotFoundError) { res.status(404).json({ error: err.message }); return; }
    if (err instanceof OrderAlreadyCompletedError) { res.status(409).json({ error: err.message }); return; }
    throw err;
  }
});

export default router;
