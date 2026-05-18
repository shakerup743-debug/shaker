import { pgTable, text, serial, timestamp, boolean, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  logo: text("logo"),
  primaryColor: text("primary_color").notNull().default("#E67E22"),
  currency: text("currency").notNull().default("SAR"),
  taxRate: text("tax_rate").notNull().default("15"),
  taxInclusive: boolean("tax_inclusive").notNull().default(true),
  country: text("country").notNull().default("SA"),
  timezone: text("timezone").notNull().default("Asia/Riyadh"),
  subscriptionPlan: text("subscription_plan").notNull().default("starter"),
  subscriptionStatus: text("subscription_status").notNull().default("active"),
  subscriptionExpiresAt: timestamp("subscription_expires_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  settings: jsonb("settings"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  nameAr: text("name_ar"),
  address: text("address"),
  city: text("city"),
  phone: text("phone"),
  managerId: integer("manager_id"),
  isActive: boolean("is_active").notNull().default(true),
  settings: jsonb("settings"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertBranchSchema = createInsertSchema(branchesTable).omit({ id: true, createdAt: true, updatedAt: true });

export type Tenant = typeof tenantsTable.$inferSelect;
export type Branch = typeof branchesTable.$inferSelect;
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type InsertBranch = z.infer<typeof insertBranchSchema>;

export type SubscriptionPlan = "starter" | "professional" | "enterprise";
export type SubscriptionStatus = "active" | "trial" | "expired" | "suspended";
