import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { restaurantTablesTable, tableReservationsTable } from "@workspace/db";
import { logAudit } from "../lib/audit.js";
import { authorize } from "../middleware/authorize.js";
import { requireTenant } from "../middleware/require-tenant.js";

const router: IRouter = Router();

router.use(requireTenant);

// GET /tables
router.get("/tables", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const tables = await req.db!.select().from(restaurantTablesTable)
    .where(eq(restaurantTablesTable.tenantId, tid))
    .orderBy(restaurantTablesTable.number);
  res.json(tables);
});

// POST /tables
router.post("/tables", authorize("admin"), async (req, res): Promise<void> => {
  const { number, capacity, posX, posY, shape, section } = req.body as {
    number: string; capacity?: number; posX?: number; posY?: number; shape?: string; section?: string;
  };
  if (!number) { res.status(400).json({ error: "number required" }); return; }

  try {
    const [table] = await req.db!.insert(restaurantTablesTable)
      .values({
        number,
        tenantId: req.tenantId!,
        capacity: capacity ?? 4,
        posX: posX ?? 0,
        posY: posY ?? 0,
        shape: shape ?? "rectangle",
        section: section ?? "main",
      })
      .returning();
    await logAudit(req, "CREATE", "table", String(table.id), { number });
    res.status(201).json(table);
  } catch {
    res.status(409).json({ error: "Table number already exists" });
  }
});

// PATCH /tables/:id
router.patch("/tables/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const tid = req.tenantId!;
  const { number, capacity, posX, posY, shape, section, status, customerName, guestCount, isActive } = req.body as Partial<{
    number: string; capacity: number; posX: number; posY: number; shape: string;
    section: string; status: string; customerName: string; guestCount: number; isActive: boolean;
  }>;

  const updateData: Record<string, unknown> = {};
  if (number !== undefined) updateData.number = number;
  if (capacity !== undefined) updateData.capacity = capacity;
  if (posX !== undefined) updateData.posX = posX;
  if (posY !== undefined) updateData.posY = posY;
  if (shape !== undefined) updateData.shape = shape;
  if (section !== undefined) updateData.section = section;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (customerName !== undefined) updateData.customerName = customerName;
  if (guestCount !== undefined) updateData.guestCount = guestCount;

  if (status !== undefined) {
    updateData.status = status;
    if (status === "occupied") {
      updateData.occupiedSince = new Date();
    } else if (status === "available") {
      updateData.occupiedSince = null;
      updateData.customerName = null;
      updateData.guestCount = null;
      updateData.currentOrderId = null;
    }
  }

  const [table] = await req.db!.update(restaurantTablesTable)
    .set(updateData)
    .where(and(eq(restaurantTablesTable.id, id), eq(restaurantTablesTable.tenantId, tid)))
    .returning();

  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  res.json(table);
});

// DELETE /tables/:id
router.delete("/tables/:id", authorize("admin"), async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const tid = req.tenantId!;
  await req.db!.delete(restaurantTablesTable)
    .where(and(eq(restaurantTablesTable.id, id), eq(restaurantTablesTable.tenantId, tid)));
  await logAudit(req, "DELETE", "table", String(id));
  res.json({ success: true });
});

// POST /tables/:id/seat
router.post("/tables/:id/seat", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const tid = req.tenantId!;
  const { customerName, guestCount } = req.body as { customerName?: string; guestCount?: number };

  const [table] = await req.db!.update(restaurantTablesTable)
    .set({ status: "occupied", occupiedSince: new Date(), customerName, guestCount })
    .where(and(eq(restaurantTablesTable.id, id), eq(restaurantTablesTable.tenantId, tid)))
    .returning();

  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  res.json(table);
});

// POST /tables/:id/clear
router.post("/tables/:id/clear", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const tid = req.tenantId!;
  const { needsCleaning } = req.body as { needsCleaning?: boolean };

  const [table] = await req.db!.update(restaurantTablesTable)
    .set({
      status: needsCleaning ? "needs_cleaning" : "available",
      currentOrderId: null,
      customerName: null,
      guestCount: null,
      occupiedSince: null,
    })
    .where(and(eq(restaurantTablesTable.id, id), eq(restaurantTablesTable.tenantId, tid)))
    .returning();

  if (!table) { res.status(404).json({ error: "Table not found" }); return; }
  res.json(table);
});

// GET /reservations
router.get("/reservations", async (req, res): Promise<void> => {
  const tid = req.tenantId!;

  const reservations = await req.db!.select({
    id: tableReservationsTable.id,
    tableId: tableReservationsTable.tableId,
    tableNumber: restaurantTablesTable.number,
    customerName: tableReservationsTable.customerName,
    customerPhone: tableReservationsTable.customerPhone,
    guestCount: tableReservationsTable.guestCount,
    reservationTime: tableReservationsTable.reservationTime,
    status: tableReservationsTable.status,
    notes: tableReservationsTable.notes,
    createdAt: tableReservationsTable.createdAt,
  }).from(tableReservationsTable)
    .leftJoin(
      restaurantTablesTable,
      and(
        eq(tableReservationsTable.tableId, restaurantTablesTable.id),
        eq(restaurantTablesTable.tenantId, tid),
      )
    )
    .orderBy(tableReservationsTable.reservationTime);
  res.json(reservations);
});

// POST /reservations
router.post("/reservations", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const { tableId, customerName, customerPhone, guestCount, reservationTime, notes } = req.body as {
    tableId: number; customerName: string; customerPhone?: string; guestCount?: number;
    reservationTime: string; notes?: string;
  };

  if (!tableId || !customerName || !reservationTime) {
    res.status(400).json({ error: "tableId, customerName, reservationTime required" }); return;
  }

  // Verify table belongs to tenant
  const [existingTable] = await req.db!.select({ id: restaurantTablesTable.id })
    .from(restaurantTablesTable)
    .where(and(eq(restaurantTablesTable.id, tableId), eq(restaurantTablesTable.tenantId, tid)));
  if (!existingTable) { res.status(404).json({ error: "Table not found" }); return; }

  const [reservation] = await req.db!.insert(tableReservationsTable).values({
    tableId,
    customerName,
    customerPhone,
    guestCount: guestCount ?? 1,
    reservationTime: new Date(reservationTime),
    notes,
  }).returning();

  res.status(201).json(reservation);
});

// PATCH /reservations/:id
router.patch("/reservations/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params["id"] as string, 10);
  const { status } = req.body as { status: string };

  const [reservation] = await req.db!.update(tableReservationsTable)
    .set({ status })
    .where(eq(tableReservationsTable.id, id))
    .returning();

  if (!reservation) { res.status(404).json({ error: "Reservation not found" }); return; }
  res.json(reservation);
});

export default router;
