import { type ReactNode } from "react";
import { hasPermission, getCurrentRole, type Permission, type Role } from "@/lib/permissions";

interface CanProps {
  perm: Permission;
  role?: Role | string | null;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally render `children` if the current user (or the supplied
 * role) has the required permission. Use everywhere actions can be hidden.
 */
export function Can({ perm, role, fallback = null, children }: CanProps): JSX.Element {
  const effective = role ?? getCurrentRole();
  return <>{hasPermission(effective, perm) ? children : fallback}</>;
}
