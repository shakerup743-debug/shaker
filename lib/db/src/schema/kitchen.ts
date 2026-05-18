import { pgTable, serial, timestamp, text, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const kitchenTicketsTable = pgTable("kitchen_tickets", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().unique(),
  status: text("status").notNull().default("new"), // new | in_progress | ready | completed
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertKitchenTicketSchema = createInsertSchema(kitchenTicketsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertKitchenTicket = z.infer<typeof insertKitchenTicketSchema>;
export type KitchenTicket = typeof kitchenTicketsTable.$inferSelect;
