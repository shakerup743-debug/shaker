import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, suppliersTable, supplierOrdersTable, supplierOrderItemsTable } from "@workspace/db";
import { logAudit } from "../lib/audit.js";
import { authorize } from "../middleware/authorize.js";

const router: IRouter = Router();

// GET /suppliers
router.get("/suppliers", async (_req, res): Promise<void> => {
  const suppliers = await db.select().from(suppliersTable).orderBy(desc(suppliersTable.createdAt));
  res.json(suppliers);
});

// GET /suppliers/:id
router.get("/suppliers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }

  const orders = await db.select().from(supplierOrdersTable)
    .where(eq(supplierOrdersTable.supplierId, id))
    .orderBy(desc(supplierOrdersTable.createdAt))
    .limit(20);

  res.json({ ...supplier, recentOrders: orders });
});

// POST /suppliers
router.post("/suppliers", authorize("admin", "inventory_manager"), async (req, res): Promise<void> => {
  const { name, contactName, phone, email, address, notes, leadTimeDays, paymentTerms, rating } = req.body as {
    name: string; contactName?: string; phone?: string; email?: string; address?: string;
    notes?: string; leadTimeDays?: number; paymentTerms?: string; rating?: number;
  };

  if (!name) { res.status(400).json({ error: "name required" }); return; }

  const [supplier] = await db.insert(suppliersTable)
    .values({ name, contactName, phone, email, address, notes, leadTimeDays: leadTimeDays ?? 1, paymentTerms: paymentTerms ?? "cash", rating: rating ? String(rating) : "5.0" })
    .returning();

  await logAudit(req, "CREATE", "supplier", String(supplier.id), { name });
  res.status(201).json(supplier);
});

// PATCH /suppliers/:id
router.patch("/suppliers/:id", authorize("admin", "inventory_manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const { name, contactName, phone, email, address, notes, leadTimeDays, paymentTerms, rating, isActive } = req.body as Partial<{
    name: string; contactName: string; phone: string; email: string; address: string;
    notes: string; leadTimeDays: number; paymentTerms: string; rating: number; isActive: boolean;
  }>;

  const [supplier] = await db.update(suppliersTable)
    .set({ name, contactName, phone, email, address, notes, leadTimeDays, paymentTerms, rating: rating ? String(rating) : undefined, isActive })
    .where(eq(suppliersTable.id, id))
    .returning();

  if (!supplier) { res.status(404).json({ error: "Supplier not found" }); return; }
  await logAudit(req, "UPDATE", "supplier", String(id));
  res.json(supplier);
});

// DELETE /suppliers/:id
router.delete("/suppliers/:id", authorize("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  await logAudit(req, "DELETE", "supplier", String(id));
  res.json({ success: true });
});

// GET /supplier-orders
router.get("/supplier-orders", async (req, res): Promise<void> => {
  const { supplierId } = req.query as { supplierId?: string };
  let query = db.select({
    id: supplierOrdersTable.id,
    supplierId: supplierOrdersTable.supplierId,
    supplierName: suppliersTable.name,
    status: supplierOrdersTable.status,
    expectedDelivery: supplierOrdersTable.expectedDelivery,
    totalCost: supplierOrdersTable.totalCost,
    notes: supplierOrdersTable.notes,
    createdBy: supplierOrdersTable.createdBy,
    createdAt: supplierOrdersTable.createdAt,
  }).from(supplierOrdersTable)
    .leftJoin(suppliersTable, eq(supplierOrdersTable.supplierId, suppliersTable.id))
    .$dynamic();

  if (supplierId) query = query.where(eq(supplierOrdersTable.supplierId, parseInt(supplierId, 10)));
  const orders = await query.orderBy(desc(supplierOrdersTable.createdAt));
  res.json(orders);
});

// POST /supplier-orders
router.post("/supplier-orders", authorize("admin", "inventory_manager"), async (req, res): Promise<void> => {
  const { supplierId, items, expectedDelivery, notes } = req.body as {
    supplierId: number;
    items: Array<{ inventoryId?: number; itemName: string; quantity: number; unit: string; unitCost: number }>;
    expectedDelivery?: string;
    notes?: string;
  };

  if (!supplierId || !items?.length) { res.status(400).json({ error: "supplierId and items required" }); return; }

  const totalCost = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

  const [order] = await db.transaction(async (tx) => {
    const [o] = await tx.insert(supplierOrdersTable)
      .values({
        supplierId,
        status: "pending",
        expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : undefined,
        notes,
        totalCost: String(totalCost),
        createdBy: req.user?.name,
      })
      .returning();

    for (const item of items) {
      await tx.insert(supplierOrderItemsTable).values({
        supplierOrderId: o.id,
        inventoryId: item.inventoryId,
        itemName: item.itemName,
        quantity: String(item.quantity),
        unit: item.unit,
        unitCost: String(item.unitCost),
      });
    }
    return [o];
  });

  await logAudit(req, "CREATE", "supplier_order", String(order.id));
  res.status(201).json(order);
});

// PATCH /supplier-orders/:id/status
router.patch("/supplier-orders/:id/status", authorize("admin", "inventory_manager"), async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const { status } = req.body as { status: string };

  const [order] = await db.update(supplierOrdersTable)
    .set({ status })
    .where(eq(supplierOrdersTable.id, id))
    .returning();

  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  await logAudit(req, "UPDATE", "supplier_order", String(id), { status });
  res.json(order);
});

export default router;
