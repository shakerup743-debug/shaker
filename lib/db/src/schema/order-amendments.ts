import { pgTable, serial, integer, text, numeric, timestamp } from "drizzle-orm/pg-core";

export const orderAmendmentsTable = pgTable("order_amendments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1),
  orderId: integer("order_id").notNull(),
  orderNumber: text("order_number").notNull(),
  type: text("type").notNull(),
  reason: text("reason").notNull(),
  customerName: text("customer_name").notNull(),
  customerPhone: text("customer_phone"),
  cashierId: integer("cashier_id").notNull(),
  cashierName: text("cashier_name").notNull(),
  cashierRole: text("cashier_role"),
  amountBefore: numeric("amount_before"),
  amountAfter: numeric("amount_after"),
  discountAmount: numeric("discount_amount"),
  printed: text("printed").notNull().default("no"),
  printedAt: timestamp("printed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type OrderAmendment = typeof orderAmendmentsTable.$inferSelect;
export type OrderAmendmentInsert = typeof orderAmendmentsTable.$inferInsert;
export type AmendmentType = "cancel" | "discount" | "return" | "edit";
