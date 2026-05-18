import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  notes: text("notes"),
  leadTimeDays: integer("lead_time_days").notNull().default(1),
  paymentTerms: text("payment_terms").notNull().default("cash"),
  rating: numeric("rating", { precision: 3, scale: 1 }).default("5.0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const supplierOrdersTable = pgTable("supplier_orders", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  expectedDelivery: timestamp("expected_delivery", { withTimezone: true }),
  notes: text("notes"),
  totalCost: numeric("total_cost", { precision: 10, scale: 2 }).default("0"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const supplierOrderItemsTable = pgTable("supplier_order_items", {
  id: serial("id").primaryKey(),
  supplierOrderId: integer("supplier_order_id").notNull().references(() => supplierOrdersTable.id, { onDelete: "cascade" }),
  inventoryId: integer("inventory_id"),
  itemName: text("item_name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("pcs"),
  unitCost: numeric("unit_cost", { precision: 10, scale: 2 }).notNull().default("0"),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertSupplierOrderSchema = createInsertSchema(supplierOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;
export type SupplierOrder = typeof supplierOrdersTable.$inferSelect;
