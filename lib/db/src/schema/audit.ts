import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  branchId: integer("branch_id"),
  userId: integer("user_id"),
  userName: text("user_name"),
  userRole: text("user_role"),
  action: text("action").notNull(),
  resource: text("resource").notNull(),
  resourceId: text("resource_id"),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  metadata: jsonb("metadata"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;

export type AuditAction =
  | "create" | "update" | "delete" | "login" | "logout"
  | "view" | "export" | "print" | "adjust" | "complete"
  | "cancel" | "approve" | "reject";
