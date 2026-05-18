import { pgTable, text, serial, timestamp, integer, numeric, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const customersTable = pgTable("customers", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  email: text("email"),
  notes: text("notes"),
  totalOrders: integer("total_orders").notNull().default(0),
  totalSpent: numeric("total_spent", { precision: 10, scale: 2 }).notNull().default("0"),
  loyaltyPoints: integer("loyalty_points").notNull().default(0),
  loyaltyTier: text("loyalty_tier").notNull().default("bronze"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("customers_tenant_phone_idx").on(table.tenantId, table.phone),
  index("customers_tenant_idx").on(table.tenantId),
]);

export const customerNotesTable = pgTable("customer_notes", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  note: text("note").notNull(),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const loyaltyTransactionsTable = pgTable("loyalty_transactions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull().references(() => customersTable.id, { onDelete: "cascade" }),
  points: integer("points").notNull(),
  type: text("type").notNull().default("earn"),
  reason: text("reason"),
  orderId: integer("order_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  totalOrders: true,
  totalSpent: true,
  loyaltyPoints: true,
  loyaltyTier: true,
});

export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;
export type CustomerNote = typeof customerNotesTable.$inferSelect;
export type LoyaltyTransaction = typeof loyaltyTransactionsTable.$inferSelect;
