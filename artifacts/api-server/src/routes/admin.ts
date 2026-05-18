import { Router } from "express";
import { desc, and, gte, lt, eq } from "drizzle-orm";
import { db, auditLogsTable } from "@workspace/db";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.get("/admin/audit-logs", authorize("admin", "owner"), async (req, res): Promise<void> => {
  const { from, to, action, limit } = req.query as {
    from?: string;
    to?: string;
    action?: string;
    limit?: string;
  };

  const pageLimit = Math.min(Math.max(parseInt(limit ?? "500", 10) || 500, 1), 500);
  const conditions = [];

  if (from) {
    const fromDate = new Date(from);
    if (!isNaN(fromDate.getTime())) conditions.push(gte(auditLogsTable.createdAt, fromDate));
  }
  if (to) {
    const toDate = new Date(to);
    if (!isNaN(toDate.getTime())) {
      toDate.setDate(toDate.getDate() + 1);
      conditions.push(lt(auditLogsTable.createdAt, toDate));
    }
  }
  if (action) conditions.push(eq(auditLogsTable.action, action));

  const logs = conditions.length
    ? await db
        .select()
        .from(auditLogsTable)
        .where(and(...conditions))
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(pageLimit)
    : await db
        .select()
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.createdAt))
        .limit(pageLimit);

  res.json(logs);
});

export default router;
