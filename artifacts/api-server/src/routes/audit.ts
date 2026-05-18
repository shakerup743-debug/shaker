import { Router } from "express";
import { db, auditLogsTable } from "@workspace/db";
import { desc, eq, and, gte, sql } from "drizzle-orm";
import { authorize } from "../middleware/authorize.js";

const router = Router();

// GET /api/audit — paginated audit log (admin/owner/manager)
router.get("/api/audit", authorize("admin", "owner", "area_manager", "branch_manager"), async (req, res) => {
  const limit  = Math.min(Number(req.query["limit"]  ?? 100), 500);
  const offset = Number(req.query["offset"] ?? 0);
  const action = req.query["action"] as string | undefined;
  const since  = req.query["since"]  as string | undefined;

  const conditions = [];
  if (action) conditions.push(eq(auditLogsTable.action, action));
  if (since)  conditions.push(gte(auditLogsTable.createdAt, new Date(since)));

  const [rows, countRow] = await Promise.all([
    db.select().from(auditLogsTable)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogsTable)
      .where(conditions.length ? and(...conditions) : undefined),
  ]);

  res.json({ data: rows, total: countRow[0]?.total ?? 0, limit, offset });
});

// GET /api/audit/actions — distinct action types
router.get("/api/audit/actions", authorize("admin", "owner", "area_manager", "branch_manager"), async (_req, res) => {
  const rows = await db
    .selectDistinct({ action: auditLogsTable.action })
    .from(auditLogsTable)
    .orderBy(auditLogsTable.action);
  res.json(rows.map(r => r.action));
});

export default router;
