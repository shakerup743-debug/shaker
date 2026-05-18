import { Router } from "express";
import { db } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { customersTable } from "@workspace/db";
import { logAudit } from "../lib/audit.js";

const router = Router();

const TIER_THRESHOLDS = { bronze: 0, silver: 500, gold: 1500, platinum: 5000 };

function getTier(points: number): string {
  if (points >= TIER_THRESHOLDS.platinum) return "platinum";
  if (points >= TIER_THRESHOLDS.gold) return "gold";
  if (points >= TIER_THRESHOLDS.silver) return "silver";
  return "bronze";
}

/* ── Get loyalty history for a customer ── */
router.get("/loyalty/:customerId/history", async (req, res) => {
  const id = Number(req.params.customerId);
  const history = await db.execute<{
    id: number; points: number; type: string; note: string | null;
    order_id: number | null; created_at: string;
  }>(sql`SELECT * FROM loyalty_points WHERE customer_id = ${id} ORDER BY created_at DESC LIMIT 50`);

  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  res.json({ customer: cust ?? null, history: history.rows });
});

/* ── Award points manually ── */
router.post("/loyalty/:customerId/award", async (req, res) => {
  const id = Number(req.params.customerId);
  const { points, note } = req.body as { points?: number; note?: string };
  if (!points || points <= 0) { res.status(400).json({ error: "points must be positive" }); return; }

  await db.execute(sql`
    INSERT INTO loyalty_points (customer_id, points, type, note)
    VALUES (${id}, ${points}, 'manual', ${note ?? null})
  `);

  const [updated] = await db
    .update(customersTable)
    .set({ loyaltyPoints: sql`${customersTable.loyaltyPoints} + ${points}`, updatedAt: new Date() })
    .where(eq(customersTable.id, id))
    .returning();

  if (updated) {
    const newTier = getTier(updated.loyaltyPoints);
    if (newTier !== updated.loyaltyTier) {
      await db.update(customersTable).set({ loyaltyTier: newTier }).where(eq(customersTable.id, id));
    }
  }

  void logAudit(req, "award_points", "loyalty", id, { points, note });
  res.json({ customerId: id, pointsAwarded: points, newTotal: updated?.loyaltyPoints ?? 0 });
});

/* ── Redeem points ── */
router.post("/loyalty/:customerId/redeem", async (req, res) => {
  const id = Number(req.params.customerId);
  const { points, note } = req.body as { points?: number; note?: string };
  if (!points || points <= 0) { res.status(400).json({ error: "points must be positive" }); return; }

  const [cust] = await db.select().from(customersTable).where(eq(customersTable.id, id));
  if (!cust) { res.status(404).json({ error: "Customer not found" }); return; }
  if (cust.loyaltyPoints < points) { res.status(400).json({ error: "Insufficient points" }); return; }

  await db.execute(sql`
    INSERT INTO loyalty_points (customer_id, points, type, note)
    VALUES (${id}, ${-points}, 'redeem', ${note ?? "Redeemed"})
  `);

  const [updated] = await db
    .update(customersTable)
    .set({ loyaltyPoints: sql`${customersTable.loyaltyPoints} - ${points}`, updatedAt: new Date() })
    .where(eq(customersTable.id, id))
    .returning();

  const newTier = getTier(updated?.loyaltyPoints ?? 0);
  await db.update(customersTable).set({ loyaltyTier: newTier }).where(eq(customersTable.id, id));

  void logAudit(req, "redeem_points", "loyalty", id, { points });
  res.json({ customerId: id, pointsRedeemed: points, remaining: updated?.loyaltyPoints ?? 0 });
});

/* ── Leaderboard ── */
// customers table has no tenant_id/RLS; uses global db (intentional).
// orders table does not have a customer_id FK so the join is omitted.
router.get("/loyalty/leaderboard", async (_req, res) => {
  const rows = await db.execute<{
    id: number; name: string; email: string; loyalty_points: number; loyalty_tier: string; total_orders: number;
  }>(sql`
    SELECT id, name, email, loyalty_points, loyalty_tier, total_orders
    FROM customers
    ORDER BY loyalty_points DESC
    LIMIT 20
  `);
  res.json(rows.rows);
});

export default router;
