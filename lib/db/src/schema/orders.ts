import { pgTable, text, serial, timestamp, numeric, integer, index, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { customersTable } from "./customers";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  orderNumber: text("order_number").notNull().unique(),
  type: text("type").notNull().default("dine_in"), // dine_in | takeaway | delivery
  status: text("status").notNull().default("pending"), // pending | preparing | ready | completed | cancelled
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 10, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 10, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 10, scale: 2 }).notNull().default("0"),
  paymentMethod: text("payment_method"), // cash | card | mixed
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }),
  changeAmount: numeric("change_amount", { precision: 10, scale: 2 }),
  tableNumber: text("table_number"),
  notes: text("notes"),
  generalNote: text("general_note"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  source: text("source").default("pos"),
  kitchenReadyAt: timestamp("kitchen_ready_at", { withTimezone: true }),
  attachmentUrl: text("attachment_url"),
  completionToken: text("completion_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (table) => [
  index("orders_tenant_date_idx").on(table.tenantId, table.createdAt),
  index("orders_tenant_status_idx").on(table.tenantId, table.status),
]);

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
  baseUnitPrice: numeric("base_unit_price", { precision: 10, scale: 2 }),
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  notes: text("notes"),
  itemNote: text("item_note"),
  selectedOptions: jsonb("selected_options").$type<SelectedOption[]>().notNull().default([]),
});

// Snapshot of a chosen option saved inside the order item.
export interface SelectedOption {
  groupId: string;
  groupName: string;
  itemId: string;
  itemName: string;
  priceDelta: number;
}

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({ id: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type Order = typeof ordersTable.$inferSelect;
export type OrderItem = typeof orderItemsTable.$inferSelect;
