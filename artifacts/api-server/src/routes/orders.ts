import { Router, type IRouter } from "express";
import { eq, and, gte, lt, sql } from "drizzle-orm";
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
import { socketBroker } from "../lib/socket-broker.js";
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
      baseUnitPrice: i.baseUnitPrice != null ? parseFloat(i.baseUnitPrice) : null,
      subtotal: parseFloat(i.subtotal),
      selectedOptions: i.selectedOptions ?? [],
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
        items: items.map((i) => ({
          ...i,
          unitPrice: parseFloat(i.unitPrice),
          baseUnitPrice: i.baseUnitPrice != null ? parseFloat(i.baseUnitPrice) : null,
          subtotal: parseFloat(i.subtotal),
          selectedOptions: i.selectedOptions ?? [],
        })),
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

  // Client-side passes `selectedOptions` alongside each item (outside the strict
  // Zod schema). We re-resolve each selection against the product's own
  // optionGroups so the customer can never tamper with prices.
  type ClientSelection = { groupId: string; itemId: string };
  type RawItem = { productId: number; selectedOptions?: ClientSelection[] };
  const rawItems = (req.body as { items?: RawItem[] }).items ?? [];

  let subtotal = 0;
  let itemsToInsert: ReturnType<typeof Array.prototype.map>;
  try {
    itemsToInsert = parsed.data.items.map((item, idx) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`Product ${item.productId} not found`);
    const basePrice = parseFloat(product.price);

    // Resolve any options the cashier / QR-menu attached to this line.
    const clientSelections = rawItems[idx]?.selectedOptions ?? [];
    const productGroups = (product.optionGroups ?? []) as Array<{
      id: string; name: string; required: boolean; multiSelect: boolean;
      items: Array<{ id: string; name: string; priceDelta: number }>;
    }>;
    const resolved: Array<{ groupId: string; groupName: string; itemId: string; itemName: string; priceDelta: number }> = [];
    for (const sel of clientSelections) {
      const group = productGroups.find((g) => g.id === sel.groupId);
      if (!group) continue;
      const choice = group.items.find((c) => c.id === sel.itemId);
      if (!choice) continue;
      resolved.push({
        groupId: group.id,
        groupName: group.name,
        itemId: choice.id,
        itemName: choice.name,
        priceDelta: Number(choice.priceDelta) || 0,
      });
    }
    // Enforce required groups — order rejected if a mandatory group has no pick.
    for (const g of productGroups) {
      if (g.required && !resolved.some((r) => r.groupId === g.id)) {
        throw new Error(`Option group "${g.name}" is required for ${product.name}`);
      }
    }

    const optionsDelta = resolved.reduce((sum, r) => sum + r.priceDelta, 0);
    const unitPrice = Math.round((basePrice + optionsDelta) * 100) / 100;
    const itemSubtotal = Math.round(unitPrice * item.quantity * 100) / 100;
    subtotal += itemSubtotal;
    return {
      productId: item.productId,
      productName: product.name,
      quantity: item.quantity,
      unitPrice: String(unitPrice),
      baseUnitPrice: String(basePrice),
      subtotal: String(itemSubtotal),
      notes: item.notes ?? null,
      selectedOptions: resolved,
    };
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
    return;
  }

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

  // Optional attachment URL (an image uploaded BEFORE the order was created
  // and pasted into the cart). We persist it via a separate UPDATE because
  // it isn't part of the strict Zod schema for the order body.
  const attachmentUrl = (req.body as { attachmentUrl?: string | null }).attachmentUrl;
  if (attachmentUrl && typeof attachmentUrl === "string") {
    await req.db!.execute(sql`UPDATE orders SET attachment_url=${attachmentUrl} WHERE id=${order.id} AND tenant_id=${tid}`);
    order.attachmentUrl = attachmentUrl as unknown as never;
  }

  await req.db!.insert(orderItemsTable).values(itemsToInsert.map((i) => ({ ...i, orderId: order.id })));
  await req.db!.insert(kitchenTicketsTable).values({ orderId: order.id, tenantId: tid, status: "new" });

  // ── Discount audit trail (mandatory when a discount is applied) ──────
  // The cashier-side dialog (DiscountDialog) collects the audit metadata
  // and pipes it into the order payload as `discountAudit`. We persist it
  // verbatim to `discount_logs` so the owner can audit every applied
  // discount in the reports page (manager.kind, customer, coupon, etc).
  type DiscountAudit = {
    kind?: string;
    customerName?: string;
    customerPhone?: string;
    couponCode?: string;
    reason?: string;
    discountType?: string;
    discountValue?: number;
  };
  const audit = (req.body as { discountAudit?: DiscountAudit }).discountAudit;
  if (audit && discount > 0) {
    const userId = (req as Request & { user?: { userId?: number; name?: string } }).user?.userId ?? null;
    const userName = (req as Request & { user?: { name?: string } }).user?.name ?? null;
    await req.db!.execute(sql`
      INSERT INTO discount_logs (
        tenant_id, order_id, cashier_id, cashier_name,
        reason, discount_kind, coupon_code,
        customer_name, customer_phone,
        discount_type, discount_value,
        order_subtotal, order_total_after
      ) VALUES (
        ${tid}, ${order.id}, ${userId}, ${userName},
        ${audit.reason ?? audit.kind ?? "other"}, ${audit.kind ?? null}, ${audit.couponCode ?? null},
        ${audit.customerName ?? null}, ${audit.customerPhone ?? null},
        ${audit.discountType ?? "amount"}, ${audit.discountValue ?? discount},
        ${subtotal}, ${total}
      )
    `);
  }

  const result = await getOrderWithItems(req.db!, order.id, tid);
  sseBroker.emit({ type: "order:created", data: { orderId: order.id, orderNumber: order.orderNumber, type: order.type } });
  sseBroker.emit({ type: "stats:updated", data: { tenantId: tid } });
  socketBroker.emit({ type: "order:created", payload: { orderId: order.id, orderNumber: order.orderNumber, type: order.type }, tenantId: tid, timestamp: new Date().toISOString() });
  socketBroker.emit({ type: "stats:updated", payload: { tenantId: tid }, tenantId: tid, timestamp: new Date().toISOString() });
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
      socketBroker.emit({ type: "order:cancelled", payload: { orderId: params.data.id }, tenantId: tid, timestamp: new Date().toISOString() });
    } else {
      socketBroker.emit({ type: "order:updated", payload: { orderId: params.data.id, status: parsed.data.status }, tenantId: tid, timestamp: new Date().toISOString() });
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
      socketBroker.emit({ type: "inventory:low", payload: alert, tenantId: tid, timestamp: new Date().toISOString() });
    }
    sseBroker.emit({ type: "stats:updated", data: { tenantId: tid } });
    socketBroker.emit({ type: "order:completed", payload: { orderId: params.data.id, total }, tenantId: tid, timestamp: new Date().toISOString() });
    socketBroker.emit({ type: "stats:updated", payload: { tenantId: tid }, tenantId: tid, timestamp: new Date().toISOString() });

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

/* ── Attach an image to an existing order ─────────────────────────────────
 * Cashier or QR customer can upload an image URL (already uploaded to
 * /api/uploads) to attach to an order — e.g. proof of issue with a dish,
 * photo of the receipt, photo of a custom request. The URL is persisted
 * to orders.attachment_url and shown in the order list + reports.
 */
router.post("/orders/:id/attachment", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const orderId = Number(req.params.id);
  const { attachmentUrl } = req.body as { attachmentUrl?: string };
  if (!attachmentUrl || typeof attachmentUrl !== "string") {
    res.status(400).json({ error: "attachmentUrl required" }); return;
  }
  const result = await req.db!.execute(sql`
    UPDATE orders SET attachment_url=${attachmentUrl}
    WHERE id=${orderId} AND tenant_id=${tid}
    RETURNING id, attachment_url
  `);
  if ((result.rowCount ?? 0) === 0) { res.status(404).json({ error: "order not found" }); return; }
  res.json({ ok: true, attachmentUrl });
});

export default router;
