import { pgTable, serial, integer, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const userSessionsTable = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  userId: integer("user_id").notNull(),
  userName: text("user_name"),
  userRole: text("user_role"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceFingerprint: text("device_fingerprint"),
  isSuccess: boolean("is_success").notNull().default(true),
  sessionTokenHash: text("session_token_hash"),
  mfaVerified: boolean("mfa_verified").notNull().default(false),
  revoked: boolean("revoked").notNull().default(false),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserSession = typeof userSessionsTable.$inferSelect;

export const securityEventsTable = pgTable("security_events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  type: text("type").notNull(),
  ipAddress: text("ip_address"),
  userId: integer("user_id"),
  userName: text("user_name"),
  metadata: jsonb("metadata"),
  severity: text("severity").notNull().default("low"),
  resolved: boolean("resolved").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SecurityEvent = typeof securityEventsTable.$inferSelect;

export type SecurityEventType =
  | "login_failed"
  | "brute_force"
  | "suspicious_ip"
  | "account_locked"
  | "mfa_failed"
  | "session_revoked"
  | "mfa_enabled"
  | "mfa_disabled"
  | "login_success";

export type SecuritySeverity = "low" | "medium" | "high" | "critical";
