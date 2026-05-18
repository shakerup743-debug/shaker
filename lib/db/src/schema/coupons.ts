import { pgTable, text, serial, timestamp, integer, numeric, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const couponsTable = pgTable("coupons", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  description: text("description"),
  type: text("type").notNull().default("percentage"),
  value: numeric("value", { precision: 10, scale: 2 }).notNull(),
  minOrderAmount: numeric("min_order_amount", { precision: 10, scale: 2 }).default("0"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  maxUsesPerCustomer: integer("max_uses_per_customer").default(1),
  validFrom: timestamp("valid_from", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("coupons_tenant_code_idx").on(table.tenantId, table.code),
  index("coupons_tenant_idx").on(table.tenantId),
]);

export const couponUsageTable = pgTable("coupon_usage", {
  id: serial("id").primaryKey(),
  couponId: integer("coupon_id").notNull().references(() => couponsTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id"),
  customerId: integer("customer_id"),
  discountAmount: numeric("discount_amount", { precision: 10, scale: 2 }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCouponSchema = createInsertSchema(couponsTable).omit({
  id: true,
  tenantId: true,
  createdAt: true,
  updatedAt: true,
  usedCount: true,
});

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;
export type CouponUsage = typeof couponUsageTable.$inferSelect;
