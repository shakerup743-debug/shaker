import { db, auditLogsTable } from "@workspace/db";
import { logger } from "./logger.js";
import type { Request } from "express";

export interface AuditActor {
  userId: number;
  userName: string;
}

export async function logAudit(
  req: Request,
  action: string,
  resource: string,
  resourceId?: string | number | null,
  metadata?: Record<string, unknown>,
  actor?: AuditActor,
): Promise<void> {
  const userId = actor?.userId ?? (req.user?.sub ? parseInt(req.user.sub, 10) : null);
  const userName = actor?.userName ?? req.user?.name ?? null;
  const userRole = req.user?.role ?? null;
  const ipAddress = req.ip ?? req.socket?.remoteAddress ?? null;
  const userAgent = req.headers["user-agent"] ?? null;

  try {
    await db.insert(auditLogsTable).values({
      userId,
      userName,
      userRole,
      action,
      resource,
      resourceId: resourceId != null ? String(resourceId) : null,
      metadata: metadata ?? null,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    logger.warn({ err, action, resource }, "audit log insert failed");
  }
}
