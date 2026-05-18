// PIN management — set/change PIN for a user
// Mounted under authenticated + tenant-scoped router
import { Router } from "express";
import bcrypt from "bcryptjs";
import { usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { authorize } from "../middleware/authorize.js";
import { requireTenant } from "../middleware/require-tenant.js";
import { logAudit } from "../lib/audit.js";

const router = Router();
router.use(requireTenant);

// PATCH /api/users/:id/pin — set or clear a user's PIN
// Admin/owner can set any user's PIN; users can set their own
router.patch("/users/:id/pin", async (req, res): Promise<void> => {
  const tid = req.tenantId!;
  const targetId = parseInt(req.params.id as string);
  const callerId = parseInt(req.user!.sub, 10);
  const callerRole = req.user!.role;

  const ADMIN_ROLES = ["admin", "owner", "branch_manager"];
  const isSelf = callerId === targetId;
  const isAdmin = ADMIN_ROLES.includes(callerRole);

  if (!isSelf && !isAdmin) {
    res.status(403).json({ error: "Cannot set PIN for another user" });
    return;
  }

  const { pin } = req.body as { pin?: string | null };

  // Clearing PIN
  if (pin === null || pin === "") {
    if (!isAdmin) {
      res.status(403).json({ error: "Only admins can remove a PIN" });
      return;
    }
    await req.db!
      .update(usersTable)
      .set({ pin: null, updatedAt: new Date() })
      .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tid)));
    void logAudit(req, "pin_cleared", "users", targetId, { clearedBy: callerId });
    res.json({ ok: true, message: "PIN cleared" });
    return;
  }

  if (!pin || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: "PIN must be exactly 6 digits" });
    return;
  }

  const hashed = await bcrypt.hash(pin, 10);
  const [user] = await req.db!
    .update(usersTable)
    .set({ pin: hashed, updatedAt: new Date() })
    .where(and(eq(usersTable.id, targetId), eq(usersTable.tenantId, tid)))
    .returning({ id: usersTable.id, name: usersTable.name });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  void logAudit(req, "pin_set", "users", user.id, { setBy: callerId });
  res.json({ ok: true, message: "PIN set successfully" });
});

export default router;
