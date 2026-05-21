/**
 * RBAC middleware — mirrors the role→permission matrix used on the
 * frontend (`apps/foodoro/src/lib/permissions.ts`).
 *
 * Usage:
 *   router.post("/orders", requirePermission("pos.use"), handler);
 *
 * 401 → not authenticated
 * 403 → authenticated but missing the permission
 */
import type { Request, Response, NextFunction } from "express";

export type Role =
  | "super_admin" | "owner" | "manager" | "cashier" | "waiter"
  | "kitchen" | "bar" | "accountant" | "inventory" | "viewer";

export type Permission =
  | "pos.use" | "pos.refund" | "pos.discount"
  | "kitchen.view" | "kitchen.update" | "kitchen.availability"
  | "orders.view" | "orders.cancel"
  | "products.manage" | "categories.manage" | "inventory.manage"
  | "suppliers.manage" | "customers.manage"
  | "reports.view" | "reports.advanced"
  | "staff.manage" | "settings.manage"
  | "billing.manage" | "audit.view" | "security.manage" | "tenant.manage";

const ALL: Permission[] = [
  "pos.use","pos.refund","pos.discount",
  "kitchen.view","kitchen.update","kitchen.availability",
  "orders.view","orders.cancel",
  "products.manage","categories.manage","inventory.manage","suppliers.manage","customers.manage",
  "reports.view","reports.advanced","staff.manage","settings.manage",
  "billing.manage","audit.view","security.manage","tenant.manage",
];

export const PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL,
  owner: ALL.filter((p) => p !== "tenant.manage"),
  manager: [
    "pos.use","pos.refund","pos.discount",
    "kitchen.view","kitchen.update","kitchen.availability",
    "orders.view","orders.cancel",
    "products.manage","categories.manage","inventory.manage","customers.manage","suppliers.manage",
    "reports.view","reports.advanced","staff.manage","settings.manage","audit.view",
  ],
  cashier: ["pos.use","pos.discount","orders.view","kitchen.view","customers.manage"],
  waiter:  ["pos.use","orders.view","kitchen.view","customers.manage"],
  kitchen: ["kitchen.view","kitchen.update","kitchen.availability","orders.view"],
  bar:     ["kitchen.view","kitchen.update","orders.view"],
  accountant: ["reports.view","reports.advanced","orders.view","billing.manage","audit.view"],
  inventory:  ["inventory.manage","suppliers.manage","products.manage","categories.manage","reports.view"],
  viewer:     ["orders.view","reports.view","kitchen.view"],
};

export function roleHasPermission(role: string | undefined | null, perm: Permission): boolean {
  if (!role) return false;
  const list = PERMISSIONS[role as Role];
  return Array.isArray(list) && list.includes(perm);
}

export function requirePermission(perm: Permission) {
  return function (req: Request, res: Response, next: NextFunction): void {
    const role = (req as Request & { user?: { role?: string } }).user?.role;
    if (!role) { res.status(401).json({ error: "UNAUTHENTICATED" }); return; }
    if (!roleHasPermission(role, perm)) {
      res.status(403).json({ error: "FORBIDDEN", required: perm, role });
      return;
    }
    next();
  };
}
