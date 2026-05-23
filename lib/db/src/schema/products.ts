import { pgTable, text, serial, timestamp, boolean, numeric, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const UNAVAILABILITY_REASONS = ["out_of_stock", "temp_unavailable", "ended_today", "ingredient_out", "paused"] as const;
export type UnavailabilityReason = typeof UNAVAILABILITY_REASONS[number];

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  categoryId: integer("category_id").notNull(),
  imageUrl: text("image_url"),
  kitchenAvailable: boolean("kitchen_available").notNull().default(true),
  unavailabilityReason: text("unavailability_reason"),
  unavailableUntil: timestamp("unavailable_until", { withTimezone: true }),
  optionGroups: jsonb("option_groups").$type<ProductOptionGroup[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// Product option group — e.g. "Size", "Toppings". Stored as JSON on products row.
export interface ProductOptionItem {
  id: string;                  // stable identifier (uuid or slug)
  name: string;                // displayed label
  nameEn?: string;             // english label (optional)
  priceDelta: number;          // amount added to base price when selected
  isDefault?: boolean;         // pre-selected on POS open
}

export interface ProductOptionGroup {
  id: string;
  name: string;                // e.g. "الحجم"
  nameEn?: string;             // e.g. "Size"
  required: boolean;           // at least one choice must be picked
  multiSelect: boolean;        // false = single radio, true = multi-select
  maxSelect?: number;          // upper bound when multiSelect = true
  items: ProductOptionItem[];
}

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

export const productAvailabilityLogTable = pgTable("product_availability_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").default(1).references(() => tenantsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  action: text("action").notNull(),
  reason: text("reason"),
  reasonNote: text("reason_note"),
  changedBy: text("changed_by").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProductAvailabilityLog = typeof productAvailabilityLogTable.$inferSelect;
