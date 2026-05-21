import { Router, type IRouter } from "express";
import { eq, ne, and, desc } from "drizzle-orm";
import { kitchenTicketsTable, ordersTable, orderItemsTable, productsTable, productAvailabilityLogTable } from "@workspace/db";
import {
  UpdateTicketStatusParams,
  UpdateTicketStatusBody,
  ListKitchenTicketsQueryParams,
  SetProductAvailabilityParams,
  SetProductAvailabilityBody,
} from "@workspace/api-zod";
import { logger } from "../lib/logger.js";
import { sseBroker } from "../lib/sse-broker.js";
import { socketBroker } from "../lib/socket-broker.js";
import { requireTenant } from "../middleware/require-tenant.js";

const router: IRouter = Router();

router.use(requireTenant);

type TenantDb = NonNullable<Express.Request["db"]>;

async function getTicketWithDetails(dbx: TenantDb, ticketId: number, tenantId: number) {
  const [ticket] = await dbx
    .select()
    .from(kitchenTicketsTable)
    .where(and(eq(kitchenTicketsTable.id, ticketId), eq(kitchenTicketsTable.tenantId, tenantId)));
  if (!ticket) return null;
  const [order] = await dbx
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, ticket.orderId), eq(ordersTable.tenantId, tenantId)));
  if (!order) return null;
  const items = await dbx.select().from(orderItemsTable).where(eq(orderItemsTable.orderId, order.id));
  return {
    id: ticket.id,
    orderId: order.id,
    orderNumber: order.orderNumber,
    status: ticket.status,
    type: order.type,
    tableNumber: order.tableNumber,
    notes: order.notes,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    items: items.map((i) => ({
      ...i,
      unitPrice: parseFloat(i.unitPrice),
      subtotal: parseFloat(i.subtotal),
    })),
  };
}

router.get("/kitchen/tickets", async (req, res): Promise<void> => {
  const parsed = ListKitchenTicketsQueryParams.safeParse(req.query);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const tid = req.tenantId!;
  const conditions: ReturnType<typeof eq>[] = [eq(kitchenTicketsTable.tenantId, tid)];
  if (parsed.data.status) {
    conditions.push(eq(kitchenTicketsTable.status, parsed.data.status));
  } else {
    conditions.push(ne(kitchenTicketsTable.status, "completed"));
  }

  const tickets = await req.db!.select().from(kitchenTicketsTable).where(and(...conditions));
  const withDetails = await Promise.all(tickets.map((t) => getTicketWithDetails(req.db!, t.id, tid)));
  res.json(withDetails.filter(Boolean));
});

router.patch("/kitchen/tickets/:id/status", async (req, res): Promise<void> => {
  const params = UpdateTicketStatusParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdateTicketStatusBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const tid = req.tenantId!;
  const [ticket] = await req.db!
    .update(kitchenTicketsTable)
    .set({ status: parsed.data.status })
    .where(and(eq(kitchenTicketsTable.id, params.data.id), eq(kitchenTicketsTable.tenantId, tid)))
    .returning();
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  if (parsed.data.status === "ready") {
    await req.db!.update(ordersTable).set({ status: "ready" })
      .where(and(eq(ordersTable.id, ticket.orderId), eq(ordersTable.tenantId, tid)));
  }
  if (parsed.data.status === "in_progress") {
    await req.db!.update(ordersTable).set({ status: "preparing" })
      .where(and(eq(ordersTable.id, ticket.orderId), eq(ordersTable.tenantId, tid)));
  }

  const result = await getTicketWithDetails(req.db!, ticket.id, tid);

  sseBroker.emit({
    type: "ticket:updated",
    data: { ticketId: ticket.id, status: parsed.data.status, orderId: ticket.orderId },
  });
  socketBroker.emit({
    type: "ticket:updated",
    payload: { ticketId: ticket.id, status: parsed.data.status, orderId: ticket.orderId },
    tenantId: tid,
    timestamp: new Date().toISOString(),
  });
  if (parsed.data.status === "ready") {
    socketBroker.emit({
      type: "order:ready",
      payload: { orderId: ticket.orderId },
      tenantId: tid,
      timestamp: new Date().toISOString(),
    });
  }

  res.json(result);
});

router.get("/kitchen/availability", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const products = await req.db!
    .select({
      id: productsTable.id,
      name: productsTable.name,
      categoryId: productsTable.categoryId,
      price: productsTable.price,
      isActive: productsTable.isActive,
      kitchenAvailable: productsTable.kitchenAvailable,
      unavailabilityReason: productsTable.unavailabilityReason,
      unavailableUntil: productsTable.unavailableUntil,
    })
    .from(productsTable)
    .where(and(eq(productsTable.tenantId, tid), eq(productsTable.isActive, true)));
  res.json(products.map((p) => ({ ...p, price: parseFloat(p.price), unavailableUntil: p.unavailableUntil?.toISOString() ?? null })));
});

router.patch("/kitchen/availability/:productId", async (req, res): Promise<void> => {
  const params = SetProductAvailabilityParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = SetProductAvailabilityBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const tid = req.tenantId!;
  const { available, reason, reasonNote, changedBy, unavailableUntil } = parsed.data;

  const untilDate = !available && unavailableUntil ? new Date(unavailableUntil) : null;

  const [product] = await req.db!
    .update(productsTable)
    .set({
      kitchenAvailable: available,
      unavailabilityReason: available ? null : (reason ?? null),
      unavailableUntil: available ? null : untilDate,
    })
    .where(and(eq(productsTable.id, params.data.productId), eq(productsTable.tenantId, tid)))
    .returning();

  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  await req.db!.insert(productAvailabilityLogTable).values({
    tenantId: tid,
    productId: product.id,
    productName: product.name,
    action: available ? "enabled" : "disabled",
    reason: available ? null : (reason ?? null),
    reasonNote: reasonNote ?? null,
    changedBy: changedBy ?? "kitchen",
  });

  sseBroker.emit({
    type: available ? "product:available" : "product:unavailable",
    data: {
      productId: product.id,
      productName: product.name,
      reason: available ? null : (reason ?? null),
      changedBy: changedBy ?? "kitchen",
    },
  });
  socketBroker.emit({
    type: available ? "product:available" : "product:unavailable",
    payload: {
      productId: product.id,
      productName: product.name,
      reason: available ? null : (reason ?? null),
      changedBy: changedBy ?? "kitchen",
    },
    tenantId: tid,
    timestamp: new Date().toISOString(),
  });

  void logger.info({ productId: product.id, available, reason, until: untilDate }, "Kitchen availability changed");

  res.json({
    id: product.id,
    name: product.name,
    kitchenAvailable: product.kitchenAvailable,
    unavailabilityReason: product.unavailabilityReason,
    unavailableUntil: product.unavailableUntil?.toISOString() ?? null,
  });
});

router.get("/kitchen/availability/log", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const logs = await req.db!
    .select()
    .from(productAvailabilityLogTable)
    .where(eq(productAvailabilityLogTable.tenantId, tid))
    .orderBy(desc(productAvailabilityLogTable.changedAt))
    .limit(200);
  res.json(logs);
});

export default router;
