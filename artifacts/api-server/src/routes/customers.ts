import { Router, type IRouter } from "express";
import { eq, desc, ilike, sql, and } from "drizzle-orm";
import { customersTable, customerNotesTable, loyaltyTransactionsTable } from "@workspace/db";
import { logAudit } from "../lib/audit.js";
import { requireTenant } from "../middleware/require-tenant.js";

const router: IRouter = Router();

router.use(requireTenant);

function computeTier(points: number): string {
  if (points >= 3000) return "platinum";
  if (points >= 1500) return "gold";
  if (points >= 500) return "silver";
  return "bronze";
}

// GET /customers
router.get("/customers", async (req, res): Promise<void> => {
  const { search, tier } = req.query as { search?: string; tier?: string };
  const tid = req.tenantId!;

  let query = req.db!.select().from(customersTable).where(eq(customersTable.tenantId, tid)).$dynamic();
  if (search) query = query.where(and(eq(customersTable.tenantId, tid), ilike(customersTable.name, `%${search}%`)));
  if (tier) query = query.where(and(eq(customersTable.tenantId, tid), eq(customersTable.loyaltyTier, tier)));

  const customers = await query.orderBy(desc(customersTable.createdAt));
  res.json(customers);
});

// GET /customers/stats/summary — must be before /:id
router.get("/customers/stats/summary", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const [stats] = await req.db!.select({
    total: sql<number>`count(*)::int`,
    active: sql<number>`count(*) filter (where is_active)::int`,
    bronze: sql<number>`count(*) filter (where loyalty_tier='bronze')::int`,
    silver: sql<number>`count(*) filter (where loyalty_tier='silver')::int`,
    gold: sql<number>`count(*) filter (where loyalty_tier='gold')::int`,
    platinum: sql<number>`count(*) filter (where loyalty_tier='platinum')::int`,
    totalPoints: sql<number>`coalesce(sum(loyalty_points),0)::int`,
  }).from(customersTable).where(eq(customersTable.tenantId, tid));

  res.json(stats);
});

// GET /customers/:id
router.get("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const tid = req.tenantId!;

  const [customer] = await req.db!.select().from(customersTable)
    .where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tid)));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const notes = await req.db!.select().from(customerNotesTable)
    .where(eq(customerNotesTable.customerId, id))
    .orderBy(desc(customerNotesTable.createdAt));

  const transactions = await req.db!.select().from(loyaltyTransactionsTable)
    .where(eq(loyaltyTransactionsTable.customerId, id))
    .orderBy(desc(loyaltyTransactionsTable.createdAt))
    .limit(20);

  res.json({ ...customer, notes, loyaltyHistory: transactions });
});

// POST /customers
router.post("/customers", async (req, res): Promise<void> => {
  const { name, phone, email, notes } = req.body as { name: string; phone: string; email?: string; notes?: string };
  if (!name || !phone) { res.status(400).json({ error: "name and phone required" }); return; }

  try {
    const [customer] = await req.db!.insert(customersTable)
      .values({ name, phone, email, notes, tenantId: req.tenantId! })
      .returning();

    await logAudit(req, "CREATE", "customer", String(customer.id), { name, phone });
    res.status(201).json(customer);
  } catch {
    res.status(409).json({ error: "Phone already exists for this tenant" });
  }
});

// PATCH /customers/:id
router.patch("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const tid = req.tenantId!;
  const { name, phone, email, notes, isActive } = req.body as Partial<{
    name: string; phone: string; email: string; notes: string; isActive: boolean;
  }>;

  const [customer] = await req.db!.update(customersTable)
    .set({ name, phone, email, notes, isActive })
    .where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tid)))
    .returning();

  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }
  await logAudit(req, "UPDATE", "customer", String(id));
  res.json(customer);
});

// DELETE /customers/:id
router.delete("/customers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const tid = req.tenantId!;
  await req.db!.delete(customersTable)
    .where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tid)));
  await logAudit(req, "DELETE", "customer", String(id));
  res.json({ success: true });
});

// POST /customers/:id/notes
router.post("/customers/:id/notes", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const tid = req.tenantId!;
  const { note } = req.body as { note: string };
  if (!note) { res.status(400).json({ error: "note required" }); return; }

  // Verify customer belongs to tenant
  const [customer] = await req.db!.select({ id: customersTable.id })
    .from(customersTable)
    .where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tid)));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const [n] = await req.db!.insert(customerNotesTable)
    .values({ customerId: id, note, addedBy: req.user?.name })
    .returning();
  res.status(201).json(n);
});

// POST /customers/:id/loyalty
router.post("/customers/:id/loyalty", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const tid = req.tenantId!;
  const { points, type, reason, orderId } = req.body as {
    points: number; type: "earn" | "redeem" | "adjust"; reason?: string; orderId?: number;
  };

  const [customer] = await req.db!.select().from(customersTable)
    .where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tid)));
  if (!customer) { res.status(404).json({ error: "Customer not found" }); return; }

  const delta = type === "redeem" ? -Math.abs(points) : Math.abs(points);
  const newPoints = Math.max(0, customer.loyaltyPoints + delta);
  const newTier = computeTier(newPoints);

  await req.db!.transaction(async (tx) => {
    await tx.update(customersTable)
      .set({ loyaltyPoints: newPoints, loyaltyTier: newTier })
      .where(and(eq(customersTable.id, id), eq(customersTable.tenantId, tid)));

    await tx.insert(loyaltyTransactionsTable)
      .values({ customerId: id, points: delta, type, reason, orderId });
  });

  res.json({ customerId: id, newPoints, newTier });
});

export default router;
