import { pgTable, text, serial, timestamp, numeric, integer, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const wasteReasonEnum = pgEnum("waste_reason", ["spoilage", "burning", "expiry", "prep_error", "theft", "other"]);

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("0"),
  unit: text("unit").notNull().default("pcs"),
  lowStockThreshold: numeric("low_stock_threshold", { precision: 10, scale: 2 }).notNull().default("10"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("inventory_tenant_qty_idx").on(table.tenantId, table.quantity),
]);

export const inventoryConsumptionLogTable = pgTable("inventory_consumption_log", {
  id: serial("id").primaryKey(),
  inventoryId: integer("inventory_id").notNull().references(() => inventoryTable.id, { onDelete: "restrict" }),
  orderId: integer("order_id").notNull(),
  quantityUsed: numeric("quantity_used", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productIngredientsTable = pgTable("product_ingredients", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  inventoryId: integer("inventory_id").notNull().references(() => inventoryTable.id, { onDelete: "restrict" }),
  quantityPerUnit: numeric("quantity_per_unit", { precision: 10, scale: 4 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const wasteLogsTable = pgTable("waste_logs", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  inventoryId: integer("inventory_id").references(() => inventoryTable.id, { onDelete: "set null" }),
  inventoryName: text("inventory_name").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 4 }).notNull(),
  unit: text("unit").notNull(),
  reason: wasteReasonEnum("reason").notNull().default("other"),
  notes: text("notes"),
  loggedBy: text("logged_by"),
  costEstimate: numeric("cost_estimate", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductIngredientSchema = createInsertSchema(productIngredientsTable).omit({ id: true, createdAt: true });
export const insertWasteLogSchema = createInsertSchema(wasteLogsTable).omit({ id: true, createdAt: true });
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type InventoryItem = typeof inventoryTable.$inferSelect;
export type ProductIngredient = typeof productIngredientsTable.$inferSelect;
export type InventoryConsumptionLog = typeof inventoryConsumptionLogTable.$inferSelect;
export type WasteLog = typeof wasteLogsTable.$inferSelect;
