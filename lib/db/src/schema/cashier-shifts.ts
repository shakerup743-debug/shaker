import { pgTable, serial, integer, text, timestamp, numeric, boolean } from "drizzle-orm/pg-core";

export const cashierShiftsTable = pgTable("cashier_shifts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  userRole: text("user_role").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  orderCount: integer("order_count").notNull().default(0),
  totalSales: numeric("total_sales", { precision: 12, scale: 2 }).notNull().default("0"),
  totalReturns: numeric("total_returns", { precision: 12, scale: 2 }).notNull().default("0"),
  totalDiscounts: numeric("total_discounts", { precision: 12, scale: 2 }).notNull().default("0"),
  totalCancellations: integer("total_cancellations").notNull().default(0),
  isClosed: boolean("is_closed").notNull().default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CashierShift = typeof cashierShiftsTable.$inferSelect;
export type InsertCashierShift = typeof cashierShiftsTable.$inferInsert;
