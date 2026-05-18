import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { restaurantTablesTable } from "./tables";
import { tenantsTable } from "./tenants";

export const qrTokensTable = pgTable("qr_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  tenantId: integer("tenant_id").default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  tableId: integer("table_id").notNull().references(() => restaurantTablesTable.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  scansCount: integer("scans_count").notNull().default(0),
  ordersCount: integer("orders_count").notNull().default(0),
  lastScannedAt: timestamp("last_scanned_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type QrToken = typeof qrTokensTable.$inferSelect;
export type InsertQrToken = typeof qrTokensTable.$inferInsert;
