import { pgTable, serial, integer, text, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";

export const masterPasswordsTable = pgTable("master_passwords", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1).unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: integer("created_by").notNull(),
  lastChangedAt: timestamp("last_changed_at", { withTimezone: true }),
  changedBy: integer("changed_by"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  usageCount: integer("usage_count").notNull().default(0),
  lastUsedById: integer("last_used_by_id"),
  lastUsedFor: text("last_used_for"),
  lastUsedAmount: numeric("last_used_amount", { precision: 10, scale: 2 }),
  backupCodes: jsonb("backup_codes").$type<string[]>(),
  backupCodesUsed: jsonb("backup_codes_used").$type<boolean[]>(),
});

export type MasterPassword = typeof masterPasswordsTable.$inferSelect;
export type InsertMasterPassword = typeof masterPasswordsTable.$inferInsert;
