import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import { wasteLogsTable, inventoryTable } from "@workspace/db";
import { requireTenant } from "../middleware/require-tenant.js";
import { ListWasteLogsQueryParams, CreateWasteLogBody } from "@workspace/api-zod";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireTenant);

type TenantDb = NonNullable<Express.Request["db"]>;

function formatWasteLog(row: typeof wasteLogsTable.$inferSelect) {
  return {
    ...row,
    quantity: parseFloat(row.quantity),
    costEstimate: row.costEstimate ? parseFloat(row.costEstimate) : null,
  };
}

/* ─── GET /waste ────────────────────────────────────────────────────────── */
router.get("/waste", async (req, res): Promise<void> => {
  const db = req.db as TenantDb;
  const tenantId = req.tenantId!;

  // Coerce date strings → Date objects before Zod validation
  const rawQuery = {
    ...req.query,
    ...(typeof req.query.from === "string" && req.query.from ? { from: new Date(req.query.from) } : {}),
    ...(typeof req.query.to   === "string" && req.query.to   ? { to:   new Date(req.query.to)   } : {}),
  };
  const parsed = ListWasteLogsQueryParams.safeParse(rawQuery);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query parameters" });
    return;
  }

  const { from, to, inventoryId, reason } = parsed.data;

  const conditions = [eq(wasteLogsTable.tenantId, tenantId)];
  if (from) {
    conditions.push(gte(wasteLogsTable.createdAt, from));
  }
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(wasteLogsTable.createdAt, end));
  }
  if (inventoryId) {
    conditions.push(eq(wasteLogsTable.inventoryId, Number(inventoryId)));
  }
  if (reason) {
    conditions.push(eq(wasteLogsTable.reason, reason as typeof wasteLogsTable.$inferSelect["reason"]));
  }

  const rows = await db
    .select()
    .from(wasteLogsTable)
    .where(and(...conditions))
    .orderBy(desc(wasteLogsTable.createdAt))
    .limit(300);

  res.json(rows.map(formatWasteLog));
});

/* ─── POST /waste ───────────────────────────────────────────────────────── */
router.post("/waste", async (req, res): Promise<void> => {
  const db = req.db as TenantDb;
  const tenantId = req.tenantId!;

  const parsed = CreateWasteLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.issues });
    return;
  }

  const { inventoryId, inventoryName, quantity, unit, reason, notes, loggedBy, costEstimate, deductFromInventory } = parsed.data;

  await db.transaction(async (tx) => {
    if (deductFromInventory !== false && inventoryId) {
      const [inv] = await tx
        .select({ quantity: inventoryTable.quantity })
        .from(inventoryTable)
        .where(and(eq(inventoryTable.id, inventoryId), eq(inventoryTable.tenantId, tenantId)))
        .for("update");

      if (inv) {
        const newQty = Math.max(0, parseFloat(inv.quantity) - quantity);
        await tx
          .update(inventoryTable)
          .set({ quantity: String(newQty) })
          .where(and(eq(inventoryTable.id, inventoryId), eq(inventoryTable.tenantId, tenantId)));
      }
    }

    const [log] = await tx
      .insert(wasteLogsTable)
      .values({
        tenantId,
        inventoryId: inventoryId ?? null,
        inventoryName,
        quantity: String(quantity),
        unit,
        reason: reason as typeof wasteLogsTable.$inferSelect["reason"],
        notes: notes ?? null,
        loggedBy: loggedBy ?? null,
        costEstimate: costEstimate != null ? String(costEstimate) : null,
      })
      .returning();

    void logAudit(req, "waste:logged", "waste_logs", log.id, { inventoryName, quantity, reason });

    res.status(201).json(formatWasteLog(log));
  });
});

/* ─── GET /waste/analytics ──────────────────────────────────────────────── */
router.get("/waste/analytics", async (req, res): Promise<void> => {
  const db = req.db as TenantDb;
  const tenantId = req.tenantId!;

  const { from, to } = req.query as { from?: string; to?: string };

  const conditions = [eq(wasteLogsTable.tenantId, tenantId)];
  if (from) conditions.push(gte(wasteLogsTable.createdAt, new Date(from)));
  if (to) {
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(wasteLogsTable.createdAt, end));
  }

  const [totals] = await db
    .select({
      totalWasteCost: sql<string>`coalesce(sum(cost_estimate), 0)`,
      totalEntries: sql<string>`count(*)`,
    })
    .from(wasteLogsTable)
    .where(and(...conditions));

  const topItems = await db
    .select({
      inventoryId: wasteLogsTable.inventoryId,
      inventoryName: wasteLogsTable.inventoryName,
      unit: wasteLogsTable.unit,
      totalWasted: sql<string>`sum(quantity)`,
      totalCost: sql<string>`coalesce(sum(cost_estimate), 0)`,
      count: sql<string>`count(*)`,
    })
    .from(wasteLogsTable)
    .where(and(...conditions))
    .groupBy(wasteLogsTable.inventoryId, wasteLogsTable.inventoryName, wasteLogsTable.unit)
    .orderBy(desc(sql`sum(quantity)`))
    .limit(10);

  const byReasonRows = await db
    .select({
      reason: wasteLogsTable.reason,
      totalCost: sql<string>`coalesce(sum(cost_estimate), 0)`,
    })
    .from(wasteLogsTable)
    .where(and(...conditions))
    .groupBy(wasteLogsTable.reason);

  const byReason: Record<string, number> = {};
  for (const r of byReasonRows) {
    byReason[r.reason] = parseFloat(r.totalCost);
  }

  const dailyTrend = await db
    .select({
      date: sql<string>`to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')`,
      totalCost: sql<string>`coalesce(sum(cost_estimate), 0)`,
      entries: sql<string>`count(*)`,
    })
    .from(wasteLogsTable)
    .where(and(...conditions))
    .groupBy(sql`to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(created_at at time zone 'UTC', 'YYYY-MM-DD')`);

  res.json({
    totalWasteCost: parseFloat(totals?.totalWasteCost ?? "0"),
    totalEntries: parseInt(totals?.totalEntries ?? "0", 10),
    topWastedItems: topItems.map((i) => ({
      inventoryId: i.inventoryId,
      inventoryName: i.inventoryName,
      unit: i.unit,
      totalWasted: parseFloat(i.totalWasted),
      totalCost: parseFloat(i.totalCost),
      count: parseInt(i.count, 10),
    })),
    byReason,
    dailyTrend: dailyTrend.map((d) => ({
      date: d.date,
      totalCost: parseFloat(d.totalCost),
      entries: parseInt(d.entries, 10),
    })),
  });
});

export default router;
