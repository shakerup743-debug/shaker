/**
 * Role-Based Access Control matrix.
 *
 * 10 canonical roles → permission set. Use `<Can />` or `hasPermission`
 * to gate UI elements. All checks happen client-side; the backend enforces
 * the same matrix via the `requireRole` middleware so don't rely on this
 * alone for security.
 */

export type Role =
  | "super_admin"
  | "owner"
  | "manager"
  | "cashier"
  | "waiter"
  | "kitchen"
  | "bar"
  | "accountant"
  | "inventory"
  | "viewer";

export const ROLE_LABELS: Record<Role, { en: string; ar: string }> = {
  super_admin: { en: "Super Admin", ar: "مدير عام" },
  owner:       { en: "Owner",        ar: "مالك" },
  manager:     { en: "Manager",      ar: "مدير فرع" },
  cashier:     { en: "Cashier",      ar: "كاشير" },
  waiter:      { en: "Waiter",       ar: "نادل" },
  kitchen:     { en: "Kitchen",      ar: "مطبخ" },
  bar:         { en: "Bar",          ar: "بار" },
  accountant:  { en: "Accountant",   ar: "محاسب" },
  inventory:   { en: "Inventory",    ar: "مخزن" },
  viewer:      { en: "Viewer",       ar: "مشاهد" },
};

export type Permission =
  | "pos.use"
  | "pos.refund"
  | "pos.discount"
  | "kitchen.view"
  | "kitchen.update"
  | "kitchen.availability"
  | "orders.view"
  | "orders.cancel"
  | "products.manage"
  | "categories.manage"
  | "inventory.manage"
  | "suppliers.manage"
  | "customers.manage"
  | "reports.view"
  | "reports.advanced"
  | "staff.manage"
  | "settings.manage"
  | "billing.manage"
  | "audit.view"
  | "security.manage"
  | "tenant.manage";

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
  cashier: [
    "pos.use","pos.discount","orders.view","kitchen.view","customers.manage",
  ],
  waiter: [
    "pos.use","orders.view","kitchen.view","customers.manage",
  ],
  kitchen: [
    "kitchen.view","kitchen.update","kitchen.availability","orders.view",
  ],
  bar: [
    "kitchen.view","kitchen.update","orders.view",
  ],
  accountant: [
    "reports.view","reports.advanced","orders.view","billing.manage","audit.view",
  ],
  inventory: [
    "inventory.manage","suppliers.manage","products.manage","categories.manage","reports.view",
  ],
  viewer: [
    "orders.view","reports.view","kitchen.view",
  ],
};

export function hasPermission(role: Role | string | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  const list = PERMISSIONS[role as Role];
  return Array.isArray(list) && list.includes(perm);
}

export function getCurrentRole(): Role | null {
  // user object is stored by the auth flow in localStorage under foodoro-user.
  try {
    const raw = localStorage.getItem("foodoro-user");
    if (!raw) return null;
    const u = JSON.parse(raw) as { role?: string };
    return (u.role as Role) ?? null;
  } catch {
    return null;
  }
}
