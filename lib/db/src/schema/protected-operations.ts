import { pgTable, serial, integer, text, timestamp, boolean } from "drizzle-orm/pg-core";

export const protectedOperationsTable = pgTable("protected_operations", {
  id: serial("id").primaryKey(),
  operationKey: text("operation_key").notNull().unique(),
  operationNameEn: text("operation_name_en").notNull(),
  operationNameAr: text("operation_name_ar").notNull(),
  description: text("description"),
  requiresPassword: boolean("requires_password").notNull().default(true),
  isEnabled: boolean("is_enabled").notNull().default(true),
  riskLevel: text("risk_level").notNull().default("high"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const protectedOperationLogsTable = pgTable("protected_operation_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1),
  operationKey: text("operation_key").notNull(),
  userId: integer("user_id").notNull(),
  passwordVerified: boolean("password_verified"),
  ipAddress: text("ip_address"),
  actionDetails: text("action_details"),
  result: text("result").notNull(),
  errorMessage: text("error_message"),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export type ProtectedOperation = typeof protectedOperationsTable.$inferSelect;
export type ProtectedOperationLog = typeof protectedOperationLogsTable.$inferSelect;
