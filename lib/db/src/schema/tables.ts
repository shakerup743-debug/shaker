import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const restaurantTablesTable = pgTable("restaurant_tables", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  number: text("number").notNull(),
  capacity: integer("capacity").notNull().default(4),
  status: text("status").notNull().default("available"),
  posX: integer("pos_x").notNull().default(0),
  posY: integer("pos_y").notNull().default(0),
  shape: text("shape").notNull().default("rectangle"),
  section: text("section").notNull().default("main"),
  isActive: boolean("is_active").notNull().default(true),
  currentOrderId: integer("current_order_id"),
  occupiedSince: timestamp("occupied_since", { withTimezone: true }),
  customerName: text("customer_name"),
  guestCount: integer("guest_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("restaurant_tables_tenant_number_idx").on(table.tenantId, table.number),
  index("restaurant_tables_tenant_idx").on(table.tenantId),
]);

export const tableReservationsTable = pgTable("table_reservations", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").notNull().references(() => restaurantTablesTable.id, { onDelete: "cascade" }),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  guestCount: integer("guest_count").notNull().default(1),
  reservationTime: timestamp("reservation_time", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRestaurantTableSchema = createInsertSchema(restaurantTablesTable).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  currentOrderId: true,
  occupiedSince: true,
});

export const insertTableReservationSchema = createInsertSchema(tableReservationsTable).omit({ id: true, createdAt: true });

export type InsertRestaurantTable = z.infer<typeof insertRestaurantTableSchema>;
export type RestaurantTable = typeof restaurantTablesTable.$inferSelect;
export type TableReservation = typeof tableReservationsTable.$inferSelect;
