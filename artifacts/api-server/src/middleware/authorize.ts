import { type Request, type Response, type NextFunction } from "express";
import { ROLE_PERMISSIONS, type UserRole } from "@workspace/db";

export type { UserRole };

export function authorize(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (roles.length > 0 && !roles.includes(req.user.role as UserRole)) {
      res.status(403).json({ error: "Insufficient permissions", required: roles });
      return;
    }
    next();
  };
}

export function authorizePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const role = req.user.role as UserRole;
    const perms = ROLE_PERMISSIONS[role] ?? [];
    if (perms.includes("*") || perms.includes(permission)) {
      next();
      return;
    }
    res.status(403).json({ error: "Insufficient permissions", required: permission });
  };
}

export function authorizeOwnerOrAdmin() {
  return authorize("owner", "admin");
}

export function authorizeBranchManager() {
  return authorize("owner", "admin", "branch_manager", "area_manager");
}

export function authorizeFinancial() {
  return authorize("owner", "admin", "accountant", "area_manager");
}

export function authorizeInventory() {
  return authorize("owner", "admin", "inventory_manager", "branch_manager", "area_manager");
}

export function authorizeKitchen() {
  return authorize("owner", "admin", "kitchen_staff", "branch_manager");
}
