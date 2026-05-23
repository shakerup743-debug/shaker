import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const USER_ROLES = [
  "platform_admin",  // cross-tenant super-admin (Foodoro platform staff only)
  "owner",
  "area_manager",
  "branch_manager",
  "cashier",
  "waiter",
  "kitchen_staff",
  "accountant",
  "hr",
  "inventory_manager",
  "admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  platform_admin: ["*"],  // full cross-tenant access
  owner: ["*"],
  admin: ["*"],
  area_manager: [
    "branches:read", "branches:write",
    "reports:read", "orders:read",
    "staff:read", "inventory:read",
    "products:read", "customers:read",
  ],
  branch_manager: [
    "orders:read", "orders:write",
    "products:read", "products:write",
    "inventory:read", "inventory:write",
    "staff:read", "reports:read",
    "customers:read", "tables:read", "tables:write",
    "kitchen:read", "kitchen:write",
    "coupons:read",
  ],
  cashier: [
    "orders:read", "orders:write",
    "products:read", "categories:read",
    "customers:read", "customers:write",
    "tables:read", "tables:write",
    "coupons:read",
  ],
  waiter: [
    "orders:read", "orders:write",
    "products:read", "categories:read",
    "tables:read", "tables:write",
    "customers:read",
  ],
  kitchen_staff: [
    "kitchen:read", "kitchen:write",
    "orders:read", "products:read",
    "inventory:read",
  ],
  accountant: [
    "reports:read", "orders:read",
    "inventory:read", "suppliers:read",
    "coupons:read",
  ],
  hr: [
    "staff:read", "staff:write",
    "reports:read",
  ],
  inventory_manager: [
    "inventory:read", "inventory:write",
    "products:read", "suppliers:read", "suppliers:write",
    "reports:read",
  ],
};

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id"),
  branchId: integer("branch_id"),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull().default(""),
  role: text("role").notNull().default("cashier"),
  clerkId: text("clerk_id").unique(),
  phone: text("phone"),
  avatar: text("avatar"),
  isActive: boolean("is_active").notNull().default(true),
  pin: text("pin"),  // bcrypt hash of 6-digit cashier PIN
  // Shift window — PIN-login is rejected outside [shiftStartsAt, shiftEndsAt].
  // NULL on both sides = 24/7 access. Set by admin when registering the staff.
  shiftStartsAt: timestamp("shift_starts_at", { withTimezone: true }),
  shiftEndsAt:   timestamp("shift_ends_at",   { withTimezone: true }),
  // Optional kill-switch (admin can disable a user's PIN without deleting them).
  pinDisabledAt: timestamp("pin_disabled_at", { withTimezone: true }),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"),
  mfaSecretPending: text("mfa_secret_pending"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
